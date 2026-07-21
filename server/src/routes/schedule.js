import { Router } from "express";
import { readdirSync, readFileSync, existsSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import ExcelJS from "exceljs";
import db from "../db.js";
import { mapScheduleMatrix } from "../utils/scheduleMapping.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const router = Router();

// ============================================================
// 工具函数
// ============================================================

/** 模板目录路径 */
const TEMPLATES_DIR = join(__dirname, "..", "templates");

/**
 * 将 ExcelJS 单元格转为字符串（修正日期单元格被吞成空串的问题）
 * - Date 对象 → 本地时区 YYYY-MM-DD（避免 UTC 偏移导致跨天）
 * - 富文本 / 公式结果 → 取文本
 */
function cellValueToStr(cell) {
  const v = cell.value;
  if (v == null) return "";
  if (typeof v === "object") {
    if (v instanceof Date) {
      const y = v.getFullYear();
      const m = String(v.getMonth() + 1).padStart(2, "0");
      const d = String(v.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
    if (typeof v.text === "string" && v.text) return v.text;
    if (v.richText && Array.isArray(v.richText)) {
      return v.richText.map((t) => t.text || "").join("");
    }
    if (v.result != null) return String(v.result);
    if (v.formula != null) return "";
    return "";
  }
  return String(v);
}

/**
 * 格式化日期为本地时区的 YYYY-MM-DD 字符串
 * 避免 toISOString() 将日期转为 UTC 导致跨时区偏移
 */
function formatLocalDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * 获取今日日期字符串 YYYY-MM-DD（本地时区）
 */
function todayStr() {
  return formatLocalDate(new Date());
}

/**
 * 日期加减天数，返回本地时区 YYYY-MM-DD
 */
function addDays(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return formatLocalDate(d);
}

/**
 * 计算两个日期之间的天数（含首尾），即实际工期天数
 */
function daysBetween(startStr, endStr) {
  const s = new Date(startStr + "T00:00:00");
  const e = new Date(endStr + "T00:00:00");
  return Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * 获取项目中所有排期任务（按 task_order 排序，返回扁平列表）
 */
function getProjectTasks(projectId) {
  return db.prepare(
    "SELECT * FROM schedule_tasks WHERE project_id = ? ORDER BY task_order ASC"
  ).all(projectId);
}

/**
 * 将扁平任务列表构建为树形排序结果
 * 深度优先遍历：父任务 → 其子任务（按 task_order）→ 下一个兄弟任务
 * 每个任务附加 depth 字段（0 = 顶级）
 */
function buildTreeOrder(allTasks) {
  // 构建 parent_id → children 映射（null 映射为 0）
  const childrenMap = new Map();
  for (const t of allTasks) {
    const pid = t.parent_id || 0;
    if (!childrenMap.has(pid)) childrenMap.set(pid, []);
    childrenMap.get(pid).push(t);
  }

  // 每组子任务按 task_order 排序
  for (const [, children] of childrenMap) {
    children.sort((a, b) => a.task_order - b.task_order);
  }

  const result = [];

  function traverse(parentId, depth) {
    const children = childrenMap.get(parentId) || [];
    for (const child of children) {
      result.push({ ...child, depth });
      traverse(child.id, depth + 1);
    }
  }

  traverse(0, 0);
  return result;
}

/**
 * 获取树形排序的排期任务列表（供 GET 端点使用）
 */
function getProjectTasksTree(projectId) {
  const allTasks = db.prepare(
    "SELECT * FROM schedule_tasks WHERE project_id = ?"
  ).all(projectId);
  return buildTreeOrder(allTasks);
}

/**
 * 检测添加前置依赖后是否会产生循环依赖
 */
function detectCycle(allTasks, taskId, newPredecessorIds) {
  if (!newPredecessorIds || newPredecessorIds.length === 0) return false;

  const graph = new Map();
  for (const t of allTasks) {
    let preds = [];
    try { preds = JSON.parse(t.predecessor_ids || "[]"); } catch { preds = []; }
    graph.set(t.id, preds);
  }

  graph.set(taskId, [...newPredecessorIds]);

  for (const predId of newPredecessorIds) {
    const visited = new Set();
    const stack = [predId];
    while (stack.length > 0) {
      const current = stack.pop();
      if (current === taskId) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      const parents = graph.get(current) || [];
      for (const p of parents) {
        stack.push(p);
      }
    }
  }
  return false;
}

/**
 * 递归收集某个任务的所有子孙任务的日期极值
 */
function collectDescendantDates(taskId, childrenMap, visited) {
  if (visited.has(taskId)) return { minStart: null, maxEnd: null };
  visited.add(taskId);

  const children = childrenMap.get(taskId) || [];
  let minStart = null;
  let maxEnd = null;

  for (const child of children) {
    if (child.planned_start && (!minStart || child.planned_start < minStart)) {
      minStart = child.planned_start;
    }
    if (child.planned_end && (!maxEnd || child.planned_end > maxEnd)) {
      maxEnd = child.planned_end;
    }

    const sub = collectDescendantDates(child.id, childrenMap, visited);
    if (sub.minStart && (!minStart || sub.minStart < minStart)) {
      minStart = sub.minStart;
    }
    if (sub.maxEnd && (!maxEnd || sub.maxEnd > maxEnd)) {
      maxEnd = sub.maxEnd;
    }
  }

  return { minStart, maxEnd };
}

/**
 * 重新计算所有阶段任务的聚合日期（基于树形结构）
 */
function recalcPhaseAggregation(tasks) {
  if (!tasks || tasks.length === 0) return tasks;

  const childrenMap = new Map();
  for (const t of tasks) {
    const pid = t.parent_id || 0;
    if (!childrenMap.has(pid)) childrenMap.set(pid, []);
    childrenMap.get(pid).push(t);
  }

  const result = tasks.map(t => ({ ...t }));

  for (const task of result) {
    if (task.task_type === "阶段任务") {
      const agg = collectDescendantDates(task.id, childrenMap, new Set());
      if (agg.minStart) {
        task.planned_start = agg.minStart;
      }
      if (agg.maxEnd) {
        task.planned_end = agg.maxEnd;
        task.duration_days = Math.max(1, daysBetween(task.planned_start, task.planned_end));
      }
    }
  }

  return result;
}

/**
 * 级联传播：从 changedTask 开始，递归更新所有后置依赖任务
 */
function cascadePropagation(tasks, changedTaskId) {
  let allTasks = tasks.map(t => ({ ...t }));

  const queue = [changedTaskId];
  const affected = new Set();

  while (queue.length > 0) {
    const currentId = queue.shift();
    for (const t of allTasks) {
      if (affected.has(t.id)) continue;
      let preds = [];
      try { preds = JSON.parse(t.predecessor_ids || "[]"); } catch { preds = []; }
      if (preds.includes(currentId)) {
        if (t.is_locked !== 1 && t.task_type !== "节点任务") {
          affected.add(t.id);
          queue.push(t.id);
        }
      }
    }
  }

  for (const tid of affected) {
    const task = allTasks.find(t => t.id === tid);
    if (!task || task.is_locked === 1 || task.task_type === "节点任务") continue;

    let preds = [];
    try { preds = JSON.parse(task.predecessor_ids || "[]"); } catch { preds = []; }

    if (preds.length > 0) {
      const predEnds = preds
        .map(pid => allTasks.find(t => t.id === pid))
        .filter(Boolean)
        .map(p => p.planned_end)
        .filter(Boolean);

      if (predEnds.length > 0) {
        const maxEnd = predEnds.sort().reverse()[0];
        task.planned_start = addDays(maxEnd, 1);
        task.planned_end = addDays(task.planned_start, Math.max(0, task.duration_days - 1));
      }
    }
  }

  return allTasks;
}

/**
 * 更新任务的 completion_status 字段
 */
function updateCompletionStatus(task) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (task.planned_end) {
    const end = new Date(task.planned_end + "T00:00:00");
    if (end < today) {
      task.completion_status = "已完成";
    } else {
      const start = new Date(task.planned_start + "T00:00:00");
      if (start <= today && today <= end) {
        task.completion_status = "进行中";
      } else {
        task.completion_status = "未开始";
      }
    }
  } else {
    task.completion_status = "未开始";
  }
}

function updateAllCompletionStatuses(tasks) {
  return tasks.map(t => {
    const updated = { ...t };
    updateCompletionStatus(updated);
    return updated;
  });
}

/**
 * 批量持久化任务的日期/状态字段
 */
function persistTaskFields(tasks) {
  const stmt = db.prepare(`
    UPDATE schedule_tasks SET
      planned_start = ?, planned_end = ?, duration_days = ?,
      completion_status = ?, updated_at = datetime('now','localtime')
    WHERE id = ?
  `);
  for (const t of tasks) {
    stmt.run(t.planned_start, t.planned_end, t.duration_days, t.completion_status, t.id);
  }
}

/**
 * 重新编号同父级下的兄弟任务的 task_order（1-based）
 */
function renumberSiblings(projectId, parentId) {
  const siblings = parentId === null
    ? db.prepare(
        "SELECT * FROM schedule_tasks WHERE project_id = ? AND parent_id IS NULL ORDER BY task_order ASC"
      ).all(projectId)
    : db.prepare(
        "SELECT * FROM schedule_tasks WHERE project_id = ? AND parent_id = ? ORDER BY task_order ASC"
      ).all(projectId, parentId);

  const stmt = db.prepare("UPDATE schedule_tasks SET task_order = ? WHERE id = ?");
  siblings.forEach((t, i) => {
    stmt.run(i + 1, t.id);
  });
}

// ============================================================
// 端点 1：GET /api/projects/:id/schedule — 获取当前排期任务列表（树形排序）
// ============================================================
router.get("/projects/:id/schedule", (req, res) => {
  try {
    const { id } = req.params;
    const project = db.prepare("SELECT id, owner_id FROM projects WHERE id = ?").get(id);
    if (!project) {
      return res.status(404).json({ ok: false, error: "项目不存在" });
    }
    if (project.owner_id !== req.userId) {
      return res.status(403).json({ ok: false, error: "无权访问该项目" });
    }

    let tasks = getProjectTasksTree(id);
    tasks = recalcPhaseAggregation(tasks);        // belt: ensure phase dates always correct
    tasks = updateAllCompletionStatuses(tasks);
    persistTaskFields(tasks);                     // suspenders: write corrected data back to DB

    // Re-read to get clean tree after persist
    tasks = getProjectTasksTree(id);
    tasks = updateAllCompletionStatuses(tasks);

    res.json({ ok: true, data: tasks });
  } catch (err) {
    console.error("GET schedule:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ============================================================
// 端点 2：POST /api/projects/:id/schedule/generate — 一键生成排期
// ============================================================
router.post("/projects/:id/schedule/generate", (req, res) => {
  try {
    const { id } = req.params;
    const { template_name } = req.body;

    const project = db.prepare("SELECT id, owner_id FROM projects WHERE id = ?").get(id);
    if (!project) {
      return res.status(404).json({ ok: false, error: "项目不存在" });
    }
    if (project.owner_id !== req.userId) {
      return res.status(403).json({ ok: false, error: "无权访问该项目" });
    }

    const templatePath = join(TEMPLATES_DIR, `${template_name}.json`);
    if (!existsSync(templatePath)) {
      return res.status(400).json({ ok: false, error: `模板 "${template_name}" 不存在` });
    }

    let template;
    try {
      template = JSON.parse(readFileSync(templatePath, "utf-8"));
    } catch {
      return res.status(400).json({ ok: false, error: "模板格式错误" });
    }

    if (!template.tasks || !Array.isArray(template.tasks)) {
      return res.status(400).json({ ok: false, error: "模板格式错误：缺少 tasks 数组" });
    }

    const generate = db.transaction(() => {
      db.prepare("DELETE FROM schedule_tasks WHERE project_id = ?").run(id);

      const baseDate = todayStr();
      const indexToId = new Map(); // template array index → DB task ID

      const insertStmt = db.prepare(`
        INSERT INTO schedule_tasks (project_id, name, task_order, task_type, planned_start, planned_end, duration_days, predecessor_ids, parent_id, is_locked, notes, bg_color)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, '', '')
      `);

      // 第一遍：插入所有任务（不含 parent_id 和 predecessor_ids）
      for (let i = 0; i < template.tasks.length; i++) {
        const tmpl = template.tasks[i];
        const taskType = tmpl.task_type || "普通任务";
        const durationDays = taskType === "节点任务" ? 1 : (tmpl.duration_days || 0);
        const isLocked = tmpl.is_locked ? 1 : 0;

        // 对于阶段任务，duration_days 暂时设为 0，后续聚合计算
        const effectiveDuration = taskType === "阶段任务" ? 0 : Math.max(1, durationDays);
        const plannedStart = baseDate;
        const plannedEnd = taskType === "阶段任务" ? baseDate : addDays(plannedStart, Math.max(0, effectiveDuration - 1));

        const result = insertStmt.run(
          id, tmpl.name, i + 1, taskType,
          plannedStart, plannedEnd, effectiveDuration,
          "[]", isLocked
        );

        indexToId.set(i, result.lastInsertRowid);
      }

      // 第二遍：设置 parent_id（使用 parent_ref 作为数组索引映射）
      const updateParentStmt = db.prepare(
        "UPDATE schedule_tasks SET parent_id = ? WHERE id = ?"
      );
      for (let i = 0; i < template.tasks.length; i++) {
        const tmpl = template.tasks[i];
        if (tmpl.parent_ref != null && tmpl.parent_ref !== undefined) {
          const parentDbId = indexToId.get(tmpl.parent_ref);
          if (parentDbId) {
            const myDbId = indexToId.get(i);
            updateParentStmt.run(parentDbId, myDbId);
          }
        }
      }

      // 第三遍：设置 predecessor_ids（使用 predecessor_refs 作为数组索引映射）
      const updatePredsStmt = db.prepare(
        "UPDATE schedule_tasks SET predecessor_ids = ? WHERE id = ?"
      );
      for (let i = 0; i < template.tasks.length; i++) {
        const tmpl = template.tasks[i];
        const predRefs = tmpl.predecessor_refs || [];
        if (predRefs.length > 0) {
          const dbPredecessorIds = predRefs
            .map(pIdx => indexToId.get(pIdx))
            .filter(pid => pid !== undefined);
          const myDbId = indexToId.get(i);
          if (myDbId && dbPredecessorIds.length > 0) {
            updatePredsStmt.run(JSON.stringify(dbPredecessorIds), myDbId);
          }
        }
      }

      // 第四遍：重新读取所有任务，级联计算日期
      let allTasks = getProjectTasks(id);

      // 对有前置依赖的任务重新计算开始日期
      for (const task of allTasks) {
        let preds = [];
        try { preds = JSON.parse(task.predecessor_ids || "[]"); } catch { preds = []; }
        if (preds.length > 0 && task.task_type !== "节点任务" && task.is_locked !== 1) {
          const predEnds = preds
            .map(pid => allTasks.find(t => t.id === pid))
            .filter(Boolean)
            .map(p => p.planned_end)
            .filter(Boolean);
          if (predEnds.length > 0) {
            const maxEnd = predEnds.sort().reverse()[0];
            task.planned_start = addDays(maxEnd, 1);
            task.planned_end = addDays(task.planned_start, Math.max(0, task.duration_days - 1));
          }
        }
      }

      // 级联传播（从第一个任务开始）
      if (allTasks.length > 0) {
        allTasks = cascadePropagation(allTasks, allTasks[0]?.id);
      }

      // 阶段聚合
      allTasks = recalcPhaseAggregation(allTasks);
      allTasks = updateAllCompletionStatuses(allTasks);

      // 重排 task_order（深度优先）
      reorderAllTasks(id);

      persistTaskFields(allTasks);

      return getProjectTasksTree(id);
    });

    const result = generate();
    res.json({ ok: true, data: result });
  } catch (err) {
    console.error("POST generate:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * 按深度优先重新分配所有任务的 task_order
 */
function reorderAllTasks(projectId) {
  const allTasks = db.prepare(
    "SELECT * FROM schedule_tasks WHERE project_id = ?"
  ).all(projectId);

  const childrenMap = new Map();
  for (const t of allTasks) {
    const pid = t.parent_id || 0;
    if (!childrenMap.has(pid)) childrenMap.set(pid, []);
    childrenMap.get(pid).push(t);
  }

  for (const [, children] of childrenMap) {
    children.sort((a, b) => a.task_order - b.task_order);
  }

  let order = 0;
  const stmt = db.prepare("UPDATE schedule_tasks SET task_order = ? WHERE id = ?");

  function traverse(parentId) {
    const children = childrenMap.get(parentId) || [];
    for (const child of children) {
      order++;
      stmt.run(order, child.id);
      traverse(child.id);
    }
  }

  traverse(0);
}

// ============================================================
// 端点 3：PUT /api/schedule-tasks/:id — 更新单个排期任务
// ============================================================
router.put("/schedule-tasks/:id", (req, res) => {
  try {
    const { id } = req.params;
    const task = db.prepare("SELECT * FROM schedule_tasks WHERE id = ?").get(id);
    if (!task) {
      return res.status(404).json({ ok: false, error: "排期任务不存在" });
    }
    const proj = db.prepare("SELECT owner_id FROM projects WHERE id = ?").get(Number(task.project_id));
    if (!proj || proj.owner_id !== req.userId) return res.status(403).json({ ok: false, error: "无权访问该项目" });

    const body = req.body;

    // 节点任务：日期可改（不再 400 拦截），工期始终由下方逻辑强制为 1 天
    // 阶段任务保护
    if (task.task_type === "阶段任务") {
      if (body.planned_start !== undefined || body.planned_end !== undefined || body.duration_days !== undefined) {
        return res.status(400).json({ ok: false, error: "阶段任务的时间由系统自动计算，不可手动修改" });
      }
    }

    const update = db.transaction(() => {
      const updates = {};
      const fields = [];

      if (body.name !== undefined) {
        updates.name = body.name;
        fields.push("name = ?");
      }
      if (body.task_type !== undefined) {
        updates.task_type = body.task_type;
        fields.push("task_type = ?");

        // 节点任务：折叠为单日里程碑（结束日=开始日），工期恒为 1 天；
        // 不再强制锁定，切换后日期仍可由用户手动修改
        if (body.task_type === "节点任务") {
          updates.planned_end = task.planned_start;
          updates.duration_days = 1;
          fields.push("planned_end = ?", "duration_days = ?");
        }
        // 转回普通任务时不再强制解锁（锁定状态由 is_locked 独立控制）
      }
      if (body.notes !== undefined) {
        updates.notes = body.notes;
        fields.push("notes = ?");
      }
      if (body.bg_color !== undefined) {
        updates.bg_color = body.bg_color;
        fields.push("bg_color = ?");
      }

      // 节点任务：日期可改，但工期始终为 1 天（单日里程碑）
      const effectiveType = body.task_type !== undefined ? body.task_type : task.task_type;
      if (effectiveType === "节点任务") {
        if (body.planned_start !== undefined || body.planned_end !== undefined) {
          const d = body.planned_start !== undefined
            ? body.planned_start
            : (body.planned_end !== undefined ? body.planned_end : task.planned_start);
          updates.planned_start = d;
          updates.planned_end = d;
          updates.duration_days = 1;
          if (!fields.includes("planned_start = ?")) fields.push("planned_start = ?");
          if (!fields.includes("planned_end = ?")) fields.push("planned_end = ?");
          if (!fields.includes("duration_days = ?")) fields.push("duration_days = ?");
        }
        // duration_days 的修改被忽略（节点恒为 1 天）
      }
      // 日期/工期修改（普通任务）
      else if (effectiveType === "普通任务" && task.is_locked !== 1) {
        if (body.planned_start !== undefined) {
          updates.planned_start = body.planned_start;
          fields.push("planned_start = ?");
          const dur = body.duration_days !== undefined ? body.duration_days : task.duration_days;
          updates.planned_end = addDays(body.planned_start, Math.max(0, dur - 1));
          fields.push("planned_end = ?");
        }
        if (body.planned_end !== undefined && body.planned_start === undefined) {
          updates.planned_end = body.planned_end;
          fields.push("planned_end = ?");
          const newDuration = Math.max(1, daysBetween(task.planned_start, body.planned_end));
          updates.duration_days = newDuration;
          fields.push("duration_days = ?");
        }
        if (body.duration_days !== undefined && body.planned_start === undefined && body.planned_end === undefined) {
          const dur = Math.max(1, body.duration_days);
          updates.duration_days = dur;
          fields.push("duration_days = ?");
          updates.planned_end = addDays(task.planned_start, Math.max(0, dur - 1));
          fields.push("planned_end = ?");
        }
      }

      fields.push("updated_at = datetime('now','localtime')");

      if (fields.length === 1) {
        return db.prepare("SELECT * FROM schedule_tasks WHERE id = ?").get(id);
      }

      const values = Object.values(updates);
      const sql = `UPDATE schedule_tasks SET ${fields.join(", ")} WHERE id = ?`;
      db.prepare(sql).run(...values, id);

      // 级联传播
      let allTasks = getProjectTasks(task.project_id);
      allTasks = cascadePropagation(allTasks, Number(id));
      allTasks = recalcPhaseAggregation(allTasks);
      allTasks = updateAllCompletionStatuses(allTasks);

      // 重排 task_order
      reorderAllTasks(task.project_id);

      persistTaskFields(allTasks);

      return db.prepare("SELECT * FROM schedule_tasks WHERE id = ?").get(id);
    });

    const updated = update();
    res.json({ ok: true, data: updated });
  } catch (err) {
    console.error("PUT schedule-task:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ============================================================
// 端点 4：POST /api/projects/:id/schedule/insert — 插入新任务
// ============================================================
router.post("/projects/:id/schedule/insert", (req, res) => {
  try {
    const { id } = req.params;
    const { position, reference_id } = req.body;

    const project = db.prepare("SELECT id, owner_id FROM projects WHERE id = ?").get(id);
    if (!project) {
      return res.status(404).json({ ok: false, error: "项目不存在" });
    }
    if (project.owner_id !== req.userId) {
      return res.status(403).json({ ok: false, error: "无权访问该项目" });
    }

    const refTask = db.prepare("SELECT * FROM schedule_tasks WHERE id = ? AND project_id = ?")
      .get(reference_id, id);
    if (!refTask) {
      return res.status(400).json({ ok: false, error: "参考任务不存在" });
    }

    const insert = db.transaction(() => {
      let insertOrder = refTask.task_order;
      if (position === "below") {
        insertOrder = refTask.task_order + 1;
      }

      if (refTask.parent_id === null) {
        db.prepare(
          "UPDATE schedule_tasks SET task_order = task_order + 1 WHERE project_id = ? AND parent_id IS NULL AND task_order >= ?"
        ).run(id, insertOrder);
      } else {
        db.prepare(
          "UPDATE schedule_tasks SET task_order = task_order + 1 WHERE project_id = ? AND parent_id = ? AND task_order >= ?"
        ).run(id, refTask.parent_id, insertOrder);
      }

      const result = db.prepare(`
        INSERT INTO schedule_tasks (project_id, name, task_order, task_type, planned_start, planned_end, duration_days, predecessor_ids, parent_id, is_locked, notes, bg_color)
        VALUES (?, '', ?, '普通任务', ?, ?, 1, '[]', ?, 0, '', '')
      `).run(
        id, insertOrder,
        refTask.planned_start || todayStr(),
        refTask.planned_start || todayStr(),
        refTask.parent_id
      );

      renumberSiblings(id, refTask.parent_id);
      reorderAllTasks(id);

      return db.prepare("SELECT * FROM schedule_tasks WHERE id = ?").get(result.lastInsertRowid);
    });

    const newTask = insert();
    res.json({ ok: true, data: newTask });
  } catch (err) {
    console.error("POST insert:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ============================================================
// 端点 5：DELETE /api/schedule-tasks/:id — 删除排期任务
// ============================================================
router.delete("/schedule-tasks/:id", (req, res) => {
  try {
    const { id } = req.params;
    const task = db.prepare("SELECT * FROM schedule_tasks WHERE id = ?").get(id);
    if (!task) {
      return res.status(404).json({ ok: false, error: "排期任务不存在" });
    }
    const proj = db.prepare("SELECT owner_id FROM projects WHERE id = ?").get(Number(task.project_id));
    if (!proj || proj.owner_id !== req.userId) return res.status(403).json({ ok: false, error: "无权访问该项目" });

    const projectId = task.project_id;

    const remove = db.transaction(() => {
      db.prepare(
        "UPDATE schedule_tasks SET parent_id = ? WHERE parent_id = ? AND project_id = ?"
      ).run(task.parent_id, Number(id), projectId);

      db.prepare("DELETE FROM schedule_tasks WHERE id = ?").run(id);

      const allTasks = db.prepare(
        "SELECT * FROM schedule_tasks WHERE project_id = ?"
      ).all(projectId);
      const cleanupStmt = db.prepare(
        "UPDATE schedule_tasks SET predecessor_ids = ? WHERE id = ?"
      );
      for (const t of allTasks) {
        let preds = [];
        try { preds = JSON.parse(t.predecessor_ids || "[]"); } catch { preds = []; }
        const newPreds = preds.filter(pid => pid !== Number(id));
        if (newPreds.length !== preds.length) {
          cleanupStmt.run(JSON.stringify(newPreds), t.id);
        }
      }

      renumberSiblings(projectId, task.parent_id);
      reorderAllTasks(projectId);

      let updated = getProjectTasks(projectId);
      updated = recalcPhaseAggregation(updated);
      updated = updateAllCompletionStatuses(updated);
      persistTaskFields(updated);
    });

    remove();
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE schedule-task:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ============================================================
// 端点 6：PUT /api/projects/:id/schedule/:taskId/indent — 降级（缩进）
// ============================================================
router.put("/projects/:id/schedule/:taskId/indent", (req, res) => {
  try {
    const { id, taskId } = req.params;

    const task = db.prepare(
      "SELECT * FROM schedule_tasks WHERE id = ? AND project_id = ?"
    ).get(taskId, id);
    if (!task) {
      return res.status(404).json({ ok: false, error: "排期任务不存在" });
    }
    const proj = db.prepare("SELECT owner_id FROM projects WHERE id = ?").get(Number(task.project_id));
    if (!proj || proj.owner_id !== req.userId) return res.status(403).json({ ok: false, error: "无权访问该项目" });

    const siblings = task.parent_id === null
      ? db.prepare(
          "SELECT * FROM schedule_tasks WHERE project_id = ? AND parent_id IS NULL ORDER BY task_order ASC"
        ).all(id)
      : db.prepare(
          "SELECT * FROM schedule_tasks WHERE project_id = ? AND parent_id = ? ORDER BY task_order ASC"
        ).all(id, task.parent_id);

    const myIndex = siblings.findIndex(t => t.id === Number(taskId));
    if (myIndex <= 0) {
      return res.status(400).json({
        ok: false,
        error: "已是同层级第一个任务，无法降级（需要有紧邻上方的兄弟任务）",
      });
    }

    const prevSibling = siblings[myIndex - 1];

    const indent = db.transaction(() => {
      db.prepare(
        "UPDATE schedule_tasks SET parent_id = ?, updated_at = datetime('now','localtime') WHERE id = ?"
      ).run(prevSibling.id, taskId);

      const maxOrderRow = db.prepare(
        "SELECT MAX(task_order) AS max_order FROM schedule_tasks WHERE project_id = ? AND parent_id = ?"
      ).get(id, prevSibling.id);
      const newOrder = (maxOrderRow?.max_order || 0) + 1;

      db.prepare("UPDATE schedule_tasks SET task_order = ? WHERE id = ?")
        .run(newOrder, taskId);

      renumberSiblings(id, task.parent_id);
      reorderAllTasks(id);

      let allTasks = getProjectTasks(id);
      allTasks = recalcPhaseAggregation(allTasks);
      allTasks = updateAllCompletionStatuses(allTasks);
      persistTaskFields(allTasks);

      return getProjectTasksTree(id);
    });

    const result = indent();
    res.json({ ok: true, data: result });
  } catch (err) {
    console.error("PUT indent:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ============================================================
// 端点 7：PUT /api/projects/:id/schedule/:taskId/outdent — 升级（减少缩进）
// ============================================================
router.put("/projects/:id/schedule/:taskId/outdent", (req, res) => {
  try {
    const { id, taskId } = req.params;

    const task = db.prepare(
      "SELECT * FROM schedule_tasks WHERE id = ? AND project_id = ?"
    ).get(taskId, id);
    if (!task) {
      return res.status(404).json({ ok: false, error: "排期任务不存在" });
    }
    const proj = db.prepare("SELECT owner_id FROM projects WHERE id = ?").get(Number(task.project_id));
    if (!proj || proj.owner_id !== req.userId) return res.status(403).json({ ok: false, error: "无权访问该项目" });

    if (task.parent_id === null) {
      return res.status(400).json({
        ok: false,
        error: "顶级任务无法再升级",
      });
    }

    const parent = db.prepare("SELECT * FROM schedule_tasks WHERE id = ?").get(task.parent_id);
    const grandParentId = parent ? parent.parent_id : null;

    const outdent = db.transaction(() => {
      db.prepare(
        "UPDATE schedule_tasks SET parent_id = ?, updated_at = datetime('now','localtime') WHERE id = ?"
      ).run(grandParentId, taskId);

      const newOrder = parent.task_order + 1;

      if (grandParentId === null) {
        db.prepare(
          "UPDATE schedule_tasks SET task_order = task_order + 1 WHERE project_id = ? AND parent_id IS NULL AND task_order >= ? AND id != ?"
        ).run(id, newOrder, taskId);
      } else {
        db.prepare(
          "UPDATE schedule_tasks SET task_order = task_order + 1 WHERE project_id = ? AND parent_id = ? AND task_order >= ? AND id != ?"
        ).run(id, grandParentId, newOrder, taskId);
      }

      db.prepare("UPDATE schedule_tasks SET task_order = ? WHERE id = ?")
        .run(newOrder, taskId);

      renumberSiblings(id, task.parent_id);
      renumberSiblings(id, grandParentId);
      reorderAllTasks(id);

      let allTasks = getProjectTasks(id);
      allTasks = recalcPhaseAggregation(allTasks);
      allTasks = updateAllCompletionStatuses(allTasks);
      persistTaskFields(allTasks);

      return getProjectTasksTree(id);
    });

    const result = outdent();
    res.json({ ok: true, data: result });
  } catch (err) {
    console.error("PUT outdent:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ============================================================
// 端点 8：PUT /api/schedule-tasks/:id/predecessors — 更新前置任务
// ============================================================
router.put("/schedule-tasks/:id/predecessors", (req, res) => {
  try {
    const { id } = req.params;
    const { predecessor_ids } = req.body;

    const task = db.prepare("SELECT * FROM schedule_tasks WHERE id = ?").get(id);
    if (!task) {
      return res.status(404).json({ ok: false, error: "排期任务不存在" });
    }
    const proj = db.prepare("SELECT owner_id FROM projects WHERE id = ?").get(Number(task.project_id));
    if (!proj || proj.owner_id !== req.userId) return res.status(403).json({ ok: false, error: "无权访问该项目" });

    const allTasks = getProjectTasks(task.project_id);

    if (predecessor_ids && predecessor_ids.length > 0) {
      for (const pid of predecessor_ids) {
        const pred = allTasks.find(t => t.id === pid);
        if (!pred) {
          return res.status(400).json({ ok: false, error: `前置任务 ID ${pid} 不存在` });
        }
        if (pred.project_id !== task.project_id) {
          return res.status(400).json({ ok: false, error: `前置任务 ID ${pid} 不属于同一项目` });
        }
        if (pid === Number(id)) {
          return res.status(400).json({ ok: false, error: "不能将自己设为前置任务" });
        }
      }
    }

    if (detectCycle(allTasks, Number(id), predecessor_ids || [])) {
      return res.status(400).json({ ok: false, error: "检测到循环依赖，无法保存" });
    }

    const update = db.transaction(() => {
      db.prepare(
        "UPDATE schedule_tasks SET predecessor_ids = ?, updated_at = datetime('now','localtime') WHERE id = ?"
      ).run(JSON.stringify(predecessor_ids || []), id);

      if (predecessor_ids && predecessor_ids.length > 0 && task.task_type !== "节点任务" && task.is_locked !== 1) {
        const predEnds = predecessor_ids
          .map(pid => allTasks.find(t => t.id === pid))
          .filter(Boolean)
          .map(p => p.planned_end)
          .filter(Boolean);

        if (predEnds.length > 0) {
          const maxEnd = predEnds.sort().reverse()[0];
          const newStart = addDays(maxEnd, 1);
          const newEnd = addDays(newStart, Math.max(0, task.duration_days - 1));

          db.prepare(`
            UPDATE schedule_tasks SET planned_start = ?, planned_end = ?, updated_at = datetime('now','localtime')
            WHERE id = ?
          `).run(newStart, newEnd, id);
        }
      }

      let updated = getProjectTasks(task.project_id);
      updated = cascadePropagation(updated, Number(id));
      updated = recalcPhaseAggregation(updated);
      updated = updateAllCompletionStatuses(updated);

      persistTaskFields(updated);

      return db.prepare("SELECT * FROM schedule_tasks WHERE id = ?").get(id);
    });

    const result = update();
    res.json({ ok: true, data: result });
  } catch (err) {
    console.error("PUT predecessors:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ============================================================
// 端点 9：GET /api/templates/schedule — 列出可用模板（过滤 sugon-standard）
// ============================================================
router.get("/templates/schedule", (req, res) => {
  try {
    if (!existsSync(TEMPLATES_DIR)) {
      return res.json({ ok: true, data: [] });
    }

    const files = readdirSync(TEMPLATES_DIR)
      .filter(f => f.endsWith(".json") && f !== "sugon-standard.json");
    const templates = [];

    for (const file of files) {
      try {
        const content = JSON.parse(readFileSync(join(TEMPLATES_DIR, file), "utf-8"));
        templates.push({
          file,
          name: content.name || file.replace(".json", ""),
          description: content.description || "",
          task_count: (content.tasks || []).length,
        });
      } catch {
        // 跳过无法解析的文件
      }
    }

    res.json({ ok: true, data: templates });
  } catch (err) {
    console.error("GET templates:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ============================================================
// 端点 10：POST /api/projects/:id/schedule/save — 保存版本快照
// ============================================================
router.post("/projects/:id/schedule/save", (req, res) => {
  try {
    const { id } = req.params;
    const project = db.prepare("SELECT id, owner_id FROM projects WHERE id = ?").get(id);
    if (!project) {
      return res.status(404).json({ ok: false, error: "项目不存在" });
    }
    if (project.owner_id !== req.userId) {
      return res.status(403).json({ ok: false, error: "无权访问该项目" });
    }

    const tasks = getProjectTasks(id);
    if (tasks.length === 0) {
      return res.status(400).json({ ok: false, error: "项目无排期数据可保存" });
    }

    const today = todayStr();
    const todayVersions = db.prepare(
      "SELECT COUNT(*) as cnt FROM schedule_versions WHERE project_id = ? AND version_name LIKE ?"
    ).get(id, `${today}_Version%`);
    const versionNum = (todayVersions?.cnt || 0) + 1;
    const versionName = `${today}_Version${versionNum}`;

    const tasksSnapshot = JSON.stringify(tasks);

    const result = db.prepare(`
      INSERT INTO schedule_versions (project_id, version_name, tasks_snapshot)
      VALUES (?, ?, ?)
    `).run(id, versionName, tasksSnapshot);

    res.json({
      ok: true,
      data: {
        id: result.lastInsertRowid,
        version_name: versionName,
        created_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("POST save:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ============================================================
// 端点 11：GET /api/projects/:id/schedule/versions — 获取版本历史
// ============================================================
router.get("/projects/:id/schedule/versions", (req, res) => {
  try {
    const { id } = req.params;
    const project = db.prepare("SELECT id, owner_id FROM projects WHERE id = ?").get(id);
    if (!project) {
      return res.status(404).json({ ok: false, error: "项目不存在" });
    }
    if (project.owner_id !== req.userId) {
      return res.status(403).json({ ok: false, error: "无权访问该项目" });
    }

    const versions = db.prepare(
      "SELECT id, project_id, version_name, created_at FROM schedule_versions WHERE project_id = ? ORDER BY created_at DESC"
    ).all(id);

    res.json({ ok: true, data: versions });
  } catch (err) {
    console.error("GET versions:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ============================================================
// 端点 12：GET /api/projects/:id/schedule/versions/:vid — 查看版本快照详情
// ============================================================
router.get("/projects/:id/schedule/versions/:vid", (req, res) => {
  try {
    const { id, vid } = req.params;
    const version = db.prepare(
      "SELECT * FROM schedule_versions WHERE id = ? AND project_id = ?"
    ).get(vid, id);

    if (!version) {
      return res.status(404).json({ ok: false, error: "版本不存在" });
    }
    const proj = db.prepare("SELECT owner_id FROM projects WHERE id = ?").get(Number(id));
    if (!proj || proj.owner_id !== req.userId) return res.status(403).json({ ok: false, error: "无权访问该项目" });

    res.json({ ok: true, data: version });
  } catch (err) {
    console.error("GET version detail:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ============================================================
// 端点 13：POST /api/projects/:id/schedule/versions/:vid/restore — 恢复版本
// ============================================================
router.post("/projects/:id/schedule/versions/:vid/restore", (req, res) => {
  try {
    const { id, vid } = req.params;
    const version = db.prepare(
      "SELECT * FROM schedule_versions WHERE id = ? AND project_id = ?"
    ).get(vid, id);

    if (!version) {
      return res.status(404).json({ ok: false, error: "版本不存在" });
    }
    const proj = db.prepare("SELECT owner_id FROM projects WHERE id = ?").get(Number(id));
    if (!proj || proj.owner_id !== req.userId) return res.status(403).json({ ok: false, error: "无权访问该项目" });

    let snapshotTasks;
    try {
      snapshotTasks = JSON.parse(version.tasks_snapshot);
    } catch {
      return res.status(400).json({ ok: false, error: "版本数据格式错误，无法恢复" });
    }

    const restore = db.transaction(() => {
      db.prepare("DELETE FROM schedule_tasks WHERE project_id = ?").run(id);

      const insertStmt = db.prepare(`
        INSERT INTO schedule_tasks (id, project_id, name, task_order, task_type,
          planned_start, planned_end, duration_days, completion_status,
          predecessor_ids, parent_id, is_locked, notes, bg_color, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const t of snapshotTasks) {
        insertStmt.run(
          t.id, t.project_id, t.name, t.task_order, t.task_type,
          t.planned_start, t.planned_end, t.duration_days, t.completion_status,
          t.predecessor_ids, t.parent_id ?? null, t.is_locked ?? 0,
          t.notes || "", t.bg_color || "",
          t.created_at || new Date().toISOString(),
          new Date().toISOString()
        );
      }

      return getProjectTasksTree(id);
    });

    const result = restore();
    res.json({ ok: true, data: result });
  } catch (err) {
    console.error("POST restore:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ============================================================
// 端点 14：GET /api/projects/:id/schedule/export — 导出 Excel
// ============================================================
router.get("/projects/:id/schedule/export", async (req, res) => {
  try {
    const { id } = req.params;
    const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
    if (!project) {
      return res.status(404).json({ ok: false, error: "项目不存在" });
    }
    if (project.owner_id !== req.userId) {
      return res.status(403).json({ ok: false, error: "无权访问该项目" });
    }

    let tasks = getProjectTasksTree(id);
    if (tasks.length === 0) {
      return res.status(400).json({ ok: false, error: "项目无排期数据可导出" });
    }

    tasks = updateAllCompletionStatuses(tasks);

    const ExcelJS = (await import("exceljs")).default;

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("项目排期表");

    sheet.columns = [
      { header: "序号", key: "order", width: 8 },
      { header: "任务名称", key: "name", width: 30 },
      { header: "开始时间", key: "start", width: 14 },
      { header: "完成时间", key: "end", width: 14 },
      { header: "工期", key: "duration", width: 8 },
      { header: "完成情况", key: "status", width: 12 },
      { header: "前置任务", key: "predecessors", width: 20 },
      { header: "备注", key: "notes", width: 20 },
    ];

    const taskRowMap = new Map();
    tasks.forEach((t, i) => {
      taskRowMap.set(t.id, i + 2);
    });

    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      const rowNum = i + 2;

      let predNames = "";
      try {
        const preds = JSON.parse(t.predecessor_ids || "[]");
        predNames = preds
          .map(pid => tasks.find(tt => tt.id === pid))
          .filter(Boolean)
          .map(p => p.name)
          .join("、");
      } catch { predNames = ""; }

      const durationVal = t.duration_days || 1;
      const indent = "  ".repeat(t.depth || 0);
      const displayName = indent + (t.depth > 0 ? "└ " : "") + t.name;

      const rowValues = [
        t.task_order,
        displayName,
        t.planned_start,
        t.planned_end,
        durationVal,
        t.completion_status || "未开始",
        predNames,
        t.notes || "",
      ];

      sheet.addRow(rowValues);
    }

    for (let i = 0; i < tasks.length; i++) {
      const rowNum = i + 2;
      const startCell = sheet.getCell(rowNum, 3);
      const endCell = sheet.getCell(rowNum, 4);
      if (typeof startCell.value === "string" && !String(startCell.value).startsWith("=")) {
        startCell.numFmt = "yyyy-mm-dd";
      }
      if (typeof endCell.value === "string" && !String(endCell.value).startsWith("=")) {
        endCell.numFmt = "yyyy-mm-dd";
      }
    }

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE3F2FD" },
    };
    headerRow.alignment = { horizontal: "center", vertical: "middle" };

    for (let i = 1; i <= tasks.length + 1; i++) {
      const row = sheet.getRow(i);
      row.eachCell(cell => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });
    }

    const rawName = `${project.code || project.name}_排期表_${todayStr()}.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(rawName)}`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("GET export:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ============================================================
// 端点：DELETE /projects/:id/schedule — 一键清空所有计划
// ============================================================
router.delete("/projects/:id/schedule", (req, res) => {
  try {
    const { id } = req.params;
    const project = db.prepare("SELECT id, owner_id FROM projects WHERE id = ?").get(id);
    if (!project) return res.status(404).json({ ok: false, error: "项目不存在" });
    if (project.owner_id !== req.userId) return res.status(403).json({ ok: false, error: "无权访问该项目" });
    const info = db.prepare("SELECT COUNT(*) c FROM schedule_tasks WHERE project_id = ?").get(id);
    db.prepare("DELETE FROM schedule_tasks WHERE project_id = ?").run(id);
    res.json({ ok: true, data: { deleted: info.c } });
  } catch (err) {
    console.error("DELETE schedule:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 批量插入任务（被 import 与 import-from-url 复用）
// tasks: [{ name, task_type, planned_start, planned_end, duration_days, predecessor, notes, indentLevel }]
function insertScheduleTasks(projectId, taskList) {
  const insertStmt = db.prepare(`
    INSERT INTO schedule_tasks (project_id, name, task_order, task_type, planned_start, planned_end, duration_days, predecessor_ids, parent_id, is_locked, notes, bg_color)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, '')
  `);
  const updateParentStmt = db.prepare("UPDATE schedule_tasks SET parent_id = ? WHERE id = ?");
  const updatePredsStmt = db.prepare("UPDATE schedule_tasks SET predecessor_ids = ? WHERE id = ?");

  const baseDate = todayStr();
  const indexToId = new Map();
  const nameToId = new Map();
  const stack = []; // indentLevel -> taskId
  let order = db.prepare("SELECT COALESCE(MAX(task_order),0) m FROM schedule_tasks WHERE project_id = ?").get(projectId).m;

  for (let i = 0; i < taskList.length; i++) {
    const t = taskList[i];
    const taskType = t.task_type || "普通任务";
    const indent = Number(t.indentLevel) || 0;
    const duration =
      taskType === "节点任务"
        ? 1
        : t.duration_days != null
        ? Number(t.duration_days)
        : taskType === "阶段任务"
        ? 0
        : 1;
    // 经 mapScheduleMatrix 的 deriveDates 处理后通常已补全；此处再做防御性兜底，
    // 确保任何调用方（含未来非前端来源）传入欠指定任务时也能正确推导出缺失日期。
    let start = t.planned_start || null;
    let end = t.planned_end || null;
    if (taskType === "节点任务") {
      const s = start || end || baseDate;
      start = s;
      end = s;
    } else if (!start && !end) {
      // 仅给出工期（或三者皆空）的情况：锚定到项目起始日，保证可渲染
      start = baseDate;
      end = addDays(baseDate, Math.max(0, (duration || 1) - 1));
    } else if (start && !end && duration) {
      end = addDays(start, Math.max(0, duration - 1));
    } else if (end && !start && duration) {
      start = addDays(end, -(duration - 1));
    } else if (start && !end) {
      end = start;
    } else if (end && !start) {
      start = end;
    }

    const result = insertStmt.run(
      projectId,
      t.name || `任务${i + 1}`,
      ++order,
      taskType,
      start,
      end,
      duration,
      "[]",
      t.notes || ""
    );
    const tid = result.lastInsertRowid;
    indexToId.set(i, tid);
    nameToId.set(t.name, tid);

    stack[indent] = tid;
    stack.length = indent + 1; // 截断更深层级，避免跨级
    const parentId = indent > 0 ? stack[indent - 1] : null;
    if (parentId) updateParentStmt.run(parentId, tid);

    if (t.predecessor) {
      const predIds = resolvePredecessors(t.predecessor, indexToId, nameToId, i);
      if (predIds.length) updatePredsStmt.run(JSON.stringify(predIds), tid);
    }
  }
  return taskList.length;
}

// 前置依赖解析：全数字 → 视为 1-based 行号映射同批任务；否则按任务名匹配
function resolvePredecessors(raw, indexToId, nameToId, selfIdx) {
  const parts = String(raw)
    .split(/[,，、;；]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const ids = [];
  const allNumeric = parts.length > 0 && parts.every((p) => /^\d+$/.test(p));
  for (const p of parts) {
    if (allNumeric) {
      const idx = Number(p) - 1;
      if (indexToId.has(idx) && idx !== selfIdx) ids.push(indexToId.get(idx));
    } else if (nameToId.has(p)) {
      ids.push(nameToId.get(p));
    }
  }
  return ids;
}

// ============================================================
// 端点：POST /projects/:id/schedule/import — 批量导入（前端解析后提交）
// ============================================================
router.post("/projects/:id/schedule/import", (req, res) => {
  try {
    const { id } = req.params;
    const { tasks } = req.body;
    const project = db.prepare("SELECT id, owner_id FROM projects WHERE id = ?").get(id);
    if (!project) return res.status(404).json({ ok: false, error: "项目不存在" });
    if (project.owner_id !== req.userId) return res.status(403).json({ ok: false, error: "无权访问该项目" });
    if (!Array.isArray(tasks) || !tasks.length) {
      return res.status(400).json({ ok: false, error: "tasks 不能为空" });
    }
    const count = db.transaction((pid, list) => insertScheduleTasks(pid, list))(Number(id), tasks);
    res.json({ ok: true, data: { imported: count } });
  } catch (err) {
    console.error("POST import:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ============================================================
// 端点：POST /projects/:id/schedule/import-from-url — 腾讯文档链接导入
// ============================================================
router.post("/projects/:id/schedule/import-from-url", async (req, res) => {
  try {
    const { id } = req.params;
    const { url } = req.body;
    const project = db.prepare("SELECT id, owner_id FROM projects WHERE id = ?").get(id);
    if (!project) return res.status(404).json({ ok: false, error: "项目不存在" });
    if (project.owner_id !== req.userId) return res.status(403).json({ ok: false, error: "无权访问该项目" });
    if (!url || !/^https?:\/\//i.test(url)) {
      return res.status(400).json({ ok: false, error: "请提供有效的腾讯文档下载链接" });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    let buf;
    try {
      const resp = await fetch(url, { signal: controller.signal, redirect: "follow" });
      if (!resp.ok) throw new Error(`远程获取失败 HTTP ${resp.status}`);
      buf = Buffer.from(await resp.arrayBuffer());
    } finally {
      clearTimeout(timer);
    }

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.worksheets[0];
    if (!ws) throw new Error("文档无工作表");
    const matrix = [];
    ws.eachRow((row) => {
      const arr = [];
      row.eachCell({ includeEmpty: true }, (cell) => {
        arr.push(cellValueToStr(cell));
      });
      matrix.push(arr);
    });

    const { tasks, warnings } = mapScheduleMatrix(matrix);
    if (!tasks.length) {
      return res.status(400).json({ ok: false, error: "未能从文档解析出任何任务", warnings });
    }
    const count = db.transaction((pid, list) => insertScheduleTasks(pid, list))(Number(id), tasks);
    res.json({ ok: true, data: { imported: count, warnings } });
  } catch (err) {
    console.error("POST import-from-url:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
