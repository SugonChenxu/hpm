// 排期计划导入：表头模糊识别 + 阶段/普通/节点任务自动区分
// 与 server/src/utils/scheduleMapping.js 保持同一份语义（前端副本）。
// 仅依赖纯字符串处理，不耦合任何 Excel 库 —— 输入是 string[][] 矩阵。

const TASK_TYPE_ALIASES = [
  ["阶段任务", ["阶段", "阶段任务", "phase", "stage"]],
  ["节点任务", ["节点", "里程碑", "节点任务", "milestone"]],
  ["普通任务", ["普通任务", "任务", "普通", "task"]],
];

const FIELD_ALIASES = [
  ["name", ["任务", "任务名", "名称", "事项", "工作项", "name", "task", "title"]],
  ["task_type", ["任务类型", "类型", "类型列", "tasktype", "type"]],
  ["planned_start", ["开始", "开始日期", "起始", "计划开始", "plannedstart", "start", "startdate"]],
  ["planned_end", ["结束", "结束日期", "完成", "截止", "计划结束", "plannedend", "end", "enddate"]],
  ["duration_days", ["工期", "天数", "工期天", "duration", "durationdays"]],
  ["predecessor", ["前置", "前置任务", "依赖", "前置依赖", "predecessor", "depends"]],
  ["notes", ["备注", "说明", "notes", "remark"]],
  ["indentLevel", ["层级", "缩进", "级别", "level", "indent"]],
  ["seq_ignore", ["序号", "seq", "no", "行号"]],
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
// 1) 优先 "任务类型" 列的值；2) 回退名称关键字；3) 默认普通任务
export function detectTaskType(rawType, name) {
  const t = norm(rawType);
  if (t) {
    for (const [type, aliases] of TASK_TYPE_ALIASES) {
      if (aliases.map(norm).includes(t)) return type;
    }
    if (["阶段", "stage", "phase"].includes(t)) return "阶段任务";
    if (["节点", "里程碑", "milestone"].includes(t)) return "节点任务";
    if (["普通", "task"].includes(t)) return "普通任务";
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
    return new Date((v - 25569) * 86400 * 1000).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  const m = s.match(DATE_RE);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
  return s.slice(0, 10) || s;
}

export function mapScheduleMatrix(matrix) {
  if (!matrix || !matrix.length) return { tasks: [], unmatched: [], warnings: [] };
  const headers = matrix[0].map((h) => (h == null ? "" : String(h)));
  const { map, unmatched } = buildFieldMap(headers);
  const warnings = [];
  const tasks = [];
  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row || row.every((c) => c === "" || c == null)) continue;
    const get = (f) => (map[f] != null ? row[map[f]] : undefined);
    const name = (get("name") != null ? String(get("name")) : "").trim();
    if (!name) {
      warnings.push(`第 ${r + 1} 行缺少任务名称，已跳过`);
      continue;
    }
    const indent = calcIndent(name, get("indentLevel"));
    const durationRaw = get("duration_days");
    tasks.push({
      name,
      task_type: detectTaskType(get("task_type"), name),
      planned_start: toDateStr(get("planned_start")),
      planned_end: toDateStr(get("planned_end")),
      duration_days:
        durationRaw !== undefined && durationRaw !== null && durationRaw !== ""
          ? Number(String(durationRaw).replace(/[, ]/g, "")) || null
          : null,
      predecessor: get("predecessor") != null ? String(get("predecessor")) : null,
      notes: get("notes") != null ? String(get("notes")) : "",
      indentLevel: indent,
    });
  }
  return { tasks, unmatched, warnings };
}
