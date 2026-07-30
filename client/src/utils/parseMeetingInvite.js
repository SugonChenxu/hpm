// 解析腾讯会议 / 全时会议等邀请文本，提取：会议主题、日期、时间、入会链接。
// 纯前端工具，无外部依赖；解析以"提取时刻 base"为基准换算相对时间（今天/明天/下周X）。
//
// 返回：
//   ok        boolean  是否成功识别出日期或时间
//   title     string   会议主题
//   date      Date|null 解析出的日期（用于定位到对应周）
//   weekday   string|null  周一~周六（会议计划不含周日，周日返回 null 并告警）
//   start_time/end_time  "HH:MM"
//   meeting_url  string   入会链接
//   warnings  string[]   非致命提示（时间越界、周日等）
//   error     string    致命错误（OK=false 时）

const WEEKDAY_CN = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const WEEKDAYS_VALID = ["周一", "周二", "周三", "周四", "周五", "周六"];

function pad2(n) {
  return String(n).padStart(2, "0");
}

// 解析单个时间点 token（如 "下午3:00" / "15:00" / "3点"），periodHint 为整段推断的上午/下午
function parseTimePointToken(token, periodHint) {
  let period = periodHint;
  if (/下午|晚上|晚间|傍晚/.test(token)) period = "pm";
  else if (/上午|早上|凌晨|早晨/.test(token)) period = "am";
  else if (/中午/.test(token)) {
    const mm = token.match(/:(\d{2})/);
    return { h: 12, m: mm ? parseInt(mm[1], 10) : 0 };
  }
  const m = token.match(/(\d{1,2})(?:[:：](\d{2}))?/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  let min = m[2] != null ? parseInt(m[2], 10) : 0;
  if (period === "pm" && h < 12) h += 12;
  if (period === "am" && h === 12) h = 0;
  if (h > 23) h = 23;
  if (min > 59) min = 59;
  return { h, m: min };
}

// 从整段文本提取时间范围（优先范围，否则单点默认+1小时）
function extractTime(raw, warnings) {
  const hasPm = /下午|晚上|晚间|傍晚/.test(raw);
  const hasAm = /上午|早上|凌晨|早晨/.test(raw);
  const periodHint = hasPm ? "pm" : hasAm ? "am" : null;

  // 范围：A - B（支持 - ~ — – 至 到）
  const rangeRe = /(\d{1,2}(?:[:：]\d{2})?)\s*[-~—–至到]\s*(\d{1,2}(?:[:：]\d{2})?)/;
  const rm = raw.match(rangeRe);
  if (rm) {
    const a = parseTimePointToken(rm[1], periodHint);
    const b = parseTimePointToken(rm[2], periodHint);
    if (a && b) {
      if (b.h * 60 + b.m <= a.h * 60 + a.m) {
        warnings.push("识别到的时间范围结束早于开始，已忽略时间");
        return null;
      }
      return { start: a, end: b };
    }
  }

  // 单点：下午3点 / 15:00 / 3点
  const singleRe = /(下午|晚上|晚间|傍晚|上午|早上|凌晨|早晨|中午)?\s*(\d{1,2})(?:[:：](\d{2}))?\s*点?/;
  const sm = raw.match(singleRe);
  if (sm) {
    const token = (sm[1] || "") + sm[2] + (sm[3] ? ":" + sm[3] : "");
    const p = parseTimePointToken(token, periodHint);
    if (p) {
      const end = { h: p.h + 1, m: p.m };
      if (end.h > 23) end.h = 23;
      return { start: p, end };
    }
  }
  return null;
}

// 从整段文本提取日期（绝对 > 中文月日 > 相对）
function extractDate(raw, base) {
  const b = new Date(base);
  b.setHours(0, 0, 0, 0);

  // 绝对：2026/07/30 或 2026-07-30
  const abs = raw.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (abs) {
    const d = new Date(+abs[1], +abs[2] - 1, +abs[3]);
    if (!isNaN(d)) return d;
  }
  // 中文：7月30日 / 7月30号
  const cn = raw.match(/(\d{1,2})月(\d{1,2})[日号]/);
  if (cn) {
    const d = new Date(b.getFullYear(), +cn[1] - 1, +cn[2]);
    if (!isNaN(d)) return d;
  }
  // 相对：今天/明天/后天/大后天/昨天
  let delta = null;
  if (/大后天/.test(raw)) delta = 3;
  else if (/后天/.test(raw)) delta = 2;
  else if (/明天|明日/.test(raw)) delta = 1;
  else if (/昨天|昨日/.test(raw)) delta = -1;
  else if (/今天|今日|今晚|今早|今晨/.test(raw)) delta = 0;
  if (delta !== null) {
    const d = new Date(b);
    d.setDate(d.getDate() + delta);
    return d;
  }
  // 星期：下周一.. / 周一..
  const wdMap = { 日: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };
  const wm = raw.match(/(下)?(?:星期|周)([日一二三四五六])/);
  if (wm) {
    const target = wdMap[wm[2]];
    const isNext = !!wm[1];
    let diff = (target - b.getDay() + 7) % 7;
    if (isNext) diff = diff === 0 ? 7 : diff + 7; // 下周：至少 +7 天
    const d = new Date(b);
    d.setDate(d.getDate() + diff);
    return d;
  }
  return null;
}

// 把时间钳制到课表范围（09:00-21:00），越界给告警
function clampTime(t, minH, maxH, maxM, warnings, label) {
  let [h, m] = t.split(":").map(Number);
  if (h < minH) {
    h = minH; m = 0;
    warnings.push(`${label}早于${minH}:00，已调整为${minH}:00`);
  } else if (h > maxH || (h === maxH && m > maxM)) {
    h = maxH; m = maxM;
    warnings.push(`${label}超出课表范围，已调整为${maxH}:${pad2(maxM)}`);
  }
  return pad2(h) + ":" + pad2(m);
}

// 清洗标题：去掉日期/时间/星期/时段等噪声词，提取干净主题
function cleanTitle(t) {
  return t
    .replace(/\d{4}[/-]\d{1,2}[/-]\d{1,2}/g, " ")
    .replace(/\d{1,2}月\d{1,2}[日号]/g, " ")
    .replace(/(今天|今日|今晚|今早|今晨|明天|明日|后天|大后天|昨天|昨日|下周?[一二三四五六日]|周[一二三四五六日]|星期[一二三四五六日])/g, " ")
    .replace(/(上午|下午|晚上|晚间|傍晚|早上|凌晨|早晨|中午)/g, " ")
    .replace(/\d{1,2}(?:[:：]\d{2})?\s*[-~—–至到]\s*\d{1,2}(?:[:：]\d{2})?/g, " ")
    .replace(/\d{1,2}(?:[:：]\d{2})?\s*点/g, " ")
    .replace(/[（(]?(?:会议主题|主题|会议名称|标题)[:：]\s*/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[#＃]\S+/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[，,。.、\s]+$/g, "")
    .trim();
}

export function parseMeetingInvite(text, base = new Date()) {
  const warnings = [];
  const raw = (text || "").trim();
  if (!raw) return { ok: false, error: "请粘贴会议邀请文本或链接" };

  // 入会链接
  let meetingUrl = "";
  const um = raw.match(/https?:\/\/[^\s，。、）)】\]]+/i);
  if (um) meetingUrl = um[0].replace(/[）)\]]+$/, "");

  // 会议主题
  let title = "";
  const tm = raw.match(/(?:会议主题|主题|会议名称|标题)[:：]\s*(.+)/);
  if (tm) {
    title = tm[1].trim();
  } else {
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    // 跳过纯应用名首行（腾讯会议 / 全时 等）
    const firstMeaningful = lines.find((l) => !/^(腾讯会议|全时|腾讯云会议|全时云|会议)$/.test(l));
    if (firstMeaningful) title = firstMeaningful;
  }
  const cleanedTitle = cleanTitle(title);
  title = cleanedTitle || title;
  if (title.length > 80) title = title.slice(0, 80);

  const date = extractDate(raw, base);
  // 时间提取前先剥离日期串与链接，避免把年份/URL 中的数字当成时间
  const timeSearchText = raw
    .replace(/\d{4}[/-]\d{1,2}[/-]\d{1,2}/g, " ")
    .replace(/\d{1,2}月\d{1,2}[日号]/g, " ")
    .replace(/https?:\/\/\S+/gi, " ");
  const time = extractTime(timeSearchText, warnings);

  if (!date && !time) {
    return { ok: false, error: "未能识别会议日期或时间，请检查粘贴内容", meetingUrl, title };
  }

  let weekday = null;
  let start_time = "09:00";
  let end_time = "10:00";

  if (date) {
    const wd = WEEKDAY_CN[date.getDay()];
    if (WEEKDAYS_VALID.includes(wd)) weekday = wd;
    else warnings.push(`解析日期为${wd}，会议计划仅含周一~周六，请手动选择星期`);
  } else {
    warnings.push("未识别日期，已默认填入当前周，请核对星期");
  }

  if (time) {
    start_time = pad2(time.start.h) + ":" + pad2(time.start.m);
    end_time = pad2(time.end.h) + ":" + pad2(time.end.m);
  } else {
    warnings.push("未识别具体时间，默认 09:00-10:00，请修改");
  }

  start_time = clampTime(start_time, 9, 20, 30, warnings, "开始时间");
  end_time = clampTime(end_time, 9, 21, 0, warnings, "结束时间");

  return { ok: true, title, date, weekday, start_time, end_time, meeting_url: meetingUrl, warnings };
}

export default parseMeetingInvite;
