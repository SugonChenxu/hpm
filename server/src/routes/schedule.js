import { Router } from "express";
import { readdirSync, readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import db from "../db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const router = Router();

// ============================================================
// 工具函数
// ============================================================

/** 模板目录路径 */
const TEMPLATES_DIR = join(__dirname, "..", "templates");

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
 * 计算两个日期之间的天数差
 */
function daysBetween(startStr, endStr) {
  const s = new Date(startStr + "T00:00:00");
  const e = new Date(endStr + "T00:00:00");
  return Math.round((e - s) / (1000 * 60 * 60 * 24));
}

/**
 * 获取某日期前一天的日期字符串
 */
function dayBefore(dateStr) {
  return addDays(dateStr, -1);
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

  /**
   * 递归遍历，将任务及其后代按深度优先加入结果
   * @param {number} parentId - 父任务 ID（0 表示顶级）
   * @param {number} depth  - 当前深度
   */
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
 * @param {Array} allTasks - 当前项目全部任务
 * @param {number} taskId - 被添加前置的任务 ID
 * @param {number[]} newPredecessorIds - 新的前置任务 ID 列表
 * @returns {boolean} - true 表示存在环
 */
function detectCycle(allTasks, taskId, newPredecessorIds) {
  if (!newPredecessorIds || newPredecessorIds.length === 0) return false;

  // 构建邻接表：taskId → 其前置任务 ID 列表
  const graph = new Map();
  for (const t of allTasks) {
    let preds = [];
    try {
      preds = JSON.parse(t.predecessor_ids || "[]");
    } catch { preds = []; }
    graph.set(t.id, preds);
  }

  // 临时设置新前置
  graph.set(taskId, [...newPredecessorIds]);

  // DFS 检测从每个候选前置出发是否能回到 taskId
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
 * @param {number} taskId
 * @param {Map<number, Array>} childrenMap - parent_id → children 映射
 * @param {Set} visited - 防环
 * @returns {{ minStart: string|null, maxEnd: string|null }}
 */
function collectDescendantDates(taskId, childrenMap, visited) {
  if (visited.has(taskId)) return { minStart: null, maxEnd: null };
  visited.add(taskId);

  const children = childrenMap.get(taskId) || [];
  let minStart = null;
  let maxEnd = null;

  for (const child of children) {
    // 纳入子任务的日期
    if (child.planned_start && (!minStart || child.planned_start < minStart)) {
      minStart = child.planned_start;
    }
    if (child.planned_end && (!maxEnd || child.planned_end > maxEnd)) {
      maxEnd = child.planned_end;
    }

    // 递归收集孙辈
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
 * 阶段任务的 start = MIN(所有子孙任务的 start)
 * 阶段任务的 end   = MAX(所有子孙任务的 end)
 */
function recalcPhaseAggregation(tasks) {
  if (!tasks || tasks.length === 0) return tasks;

  // 构建 parent_id → children 映射（null 映射为 0）
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
        task.duration_days = daysBetween(task.planned_start, task.planned_end);
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

  // BFS：找到所有以 changedTaskId 为前置的任务
  const queue = [changedTaskId];
  const affected = new Set();

  while (queue.length > 0) {
    const currentId = queue.shift();
    for (const t of allTasks) {
      if (affected.has(t.id)) continue;
      let preds = [];
      try { preds = JSON.parse(t.predecessor_ids || "[]"); } catch { preds = []; }
      if (preds.includes(currentId)) {
        // 节点任务不参与级联
        if (t.is_locked !== 1 && t.task_type !== "节点任务") {
          affected.add(t.id);
          queue.push(t.id);
        }
      }
    }
  }

  // 对受影响的任务，重新计算开始日期
  for (const tid of affected) {
    const task = allTasks.find(t => t.id === tid);
    if (!task || task.is_locked === 1 || task.task_type === "节点任务") continue;

    let preds = [];
    try { preds = JSON.parse(task.predecessor_ids || "[]"); } catch { preds = []; }

    if (preds.length > 0) {
      // 取所有前置任务中最晚的结束日期 + 1 天
      const predEnds = preds
        .map(pid => allTasks.find(t => t.id === pid))
        .filter(Boolean)
        .map(p => p.planned_end)
        .filter(Boolean);

      if (predEnds.length > 0) {
        const maxEnd = predEnds.sort().reverse()[0];
        task.planned_start = addDays(maxEnd, 1);
        task.planned_end = addDays(task.planned_start, task.duration_days - 1);
      }
    }
  }

  // 重新计算阶段聚合
  allTasks = recalcPhaseAggregation(allTasks);

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

/**
 * 批量更新 completion_status
 */
function updateAllCompletionStatuses(tasks) {
  return tasks.map(t => {
    const updated = { ...t };
    updateCompletionStatus(updated);
    return updated;
  });
}

/**
 * 批量持久化任务的 planned_start / planned_end / duration_days / completion_status
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
 * @param {number} projectId
 * @param {number|null} parentId - null 表示顶级任务
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
    const project = db.prepare("SELECT id FROM projects WHERE id = ?").get(id);
    if (!project) {
      return res.status(404).json({ ok: false, error: "项目不存在" });
    }

    let tasks = getProjectTasksTree(id);
    // 更新 completion_status
    tasks = updateAllCompletionStatuses(tasks);
    // 批量持久化状态更新
    const updateStmt = db.prepare(
      "UPDATE schedule_tasks SET completion_status = ?, updated_at = datetime('now','localtime') WHERE id = ?"
    );
    const updateMany = db.transaction((items) => {
      for (const t of items) {
        updateStmt.run(t.completion_status, t.id);
      }
    });
    updateMany(tasks);

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

    const project = db.prepare("SELECT id FROM projects WHERE id = ?").get(id);
    if (!project) {
      return res.status(404).json({ ok: false, error: "项目不存在" });
    }

    // 读取模板
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

    // 事务：清空现有排期 + 批量插入新任务
    const generate = db.transaction(() => {
      // 清空现有
      db.prepare("DELETE FROM schedule_tasks WHERE project_id = ?").run(id);

      // 基准日期：今天
      const baseDate = todayStr();

      // 用于存储模板索引 → 数据库 ID 的映射
      const indexToId = new Map();

      const insertStmt = db.prepare(`
        INSERT INTO schedule_tasks (project_id, name, task_order, task_type, planned_start, planned_end, duration_days, predecessor_ids, parent_id, is_locked)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
      `);

      // 第一遍：计算日期并插入
      for (let i = 0; i < template.tasks.length; i++) {
        const tmpl = template.tasks[i];
        const taskOrder = i + 1;
        const taskType = tmpl.task_type || "普通任务";
        const durationDays = taskType === "节点任务" ? 1 : (tmpl.duration_days || 1);
        const isLocked = taskType === "节点任务" ? 1 : 0;

        let plannedStart;
        let plannedEnd;

        // 计算开始日期
        if (tmpl.predecessors && tmpl.predecessors.length > 0) {
          // 有前置依赖：取最晚前置结束 + 1
          const predEnds = tmpl.predecessors
            .map(pIdx => indexToId.get(pIdx))
            .filter(pid => pid !== undefined)
            .map(pid => {
              const pt = db.prepare("SELECT planned_end FROM schedule_tasks WHERE id = ?").get(pid);
              return pt ? pt.planned_end : null;
            })
            .filter(Boolean);

          if (predEnds.length > 0) {
            const maxEnd = predEnds.sort().reverse()[0];
            plannedStart = addDays(maxEnd, 1);
          } else {
            plannedStart = baseDate;
          }
        } else if (taskType === "阶段任务") {
          // 阶段任务先用临时日期，后续聚合
          plannedStart = baseDate;
        } else {
          plannedStart = baseDate;
        }

        plannedEnd = addDays(plannedStart, durationDays - 1);

        const result = insertStmt.run(
          id, tmpl.name, taskOrder, taskType,
          plannedStart, plannedEnd, durationDays,
          "[]", isLocked
        );

        indexToId.set(i, result.lastInsertRowid);
      }

      // 第二遍：更新前置任务的 predecessor_ids（使用数据库 ID）
      const updatePredsStmt = db.prepare(
        "UPDATE schedule_tasks SET predecessor_ids = ? WHERE id = ?"
      );
      for (let i = 0; i < template.tasks.length; i++) {
        const tmpl = template.tasks[i];
        if (tmpl.predecessors && tmpl.predecessors.length > 0) {
          const dbPredecessorIds = tmpl.predecessors
            .map(pIdx => indexToId.get(pIdx))
            .filter(pid => pid !== undefined);
          const dbTaskId = indexToId.get(i);
          if (dbTaskId && dbPredecessorIds.length > 0) {
            updatePredsStmt.run(JSON.stringify(dbPredecessorIds), dbTaskId);
          }
        }
      }

      // 第三遍：自动构建树形结构 — 将阶段任务之后的普通任务/节点任务挂载为子任务
      const updateParentStmt = db.prepare(
        "UPDATE schedule_tasks SET parent_id = ? WHERE id = ?"
      );
      let currentPhaseId = null;
      const flatTasks = db.prepare(
        "SELECT * FROM schedule_tasks WHERE project_id = ? ORDER BY task_order ASC"
      ).all(id);
      for (const t of flatTasks) {
        if (t.task_type === "阶段任务") {
          currentPhaseId = t.id;
        } else if (currentPhaseId !== null) {
          updateParentStmt.run(currentPhaseId, t.id);
        }
      }

      // 第四遍：重新读取所有任务，计算阶段聚合和级联传播
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
            task.planned_end = addDays(task.planned_start, task.duration_days - 1);
          }
        }
      }

      // 级联传播
      if (allTasks.length > 0) {
        allTasks = cascadePropagation(allTasks, allTasks[0]?.id);
      }

      // 阶段聚合
      allTasks = recalcPhaseAggregation(allTasks);

      // 完成情况
      allTasks = updateAllCompletionStatuses(allTasks);

      // 批量更新
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

    const body = req.body;

    // 节点任务保护
    if (task.is_locked === 1 || task.task_type === "节点任务") {
      if (body.planned_start !== undefined && body.planned_start !== task.planned_start) {
        return res.status(400).json({ ok: false, error: "节点任务不允许修改开始日期" });
      }
      if (body.duration_days !== undefined && body.duration_days !== task.duration_days) {
        return res.status(400).json({ ok: false, error: "节点任务不允许修改工期" });
      }
      if (body.planned_end !== undefined && body.planned_end !== task.planned_end) {
        return res.status(400).json({ ok: false, error: "节点任务不允许修改结束日期" });
      }
    }

    // 阶段任务保护：不允许手动修改 planned_start / planned_end / duration_days
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

        // 如果改为节点任务
        if (body.task_type === "节点任务") {
          updates.is_locked = 1;
          updates.duration_days = 1;
          fields.push("is_locked = ?", "duration_days = ?");
        }
        // 如果从节点任务改为普通任务
        if (body.task_type === "普通任务" && task.is_locked === 1) {
          updates.is_locked = 0;
          fields.push("is_locked = ?");
        }
      }

      // 日期/工期修改（普通任务）
      if (task.task_type === "普通任务" && task.is_locked !== 1) {
        if (body.planned_start !== undefined) {
          updates.planned_start = body.planned_start;
          fields.push("planned_start = ?");
          // 修改开始日期 → 结束日期 = 开始 + 工期
          const newEnd = addDays(body.planned_start, (body.duration_days !== undefined ? body.duration_days : task.duration_days) - 1);
          updates.planned_end = newEnd;
          fields.push("planned_end = ?");
        }
        if (body.planned_end !== undefined && body.planned_start === undefined) {
          updates.planned_end = body.planned_end;
          fields.push("planned_end = ?");
          // 修改结束日期 → 工期 = 结束 - 开始
          const newDuration = daysBetween(task.planned_start, body.planned_end) + 1;
          updates.duration_days = Math.max(1, newDuration);
          fields.push("duration_days = ?");
        }
        if (body.duration_days !== undefined && body.planned_start === undefined && body.planned_end === undefined) {
          updates.duration_days = Math.max(1, body.duration_days);
          fields.push("duration_days = ?");
          // 修改工期 → 结束 = 开始 + 工期
          const newEnd = addDays(task.planned_start, Math.max(1, body.duration_days) - 1);
          updates.planned_end = newEnd;
          fields.push("planned_end = ?");
        }
      }

      fields.push("updated_at = datetime('now','localtime')");

      if (fields.length === 1) {
        // 只有 updated_at，没有实际修改，直接返回
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

      // 批量持久化
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

    const project = db.prepare("SELECT id FROM projects WHERE id = ?").get(id);
    if (!project) {
      return res.status(404).json({ ok: false, error: "项目不存在" });
    }

    const refTask = db.prepare("SELECT * FROM schedule_tasks WHERE id = ? AND project_id = ?")
      .get(reference_id, id);
    if (!refTask) {
      return res.status(400).json({ ok: false, error: "参考任务不存在" });
    }

    const insert = db.transaction(() => {
      // 计算插入位置（同级）
      let insertOrder = refTask.task_order;
      if (position === "below") {
        insertOrder = refTask.task_order + 1;
      }

      // 后续同级兄弟任务 order +1
      if (refTask.parent_id === null) {
        db.prepare(
          "UPDATE schedule_tasks SET task_order = task_order + 1 WHERE project_id = ? AND parent_id IS NULL AND task_order >= ?"
        ).run(id, insertOrder);
      } else {
        db.prepare(
          "UPDATE schedule_tasks SET task_order = task_order + 1 WHERE project_id = ? AND parent_id = ? AND task_order >= ?"
        ).run(id, refTask.parent_id, insertOrder);
      }

      // 插入新任务（与参考任务同级）
      const result = db.prepare(`
        INSERT INTO schedule_tasks (project_id, name, task_order, task_type, planned_start, planned_end, duration_days, predecessor_ids, parent_id, is_locked)
        VALUES (?, '', ?, '普通任务', ?, ?, 1, '[]', ?, 0)
      `).run(
        id, insertOrder,
        refTask.planned_start || todayStr(),
        refTask.planned_start || todayStr(),
        refTask.parent_id
      );

      // 重新编号同级兄弟
      renumberSiblings(id, refTask.parent_id);

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

    const projectId = task.project_id;

    const remove = db.transaction(() => {
      // 先将被删任务的子任务提升到其父级
      db.prepare(
        "UPDATE schedule_tasks SET parent_id = ? WHERE parent_id = ? AND project_id = ?"
      ).run(task.parent_id, Number(id), projectId);

      // 删除
      db.prepare("DELETE FROM schedule_tasks WHERE id = ?").run(id);

      // 清理其他任务中引用被删任务的 predecessor_ids
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

      // 重新编号被删任务的同级兄弟（父级=原父级）
      renumberSiblings(projectId, task.parent_id);

      // 重新计算阶段聚合
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

    // 查找同级兄弟任务（按 task_order 排序）
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
      // 将当前任务挂载到前一个兄弟任务下
      db.prepare(
        "UPDATE schedule_tasks SET parent_id = ?, updated_at = datetime('now','localtime') WHERE id = ?"
      ).run(prevSibling.id, taskId);

      // 放在新父任务子列表的最末尾
      const maxOrderRow = db.prepare(
        "SELECT MAX(task_order) AS max_order FROM schedule_tasks WHERE project_id = ? AND parent_id = ?"
      ).get(id, prevSibling.id);
      const newOrder = (maxOrderRow?.max_order || 0) + 1;

      db.prepare("UPDATE schedule_tasks SET task_order = ? WHERE id = ?")
        .run(newOrder, taskId);

      // 重新编号原同级兄弟（移除了当前任务后）
      renumberSiblings(id, task.parent_id);

      // 级联 + 聚合
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

    if (task.parent_id === null) {
      return res.status(400).json({
        ok: false,
        error: "顶级任务无法再升级",
      });
    }

    const parent = db.prepare("SELECT * FROM schedule_tasks WHERE id = ?").get(task.parent_id);
    const grandParentId = parent ? parent.parent_id : null;

    const outdent = db.transaction(() => {
      // 提升到祖父级（parent_id = 父级的 parent_id）
      db.prepare(
        "UPDATE schedule_tasks SET parent_id = ?, updated_at = datetime('now','localtime') WHERE id = ?"
      ).run(grandParentId, taskId);

      // 放在父任务之后的位置
      const newOrder = parent.task_order + 1;

      // 目标层级中，>= newOrder 的兄弟后移
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

      // 重新编号原同级兄弟
      renumberSiblings(id, task.parent_id);
      // 重新编号目标层级兄弟
      renumberSiblings(id, grandParentId);

      // 级联 + 聚合
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

    const allTasks = getProjectTasks(task.project_id);

    // 校验所有前置任务属于同一项目
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

    // 循环依赖检测
    if (detectCycle(allTasks, Number(id), predecessor_ids || [])) {
      return res.status(400).json({ ok: false, error: "检测到循环依赖，无法保存" });
    }

    const update = db.transaction(() => {
      // 更新前置任务
      db.prepare(
        "UPDATE schedule_tasks SET predecessor_ids = ?, updated_at = datetime('now','localtime') WHERE id = ?"
      ).run(JSON.stringify(predecessor_ids || []), id);

      // 重新计算开始日期（如果设置了前置）
      if (predecessor_ids && predecessor_ids.length > 0 && task.task_type !== "节点任务" && task.is_locked !== 1) {
        const predEnds = predecessor_ids
          .map(pid => allTasks.find(t => t.id === pid))
          .filter(Boolean)
          .map(p => p.planned_end)
          .filter(Boolean);

        if (predEnds.length > 0) {
          const maxEnd = predEnds.sort().reverse()[0];
          const newStart = addDays(maxEnd, 1);
          const newEnd = addDays(newStart, task.duration_days - 1);

          db.prepare(`
            UPDATE schedule_tasks SET planned_start = ?, planned_end = ?, updated_at = datetime('now','localtime')
            WHERE id = ?
          `).run(newStart, newEnd, id);
        }
      }

      // 级联传播
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
// 端点 9：GET /api/templates/schedule — 列出可用模板
// ============================================================
router.get("/templates/schedule", (req, res) => {
  try {
    if (!existsSync(TEMPLATES_DIR)) {
      return res.json({ ok: true, data: [] });
    }

    const files = readdirSync(TEMPLATES_DIR).filter(f => f.endsWith(".json"));
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
    const project = db.prepare("SELECT id FROM projects WHERE id = ?").get(id);
    if (!project) {
      return res.status(404).json({ ok: false, error: "项目不存在" });
    }

    const tasks = getProjectTasks(id);
    if (tasks.length === 0) {
      return res.status(400).json({ ok: false, error: "项目无排期数据可保存" });
    }

    // 计算版本名
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
    const project = db.prepare("SELECT id FROM projects WHERE id = ?").get(id);
    if (!project) {
      return res.status(404).json({ ok: false, error: "项目不存在" });
    }

    // 返回摘要（不含 tasks_snapshot 内容）
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

    let snapshotTasks;
    try {
      snapshotTasks = JSON.parse(version.tasks_snapshot);
    } catch {
      return res.status(400).json({ ok: false, error: "版本数据格式错误，无法恢复" });
    }

    const restore = db.transaction(() => {
      // 删除当前排期
      db.prepare("DELETE FROM schedule_tasks WHERE project_id = ?").run(id);

      // 恢复快照
      const insertStmt = db.prepare(`
        INSERT INTO schedule_tasks (id, project_id, name, task_order, task_type,
          planned_start, planned_end, duration_days, completion_status,
          predecessor_ids, parent_id, is_locked, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const t of snapshotTasks) {
        insertStmt.run(
          t.id, t.project_id, t.name, t.task_order, t.task_type,
          t.planned_start, t.planned_end, t.duration_days, t.completion_status,
          t.predecessor_ids, t.parent_id ?? null, t.is_locked ?? 0,
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

    let tasks = getProjectTasksTree(id);
    if (tasks.length === 0) {
      return res.status(400).json({ ok: false, error: "项目无排期数据可导出" });
    }

    tasks = updateAllCompletionStatuses(tasks);

    // 动态导入 exceljs
    const ExcelJS = (await import("exceljs")).default;

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("项目排期表");

    // 列定义
    sheet.columns = [
      { header: "序号", key: "order", width: 8 },
      { header: "任务名称", key: "name", width: 30 },
      { header: "开始时间", key: "start", width: 14 },
      { header: "完成时间", key: "end", width: 14 },
      { header: "工期", key: "duration", width: 8 },
      { header: "完成情况", key: "status", width: 12 },
      { header: "前置任务", key: "predecessors", width: 20 },
    ];

    // 构建 task 名称→行号的映射（用于公式）
    const taskRowMap = new Map();
    tasks.forEach((t, i) => {
      taskRowMap.set(t.id, i + 2); // +2 因为有标题行
    });

    // 数据行
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      const rowNum = i + 2;

      // 前置任务名称
      let predNames = "";
      try {
        const preds = JSON.parse(t.predecessor_ids || "[]");
        predNames = preds
          .map(pid => tasks.find(tt => tt.id === pid))
          .filter(Boolean)
          .map(p => p.name)
          .join("、");
      } catch { predNames = ""; }

      // 工期值
      const durationVal = t.duration_days || 1;

      // 树形缩进前缀
      const indent = "  ".repeat(t.depth || 0);
      const displayName = indent + (t.depth > 0 ? "└ " : "") + t.name;

      // 开始时间 — 如果有前置依赖，使用公式
      let startFormula = null;
      let preds = [];
      try { preds = JSON.parse(t.predecessor_ids || "[]"); } catch { preds = []; }

      if (preds.length > 0) {
        const predRows = preds
          .map(pid => taskRowMap.get(pid))
          .filter(Boolean);
        if (predRows.length === 1) {
          startFormula = `=WORKDAY(D${predRows[0]}, 1)`;
        } else if (predRows.length > 1) {
          const rangeRefs = predRows.map(r => `D${r}`).join(", ");
          startFormula = `=WORKDAY(MAX(${rangeRefs}), 1)`;
        }
      }

      // 结束时间公式
      let endFormula = null;
      if (startFormula) {
        endFormula = `=WORKDAY(C${rowNum}, E${rowNum} - 1)`;
      } else {
        endFormula = `=WORKDAY(C${rowNum}, E${rowNum} - 1)`;
      }

      const rowValues = [
        t.task_order,
        displayName,
        startFormula || t.planned_start,
        endFormula || t.planned_end,
        durationVal,
        t.completion_status || "未开始",
        predNames,
      ];

      sheet.addRow(rowValues);
    }

    // 设置日期格式
    for (let i = 0; i < tasks.length; i++) {
      const rowNum = i + 2;
      const startCell = sheet.getCell(rowNum, 3);
      const endCell = sheet.getCell(rowNum, 4);

      if (typeof startCell.value === "string" && !startCell.value.startsWith("=")) {
        startCell.numFmt = "yyyy-mm-dd";
      }
      if (typeof endCell.value === "string" && !endCell.value.startsWith("=")) {
        endCell.numFmt = "yyyy-mm-dd";
      }
    }

    // 设置表头样式
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE3F2FD" },
    };
    headerRow.alignment = { horizontal: "center", vertical: "middle" };

    // 设置边框
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

    // 响应 — 文件名整体编码避免中文导致 HTTP 头部异常
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

export default router;
