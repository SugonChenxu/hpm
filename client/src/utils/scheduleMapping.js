// 排期计划导入：表头模糊识别 + 阶段/普通/节点任务自动区分
// 与 server/src/utils/scheduleMapping.js 保持同一份语义（前端副本）。
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
  ["planned_start", ["开始", "开始时间", "开始日期", "开始日", "起始", "起始时间", "起始日期", "开工", "开工日期", "计划开始", "计划开始日期", "plannedstart", "start", "startdate"]],
  ["planned_end", ["结束", "结束时间", "结束日期", "完成", "完成时间", "完成日期", "截止", "截止日期", "截止时间", "完工", "完工日期", "竣工", "交付日期", "计划结束", "计划结束日期", "plannedend", "end", "enddate"]],
  ["duration_days", ["工期", "工期天", "工期(天)", "天数", "历时", "持续天数", "工作天数", "所需天数", "duration", "durationdays"]],
  ["predecessor", ["前置", "前置任务", "前置条件", "前置依赖", "前置工序", "紧前", "紧前任务", "先行任务", "依赖", "predecessor", "depends"]],
  ["notes", ["备注", "备注说明", "说明", "说明信息", "备注信息", "描述", "注释", "notes", "remark"]],
  ["indentLevel", ["层级", "层次", "缩进", "级别", "等级", "深度", "level", "indent"]],
  ["seq_ignore", ["序号", "seq", "no", "行号"]], // 序号由系统重排，忽略但允许存在
];

function norm(s) {
  return String(s == null ? "" : s).trim().toLowerCase().replace(/\s+/g, "");
}

export function buildFieldMap(headers) {
  const map = {};
  const unmatched = [];
  headers.forEach((h, i) => {
    const hn = norm(h);
    if (!hn) return;
    for (const [field, aliases] of FIELD_ALIASES) {
      if (aliases.map(norm).includes(hn)) {
        if (field !== "seq_ignore") map[field] = i;
        return;
      }
    }
    unmatched.push(h);
  });
  return { map, unmatched };
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
export function toDateStr(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number" && v > 20000 && v < 80000) {
    // Excel 日期序列号（1900 系统）
    return new Date((v - 25569) * 86400 * 1000).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  const m = s.match(DATE_RE);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
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
  const headers = matrix[0].map((h) => (h == null ? "" : String(h)));
  const { map, unmatched } = buildFieldMap(headers);
  const warnings = [];
  const tasks = [];
  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row || row.every((c) => c === "" || c == null)) continue; // 跳过空行
    const get = (f) => (map[f] != null ? row[map[f]] : undefined);
    const name = (get("name") != null ? String(get("name")) : "").trim();
    if (!name) {
      warnings.push(`第 ${r + 1} 行缺少任务名称，已跳过`);
      continue;
    }
    const indent = calcIndent(name, get("indentLevel"));
    const durationRaw = get("duration_days");
    const duration =
      durationRaw !== undefined && durationRaw !== null && durationRaw !== ""
        ? Number(String(durationRaw).replace(/[, ]/g, "")) || null
        : null;
    const taskType = detectTaskType(get("task_type"), name);
    const { start: dStart, end: dEnd, duration: dDur } = deriveDates(
      toDateStr(get("planned_start")),
      toDateStr(get("planned_end")),
      duration,
      taskType
    );
    tasks.push({
      name,
      task_type: taskType,
      planned_start: dStart,
      planned_end: dEnd,
      duration_days: dDur,
      predecessor: get("predecessor") != null ? String(get("predecessor")) : null,
      notes: get("notes") != null ? String(get("notes")) : "",
      indentLevel: indent,
    });
  }
  return { tasks, unmatched, warnings };
}
