// 排期计划导入：表头模糊识别 + 阶段/普通/节点任务自动区分
// 与 client/src/utils/scheduleMapping.js 保持同一份语义（server 端副本）。
// 仅依赖纯字符串 + 日期算术处理，不耦合任何 Excel 库 —— 输入是 string[][] 矩阵。

// ============ 任务类型识别（值 / 关键字） ============
const TASK_TYPE_ALIASES = [
  ["阶段任务", ["阶段", "阶段任务", "大阶段", "phase", "stage"]],
  ["节点任务", ["节点", "里程碑", "节点任务", "关键节点", "milestone"]],
  ["普通任务", ["普通任务", "任务", "普通", "一般任务", "子任务", "task", "normal"]],
];

// ============ 字段别名（中英文常见写法，顺序即优先级） ============
const FIELD_ALIASES = [
  ["name", ["任务", "任务名", "任务名称", "名称", "事项", "工作", "工作项", "工作事项", "活动", "name", "task", "title"]],
  ["task_type", ["任务类型", "任务类别", "类型", "类别", "分类", "类型列", "tasktype", "type"]],
  ["phase", ["阶段", "所属阶段", "阶段分组", "阶段名称", "phase", "group"]],
  ["planned_start", ["开始", "开始时间", "计划开始", "计划开始时间", "计划开始日期", "开始日期", "开始日", "起始", "起始时间", "起始日期", "开工", "开工日期", "开工时间", "计划开工", "plannedstart", "start", "startdate"]],
  ["planned_end", ["结束", "结束时间", "计划完成", "计划完成时间", "计划完成日期", "完成", "完成时间", "完成日期", "截止", "截止日期", "截止时间", "完工", "完工日期", "竣工", "交付日期", "计划结束", "计划结束时间", "计划结束日期", "plannedend", "end", "enddate"]],
  ["duration_days", ["工期", "工期天", "工期(天)", "工期（天）", "天数", "历时", "持续天数", "工作天数", "所需天数", "计划工期", "工作日", "工作日数", "duration", "durationdays"]],
  ["predecessor", ["前置", "前置任务", "前置条件", "前置依赖", "前置工序", "紧前", "紧前任务", "先行任务", "依赖", "predecessor", "depends"]],
  ["notes", ["备注", "备注说明", "说明", "说明信息", "备注信息", "描述", "注释", "notes", "remark"]],
  ["indentLevel", ["层级", "层次", "缩进", "级别", "等级", "深度", "level", "indent"]],
  ["seq_ignore", ["序号", "seq", "no", "行号"]], // 序号由系统重排，忽略但允许存在
];

// 二次容错：精确别名未命中时，按"包含关键字"兜底（优先级自上而下）
const CONTAINS_RULES = [
  ["duration_days", ["工期"]],
  ["planned_start", ["开始", "起始", "开工"]],
  ["planned_end", ["结束", "完成", "截止", "完工", "竣工", "交付"]],
  ["predecessor", ["前置", "依赖", "紧前", "先行"]],
  ["notes", ["备注", "说明", "注释", "描述"]],
  ["indentLevel", ["层级", "缩进", "级别", "等级", "深度"]],
  ["task_type", ["类型", "类别", "分类"]],
  ["phase", ["阶段"]],
  ["name", ["任务", "事项", "工作", "活动"]],
];

// 分组列（多级分组：大阶段/小阶段/阶段/分组…），用于识别「大阶段/小阶段/任务」这类结构
const GROUPING_TOKENS = ["大阶段", "中阶段", "小阶段", "阶段", "分组", "组别", "group", "phase", "stage"];

// 表头关键字（用于扫描定位表头行）
const HEADER_KEYWORDS = [
  "任务", "任务名", "名称", "事项", "工作",
  "开始", "开始时间", "开始日期", "起始", "开工",
  "结束", "完成", "完成时间", "截止", "完工",
  "工期", "天数", "历时",
  "类型", "类别", "阶段",
  "备注", "说明",
];

function norm(s) {
  let t = String(s == null ? "" : s).trim().toLowerCase();
  // 全角 → 半角（括号、短横、空格），避免「工期（天）」「计划开始时间」等匹配失败
  t = t
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")")
    .replace(/[－﹣—–―]/g, "-")
    .replace(/[　]/g, " ");
  return t.replace(/\s+/g, "");
}

/**
 * 扫描矩阵前 N 行，找到最像"表头行"的那一行。
 * 返回 { headerRowIndex, warnings }——导入将从 headerRowIndex 开始取表头，
 * headerRowIndex+1 开始取数据。
 */
export function findHeaderRow(matrix) {
  if (!matrix || !matrix.length) return { headerRowIndex: 0, warnings: [] };
  const maxScan = Math.min(matrix.length, 15);
  let bestIdx = 0, bestScore = 0;

  for (let r = 0; r < maxScan; r++) {
    const row = matrix[r];
    if (!row || row.every((c) => c === "" || c == null)) continue;
    let score = 0;
    const seen = new Set();
    for (const cell of row) {
      const cn = norm(cell);
      if (!cn) continue;
      for (const kw of HEADER_KEYWORDS) {
        if (cn.includes(norm(kw)) && !seen.has(kw)) {
          score++;
          seen.add(kw);
          break;
        }
      }
      // 含核心词额外加分
      if (cn.includes("任务") || cn.includes("开始") || cn.includes("完成")) score += 0.5;
    }
    if (score > bestScore) { bestScore = score; bestIdx = r; }
  }

  const warnings = [];
  if (bestScore < 2) {
    warnings.push(`表头识别置信度较低（得分 ${bestScore}），将首行作为表头`);
  }
  return { headerRowIndex: bestIdx, warnings };
}

export function buildFieldMap(headers) {
  const map = {};
  const unmatched = [];
  const groupCols = [];
  let phaseSet = false;
  headers.forEach((h, i) => {
    const hn = norm(h);
    if (!hn) return;
    // 1) 精确别名匹配
    for (const [field, aliases] of FIELD_ALIASES) {
      if (aliases.map(norm).includes(hn)) {
        if (field !== "seq_ignore") {
          if (field === "phase") {
            if (!phaseSet) {
              map.phase = i;
              phaseSet = true;
            }
          } else {
            map[field] = i;
          }
        }
        break;
      }
    }
    // 2) 分组列判定（排除任务名列本身）
    if (i !== map.name && !groupCols.includes(i) && GROUPING_TOKENS.some((tok) => hn.includes(norm(tok)))) {
      groupCols.push(i);
    }
    // 3) 未匹配表头收集（分组列已识别，不计入未匹配）
    let matched = false;
    for (const [, aliases] of FIELD_ALIASES) {
      if (aliases.map(norm).includes(hn)) {
        matched = true;
        break;
      }
    }
    if (!matched && !groupCols.includes(i)) unmatched.push(h);
  });
  // 向下兼容：未显式映射 phase 但有分组列时，取首个分组列作为单阶段列
  if (map.phase == null && groupCols.length) map.phase = groupCols[0];
  return { map, unmatched, groupCols };
}

const TYPE_KEYWORDS = {
  阶段任务: ["阶段"],
  节点任务: ["里程碑", "节点"],
};

// 阶段/普通/节点 自动判定：
// 1) 优先 "任务类型" 列的值（阶段/里程碑/节点/普通等）
// 2) 回退：行名含关键字（阶段 / 里程碑 / 节点）
// 3) 默认普通任务
export function detectTaskType(rawType, name) {
  const t = norm(rawType);
  if (t) {
    for (const [type, aliases] of TASK_TYPE_ALIASES) {
      if (aliases.map(norm).includes(t)) return type;
    }
    if (["阶段", "stage", "phase"].includes(t)) return "阶段任务";
    if (["节点", "里程碑", "milestone"].includes(t)) return "节点任务";
    if (["普通", "一般", "task", "normal"].includes(t)) return "普通任务";
  }
  const n = norm(name);
  for (const [type, kws] of Object.entries(TYPE_KEYWORDS)) {
    if (kws.map(norm).some((k) => n.includes(k))) return type;
  }
  return "普通任务";
}

function calcIndent(name, indentColVal) {
  if (indentColVal !== undefined && indentColVal !== null && indentColVal !== "") {
    const n = Number(indentColVal);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  const lead = (String(name || "").match(/^[\s\t]+/) || [""])[0];
  if (!lead) return 0;
  const tabs = (lead.match(/\t/g) || []).length;
  const spaces = lead.replace(/\t/g, "  ").length;
  return Math.floor(spaces / 2) + tabs;
}

const DATE_RE = /(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/;
const DATE_RE_CN = /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/; // 2025年12月23日
const MD_RE = /(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/; // 中文「X月X日 / X月X号」
const MDY_RE = /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/; // MM/DD/YYYY 或 DD/MM/YYYY

export function toDateStr(v, assumeYear) {
  if (v == null || v === "") return null;
  if (typeof v === "number" && v > 20000 && v < 80000) {
    // Excel 日期序列号：用 UTC 避免时区偏移导致日期±1天
    const jsDate = new Date(Math.round((v - 25569) * 86400) * 1000);
    const y = jsDate.getUTCFullYear();
    const m = String(jsDate.getUTCMonth() + 1).padStart(2, "0");
    const d = String(jsDate.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (v instanceof Date) {
    // Date 对象：用 UTC 方法避免本地时区偏移
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, "0");
    const d = String(v.getUTCDate()).padStart(2, "0");
    const hours = v.getUTCHours();
    const mins = v.getUTCMinutes();
    // 若时间为 00:00 或接近，可能是纯日期；否则保留时间精度
    if (hours === 0 && mins === 0) {
      return `${y}-${m}-${d}`;
    }
    // xlsx 的 Date 对象可能在本地时区创建 → 退到本地方法
    const ly = v.getFullYear();
    const lm = String(v.getMonth() + 1).padStart(2, "0");
    const ld = String(v.getDate()).padStart(2, "0");
    return `${ly}-${lm}-${ld}`;
  }
  const s = String(v).trim();

  // 1) YYYY/MM/DD 或 YYYY-MM-DD
  const m1 = s.match(DATE_RE);
  if (m1) return `${m1[1]}-${String(m1[2]).padStart(2, "0")}-${String(m1[3]).padStart(2, "0")}`;

  // 2) YYYY年MM月DD日
  const m2 = s.match(DATE_RE_CN);
  if (m2) return `${m2[1]}-${String(m2[2]).padStart(2, "0")}-${String(m2[3]).padStart(2, "0")}`;

  // 3) MM/DD/YYYY 或 DD/MM/YYYY：根据数值大小推断（>12 的数是日）
  const mdy = s.match(MDY_RE);
  if (mdy) {
    const a = Number(mdy[1]), b = Number(mdy[2]), yr = mdy[3];
    if (a > 12) {
      // DD/MM/YYYY（如 23/12/2025）
      return `${yr}-${String(b).padStart(2, "0")}-${String(a).padStart(2, "0")}`;
    }
    if (b > 12) {
      // MM/DD/YYYY（如 12/23/2025）
      return `${yr}-${String(a).padStart(2, "0")}-${String(b).padStart(2, "0")}`;
    }
    // 都 ≤12：默认 MM/DD/YYYY（常见英文 Excel 格式）
    return `${yr}-${String(a).padStart(2, "0")}-${String(b).padStart(2, "0")}`;
  }

  // 4) 仅月日：12月23日、1月6号
  const md = s.match(MD_RE);
  if (md) {
    const y = assumeYear || new Date().getFullYear();
    return `${y}-${String(md[1]).padStart(2, "0")}-${String(md[2]).padStart(2, "0")}`;
  }

  // 5) 纯数字串或无法识别 → 尝试 JS Date 解析作为最后兜底
  if (/^\d+$/.test(s) && Number(s) > 20000 && Number(s) < 80000) {
    // 数字可能是 xlsx 的 Date 类型（raw: false 也可能返回整数串）
    const serial = Number(s);
    const jsDate = new Date(Math.round((serial - 25569) * 86400) * 1000);
    return `${jsDate.getUTCFullYear()}-${String(jsDate.getUTCMonth()+1).padStart(2,"0")}-${String(jsDate.getUTCDate()).padStart(2,"0")}`;
  }

  return s.slice(0, 10) || s;
}

// ============ 开始 / 完成 / 工期 三者互推 ============
function addDaysLocal(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function daysBetweenLocal(startStr, endStr) {
  const s = new Date(startStr + "T00:00:00");
  const e = new Date(endStr + "T00:00:00");
  return Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
}

// 给定任意两个（开始 / 完成 / 工期），推导缺失的那个：
// - 阶段任务：时间由系统聚合，保持原样（通常留空，落库后由子任务回推）
// - 节点任务：单日里程碑，开始 = 完成，工期恒为 1
// - 普通任务：开始+完成→算工期；开始+工期→算完成；完成+工期→反推开始
function deriveDates(start, end, duration, taskType) {
  if (taskType === "阶段任务") {
    // 阶段任务时间通常由子任务聚合回推；若显式给了开始+完成，也先算出工期（无子任务时仍正确显示）
    if (start && end) return { start, end, duration: Math.max(1, daysBetweenLocal(start, end)) };
    return { start, end, duration };
  }
  if (taskType === "节点任务") {
    const s = start || end || null;
    return { start: s, end: s, duration: 1 };
  }
  const hasS = !!start;
  const hasE = !!end;
  const hasD = duration != null && duration !== "" && !isNaN(Number(duration));
  const d = hasD ? Math.max(1, Math.round(Number(duration))) : null;
  if (hasS && hasE && !hasD) {
    return { start, end, duration: Math.max(1, daysBetweenLocal(start, end)) };
  }
  if (hasS && hasD && !hasE) {
    return { start, end: addDaysLocal(start, d - 1), duration: d };
  }
  if (hasE && hasD && !hasS) {
    return { start: addDaysLocal(end, -(d - 1)), end, duration: d };
  }
  if (hasS && !hasE && !hasD) {
    return { start, end: start, duration: 1 };
  }
  if (hasE && !hasS && !hasD) {
    return { start: end, end, duration: 1 };
  }
  if (hasD && !hasS && !hasE) {
    // 仅给出工期：留空日期，由导入落库时锚定到项目起始日
    return { start: null, end: null, duration: d };
  }
  return { start, end, duration: hasD ? d : null };
}

// 将 string[][] 矩阵映射为任务数组
export function mapScheduleMatrix(matrix) {
  if (!matrix || !matrix.length) return { tasks: [], unmatched: [], warnings: [] };

  const { headerRowIndex, warnings: headerWarnings } = findHeaderRow(matrix);
  const headers = matrix[headerRowIndex].map((h) => (h == null ? "" : String(h)));
  const { map, unmatched, groupCols } = buildFieldMap(headers);
  const warnings = [...headerWarnings];
  const tasks = [];
  const get = (row, f) => (map[f] != null ? row[map[f]] : undefined);

  const pushPhase = (name, indent) =>
    tasks.push({ name, task_type: "阶段任务", planned_start: null, planned_end: null, duration_days: null, predecessor: null, notes: "", indentLevel: indent });
  const pushTask = (name, taskType, start, end, dur, predecessor, notes, indent) =>
    tasks.push({
      name,
      task_type: taskType,
      planned_start: start,
      planned_end: end,
      duration_days: dur,
      predecessor: predecessor != null ? String(predecessor) : null,
      notes: notes != null ? String(notes) : "",
      indentLevel: indent,
    });

  const dataStart = headerRowIndex + 1;

  // ---------- 年份推断（针对「X月X日」无年日期） ----------
  // 收集所有「仅月日」的日期单元格，按行顺序推断跨年（如 12月 → 次年1月）。
  const baseYear = new Date().getFullYear();
  const unknownEntries = [];
  for (let r = dataStart; r < matrix.length; r++) {
    for (const f of ["planned_start", "planned_end"]) {
      const raw = get(matrix[r], f);
      if (raw == null || String(raw).trim() === "") continue;
      const s = String(raw).trim();
      if (DATE_RE.test(s)) continue; // 已含年份
      const md = s.match(MD_RE);
      if (md) unknownEntries.push({ r, field: f, month: Number(md[1]), day: Number(md[2]) });
    }
  }
  if (unknownEntries.length) {
    // 年份推断规则：以首个日期所在月为「计划起点月」。
    // - 月份 ≥ 起点月 → 起始年 Y0
    // - 月份 < 起点月 → 次年 Y0+1
    // 这样「多子阶段都从 12月 起步」的并行结构会被正确归到同一起始年，
    // 且仅在跨年边界（如 12月→1月）切换，不会逐行累加年份。
    // Y0 默认当年；若起点月在 11/12 月且计划跨年至次年中（末月 < 起点月），
    // 则取前一年作为起始年，使整段计划连续且不超长。
    const fm = unknownEntries[0].month;
    const lm = unknownEntries[unknownEntries.length - 1].month;
    const startMonth = fm;
    let y0 = baseYear;
    if (startMonth >= 11 && lm < startMonth) y0 = baseYear - 1;
    for (const e of unknownEntries) {
      e.year = e.month >= startMonth ? y0 : y0 + 1;
    }
  }
  const yearMap = new Map();
  for (const e of unknownEntries) yearMap.set(`${e.r}:${e.field}`, e.year);

  const toDur = (raw) =>
    raw !== undefined && raw !== null && raw !== "" ? Number(String(raw).replace(/[, ]/g, "")) || null : null;

  const hasMultiGroup = groupCols.length >= 2; // 大阶段/小阶段/任务 这类多级分组
  let currentPhase = null; // 单阶段列模式：跟踪当前阶段
  const lastGroups = new Array(groupCols.length).fill(""); // 多分组模式：各级当前值（空白沿用上级）
  const emittedPhaseKeys = new Set(); // 避免重复发射阶段节点

  for (let r = dataStart; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row || row.every((c) => c === "" || c == null)) continue; // 跳过空行
    const nameRaw = get(row, "name");
    const name = nameRaw != null ? String(nameRaw).trim() : "";
    const phaseVal = get(row, "phase") != null ? String(get(row, "phase")).trim() : "";

    // ============ 多分组模式（大阶段 / 小阶段 / 任务） ============
    if (hasMultiGroup) {
      // 更新各级当前值：本格有值则更新；空白且上级本行变化则重置，否则沿用（含顶级 g=0）
      const prevLastGroups = lastGroups.slice(); // 上一行快照，用于判断更高级是否本行变化
      for (let g = 0; g < groupCols.length; g++) {
        const cv = row[groupCols[g]] != null ? String(row[groupCols[g]]).trim() : "";
        if (cv !== "") {
          lastGroups[g] = cv;
        } else {
          // 空白单元格：默认沿用上一级（合并单元格/续行写法）；仅当更高级本行发生变化才重置
          let higherChanged = false;
          if (g > 0) {
            for (let h = 0; h < g; h++) {
              const hv = row[groupCols[h]] != null ? String(row[groupCols[h]]).trim() : "";
              if (hv !== "" && hv !== prevLastGroups[h]) {
                higherChanged = true;
                break;
              }
            }
          }
          if (higherChanged) lastGroups[g] = "";
        }
      }
      const curVals = lastGroups.slice();
      let maxLevel = -1;
      for (let g = 0; g < groupCols.length; g++) {
        const gv = curVals[g];
        if (!gv) continue;
        maxLevel = g;
        const key = `${g}:${gv}`;
        if (!emittedPhaseKeys.has(key)) {
          pushPhase(gv, g); // 阶段任务父节点，indent = 层级
          emittedPhaseKeys.add(key);
        }
      }
      // 若「任务」列为纯数字（Excel 日期序列号或工期等）→ 任务名回退到最后一个分组列的值
      // （常见于模板把任务名写在「小阶段」列、日期误放在「任务」列的结构）
      let effectiveName = name;
      let colShifted = false; // 标记列是否整体左移（任务列实际是日期）
      if (/^\d+$/.test(name) && Number(name) > 20000) {
        colShifted = true;
        let fallback = "";
        for (let g = groupCols.length - 1; g >= 0; g--) {
          if (curVals[g]) { fallback = curVals[g]; break; }
        }
        if (fallback) effectiveName = fallback;
      }

      if (!effectiveName) continue; // 纯分组标题行
      const leafIndent = maxLevel + 1;
      const taskType = detectTaskType(get(row, "task_type"), effectiveName);

      // 列偏移修正：当「任务」列实际是数字时，planned_start→name列，planned_end→start列，duration→end列
      const startRaw = colShifted ? get(row, "name") : get(row, "planned_start");
      const endRaw   = colShifted ? get(row, "planned_start") : get(row, "planned_end");
      const durRaw   = colShifted ? get(row, "planned_end") : get(row, "duration_days");
      const { start: dStart, end: dEnd, duration: dDur } = deriveDates(
        toDateStr(startRaw, yearMap.get(`${r}:planned_start`)),
        toDateStr(endRaw, yearMap.get(`${r}:planned_end`)),
        toDur(durRaw),
        taskType
      );
      pushTask(effectiveName, taskType, dStart, dEnd, dDur, get(row, "predecessor"), get(row, "notes"), leafIndent);
      continue;
    }

    // ============ 单阶段列模式（模板：阶段列 + 任务列） ============
    let underPhase = false;
    if (phaseVal) {
      if (phaseVal !== currentPhase) {
        pushPhase(phaseVal, 0);
        currentPhase = phaseVal;
      }
      underPhase = true;
    } else if (currentPhase) {
      underPhase = true;
    }

    if (!name) continue; // 阶段已登记但本行无任务名（纯阶段标题行）→ 跳过任务本身

    const indent = underPhase ? 1 : calcIndent(name, get(row, "indentLevel"));
    const taskType = detectTaskType(get(row, "task_type"), name);
    const { start: dStart, end: dEnd, duration: dDur } = deriveDates(
      toDateStr(get(row, "planned_start"), yearMap.get(`${r}:planned_start`)),
      toDateStr(get(row, "planned_end"), yearMap.get(`${r}:planned_end`)),
      toDur(get(row, "duration_days")),
      taskType
    );
    pushTask(name, taskType, dStart, dEnd, dDur, get(row, "predecessor"), get(row, "notes"), indent);
  }
  return { tasks, unmatched, warnings };
}
