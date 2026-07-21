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

export function buildFieldMap(headers) {
  const map = {};
  const unmatched = [];
  headers.forEach((h, i) => {
    const hn = norm(h);
    if (!hn) return;
    // 1) 精确别名匹配
    for (const [field, aliases] of FIELD_ALIASES) {
      if (aliases.map(norm).includes(hn)) {
        if (field !== "seq_ignore") map[field] = i;
        return;
      }
    }
    // 2) 包含关键字兜底
    for (const [field, tokens] of CONTAINS_RULES) {
      if (tokens.some((tok) => hn.includes(norm(tok)))) {
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
    // Excel 日期序列号（1900 系统，现代日期偏移量 25569 已吸收闰年 bug）
    return new Date((v - 25569) * 86400 * 1000).toISOString().slice(0, 10);
  }
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
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
  let currentPhase = null; // 跟踪当前阶段分组（阶段列连续空白表示归属上一阶段）

  const pushTask = (name, taskType, start, end, dur, predecessor, notes, indent) => {
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
  };

  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row || row.every((c) => c === "" || c == null)) continue; // 跳过空行
    const get = (f) => (map[f] != null ? row[map[f]] : undefined);
    const phaseVal = get("phase") != null ? String(get("phase")).trim() : "";

    // 阶段列：有值 → 新阶段（生成阶段任务父节点）；空 → 沿用上一阶段
    let underPhase = false;
    if (phaseVal) {
      if (phaseVal !== currentPhase) {
        // 合成一条「阶段任务」父节点（时间由后端按子任务聚合）
        pushTask(phaseVal, "阶段任务", null, null, null, null, "", 0);
        currentPhase = phaseVal;
      }
      underPhase = true;
    } else if (currentPhase) {
      underPhase = true;
    }

    const name = (get("name") != null ? String(get("name")) : "").trim();
    if (!name) {
      // 阶段已登记，但本行无任务名（纯阶段标题行）→ 跳过任务本身
      continue;
    }

    const indent = underPhase ? 1 : calcIndent(name, get("indentLevel"));
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
    pushTask(name, taskType, dStart, dEnd, dDur, get("predecessor"), get("notes"), indent);
  }
  return { tasks, unmatched, warnings };
}
