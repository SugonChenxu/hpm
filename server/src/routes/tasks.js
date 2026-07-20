import { Router } from "express";
import db from "../db.js";
const router = Router();

// ── 任务 CRUD ──────────────────────────────────────────

router.get("/tasks", (req, res) => {
  const { project_id, phase_id, priority, assignee, status } = req.query;
  const params = [];

  let sql;
  if (project_id) {
    // 项目看板：按 sort_order 排序，包含 subtask_count 子查询
    sql = `SELECT t.*, 
      (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id AND s.deleted_at IS NULL) AS subtask_count
      FROM tasks t WHERE t.deleted_at IS NULL AND t.project_id = ?`;
    params.push(project_id);
    sql += " AND t.owner_id = ?";
    params.push(req.userId);
    sql += " ORDER BY t.sort_order ASC";
  } else {
    // 全局看板：保持原有排序
    sql = `SELECT t.*, 
      (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id AND s.deleted_at IS NULL) AS subtask_count
      FROM tasks t WHERE t.deleted_at IS NULL AND t.owner_id = ?`;
    params.push(req.userId);
  }

  if (phase_id) { sql += " AND t.phase_id = ?"; params.push(phase_id); }
  if (priority) { sql += " AND t.priority = ?"; params.push(priority); }
  if (assignee) { sql += " AND t.assignee = ?"; params.push(assignee); }
  if (status) { sql += " AND t.status = ?"; params.push(status); }

  if (!project_id) {
    sql += " ORDER BY t.priority ASC, t.due_date ASC";
  }

  res.json({ ok: true, data: db.prepare(sql).all(...params) });
});

router.post("/tasks", (req, res) => {
  const { project_id, phase_id, title, description, priority, assignee, kanban_column, due_date, status } = req.body;
  if (!title) return res.status(400).json({ ok: false, error: "title 必填" });

  // 自动计算 sort_order = MAX(sort_order) + 1（同项目内）
  let sortOrder = 0;
  if (project_id) {
    const proj = db.prepare("SELECT owner_id FROM projects WHERE id = ?").get(Number(project_id));
    if (!proj || proj.owner_id !== req.userId) return res.status(403).json({ ok: false, error: "无权访问该项目" });
    const max = db.prepare(
      "SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM tasks WHERE project_id = ? AND deleted_at IS NULL"
    ).get(project_id);
    sortOrder = max.max_sort + 1;
  }

  const result = db.prepare(
    "INSERT INTO tasks (project_id, phase_id, title, description, priority, assignee, kanban_column, due_date, status, sort_order, owner_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    project_id || null,
    phase_id || null,
    title,
    description || "",
    priority || "medium",
    assignee || "",
    kanban_column || "待开始",
    due_date || null,
    status || "待开始",
    sortOrder,
    req.userId
  );
  res.status(201).json({
    ok: true,
    data: db.prepare("SELECT * FROM tasks WHERE id = ?").get(result.lastInsertRowid),
  });
});

router.get("/tasks/overdue", (req, res) => {
  res.json({
    ok: true,
    data: db.prepare(
      "SELECT * FROM tasks WHERE deleted_at IS NULL AND due_date IS NOT NULL AND due_date < date('now','localtime') AND status NOT IN ('已完成') AND owner_id = ? ORDER BY due_date ASC"
    ).all(req.userId),
  });
});

router.get("/tasks/:id", (req, res) => {
  const task = db.prepare("SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL AND owner_id = ?").get(req.params.id, req.userId);
  if (!task) return res.status(404).json({ ok: false, error: "任务不存在" });
  res.json({ ok: true, data: task });
});

router.put("/tasks/:id", (req, res) => {
  const { title, description, priority, assignee, kanban_column, due_date, status, sort_order } = req.body;
  const task = db.prepare("SELECT * FROM tasks WHERE id = ? AND owner_id = ?").get(req.params.id, req.userId);
  if (!task) return res.status(404).json({ ok: false, error: "任务不存在" });

  db.prepare(
    `UPDATE tasks SET 
      title=COALESCE(?,title), 
      description=COALESCE(?,description), 
      priority=COALESCE(?,priority), 
      assignee=COALESCE(?,assignee), 
      kanban_column=COALESCE(?,kanban_column), 
      due_date=COALESCE(?,due_date), 
      status=COALESCE(?,status),
      sort_order=COALESCE(?,sort_order),
      updated_at=datetime('now','localtime') 
    WHERE id=? AND owner_id = ?`
  ).run(title, description, priority, assignee, kanban_column, due_date, status, sort_order ?? null, req.params.id, req.userId);
  res.json({ ok: true, data: db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id) });
});

router.delete("/tasks/:id", (req, res) => {
  db.prepare("UPDATE tasks SET deleted_at=datetime('now','localtime') WHERE id = ? AND owner_id = ?").run(req.params.id, req.userId);
  res.json({ ok: true });
});

router.put("/tasks/batch", (req, res) => {
  const { ids, updates } = req.body;
  if (!ids || !ids.length) return res.status(400).json({ ok: false, error: "ids 必填" });
  const sets = [];
  const params = [];
  if (updates.priority) { sets.push("priority = ?"); params.push(updates.priority); }
  if (updates.assignee) { sets.push("assignee = ?"); params.push(updates.assignee); }
  if (updates.status) { sets.push("status = ?"); params.push(updates.status); }
  if (updates.kanban_column) { sets.push("kanban_column = ?"); params.push(updates.kanban_column); }
  if (sets.length === 0) return res.status(400).json({ ok: false, error: "无更新字段" });
  params.push(...ids);
  params.push(req.userId);
  db.prepare(
    `UPDATE tasks SET ${sets.join(", ")}, updated_at=datetime('now','localtime') WHERE id IN (${ids.map(() => "?").join(",")}) AND owner_id = ?`
  ).run(...params);
  res.json({ ok: true });
});

// ── 看板列配置 ─────────────────────────────────────────

router.get("/kanban-columns", (req, res) => {
  res.json({ ok: true, data: db.prepare("SELECT * FROM kanban_columns ORDER BY column_order").all() });
});

router.put("/kanban-columns", (req, res) => {
  const { columns } = req.body;
  if (!columns || !columns.length) return res.status(400).json({ ok: false, error: "columns 必填" });
  db.prepare("DELETE FROM kanban_columns").run();
  const insert = db.prepare("INSERT INTO kanban_columns (name, column_order, color, is_default) VALUES (?, ?, ?, ?)");
  columns.forEach((c) =>
    insert.run(c.name, c.column_order || c.order, c.color || "#1565C0", c.is_default ? 1 : 0)
  );
  res.json({ ok: true, data: db.prepare("SELECT * FROM kanban_columns ORDER BY column_order").all() });
});

// ── 子任务 CRUD ────────────────────────────────────────

// 获取某任务的子任务列表
router.get("/tasks/:id/subtasks", (req, res) => {
  const task = db.prepare("SELECT id, owner_id FROM tasks WHERE id = ? AND deleted_at IS NULL").get(req.params.id);
  if (!task) return res.status(404).json({ ok: false, error: "任务不存在" });
  if (task.owner_id !== req.userId) return res.status(403).json({ ok: false, error: "无权访问该项目" });

  const subtasks = db.prepare(
    "SELECT * FROM subtasks WHERE task_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC"
  ).all(req.params.id);
  res.json({ ok: true, data: subtasks });
});

// 新增子任务
router.post("/tasks/:id/subtasks", (req, res) => {
  const { title } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ ok: false, error: "title 必填" });

  const task = db.prepare("SELECT id, owner_id FROM tasks WHERE id = ? AND deleted_at IS NULL").get(req.params.id);
  if (!task) return res.status(404).json({ ok: false, error: "任务不存在" });
  if (task.owner_id !== req.userId) return res.status(403).json({ ok: false, error: "无权访问该项目" });

  // 计算 sort_order = MAX(sort_order) + 1
  const max = db.prepare(
    "SELECT COALESCE(MAX(sort_order), -1) AS max_sort FROM subtasks WHERE task_id = ? AND deleted_at IS NULL"
  ).get(req.params.id);
  const sortOrder = max.max_sort + 1;

  const result = db.prepare(
    "INSERT INTO subtasks (task_id, title, sort_order) VALUES (?, ?, ?)"
  ).run(req.params.id, title.trim(), sortOrder);

  const subtask = db.prepare("SELECT * FROM subtasks WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json({ ok: true, data: subtask });
});

// 更新子任务
router.put("/subtasks/:id", (req, res) => {
  const { title, is_completed } = req.body;
  const subtask = db.prepare("SELECT * FROM subtasks WHERE id = ? AND deleted_at IS NULL").get(req.params.id);
  if (!subtask) return res.status(404).json({ ok: false, error: "子任务不存在" });
  const parent = db.prepare("SELECT owner_id FROM tasks WHERE id = ? AND deleted_at IS NULL").get(subtask.task_id);
  if (!parent || parent.owner_id !== req.userId) return res.status(403).json({ ok: false, error: "无权访问该项目" });

  if (title !== undefined) {
    db.prepare(
      "UPDATE subtasks SET title = ?, updated_at = datetime('now','localtime') WHERE id = ?"
    ).run(title, req.params.id);
  }
  if (is_completed !== undefined) {
    db.prepare(
      "UPDATE subtasks SET is_completed = ?, updated_at = datetime('now','localtime') WHERE id = ?"
    ).run(is_completed ? 1 : 0, req.params.id);
  }

  const updated = db.prepare("SELECT * FROM subtasks WHERE id = ?").get(req.params.id);
  res.json({ ok: true, data: updated });
});

// 删除子任务（软删除）
router.delete("/subtasks/:id", (req, res) => {
  const subtask = db.prepare("SELECT * FROM subtasks WHERE id = ? AND deleted_at IS NULL").get(req.params.id);
  if (!subtask) return res.status(404).json({ ok: false, error: "子任务不存在" });
  const parent = db.prepare("SELECT owner_id FROM tasks WHERE id = ? AND deleted_at IS NULL").get(subtask.task_id);
  if (!parent || parent.owner_id !== req.userId) return res.status(403).json({ ok: false, error: "无权访问该项目" });

  db.prepare("UPDATE subtasks SET deleted_at = datetime('now','localtime') WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// ── 排序与完成切换 ─────────────────────────────────────

// 调整任务排序
router.put("/tasks/:id/reorder", (req, res) => {
  const { sort_order, project_id } = req.body;
  const taskId = Number(req.params.id);

  const task = db.prepare("SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL AND owner_id = ?").get(taskId, req.userId);
  if (!task) return res.status(404).json({ ok: false, error: "任务不存在" });

  const pid = project_id || task.project_id;

  const reorder = db.transaction(() => {
    // 获取所有未完成任务（按当前 sort_order），排除被移动的任务
    const tasks = db.prepare(
      "SELECT id, sort_order FROM tasks WHERE project_id = ? AND deleted_at IS NULL AND id != ? ORDER BY sort_order ASC"
    ).all(pid, taskId);

    // 重建排序列表：将目标任务插入到指定位置
    const reordered = [...tasks];
    const targetIndex = Math.min(sort_order, reordered.length);
    reordered.splice(targetIndex, 0, { id: taskId, sort_order: targetIndex });

    // 更新所有任务的 sort_order
    const updateStmt = db.prepare(
      "UPDATE tasks SET sort_order = ?, updated_at = datetime('now','localtime') WHERE id = ?"
    );
    reordered.forEach((t, idx) => {
      updateStmt.run(idx, t.id);
    });
  });

  reorder();

  const updated = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId);
  res.json({ ok: true, data: updated });
});

// 切换任务完成状态
router.put("/tasks/:id/toggle-complete", (req, res) => {
  const task = db.prepare("SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL AND owner_id = ?").get(req.params.id, req.userId);
  if (!task) return res.status(404).json({ ok: false, error: "任务不存在" });

  if (task.completed_at) {
    // 取消完成 → 移回待办
    db.prepare(
      `UPDATE tasks SET 
        completed_at = NULL, 
        kanban_column = '待开始', 
        status = '待开始', 
        updated_at = datetime('now','localtime') 
      WHERE id = ?`
    ).run(req.params.id);
  } else {
    // 标记完成
    db.prepare(
      `UPDATE tasks SET 
        completed_at = datetime('now','localtime'), 
        kanban_column = '已完成', 
        status = '已完成', 
        updated_at = datetime('now','localtime') 
      WHERE id = ?`
    ).run(req.params.id);
  }

  const updated = db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id);
  res.json({ ok: true, data: updated });
});

export default router;
