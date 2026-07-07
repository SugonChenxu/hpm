import { Router } from "express";
import db from "../db.js";
const router = Router();

router.get("/tasks", (req, res) => {
  const { project_id, phase_id, priority, assignee, status } = req.query;
  let sql = "SELECT * FROM tasks WHERE deleted_at IS NULL";
  const params = [];
  if (project_id) { sql += " AND project_id = ?"; params.push(project_id); }
  if (phase_id) { sql += " AND phase_id = ?"; params.push(phase_id); }
  if (priority) { sql += " AND priority = ?"; params.push(priority); }
  if (assignee) { sql += " AND assignee = ?"; params.push(assignee); }
  if (status) { sql += " AND status = ?"; params.push(status); }
  sql += " ORDER BY priority ASC, due_date ASC";
  res.json({ ok: true, data: db.prepare(sql).all(...params) });
});

router.post("/tasks", (req, res) => {
  const { project_id, phase_id, title, description, priority, assignee, kanban_column, due_date, status } = req.body;
  if (!title) return res.status(400).json({ ok: false, error: "title 必填" });
  const result = db.prepare("INSERT INTO tasks (project_id, phase_id, title, description, priority, assignee, kanban_column, due_date, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(project_id || null, phase_id || null, title, description || "", priority || "P2", assignee || "", kanban_column || "待开始", due_date || null, status || "待开始");
  res.status(201).json({ ok: true, data: db.prepare("SELECT * FROM tasks WHERE id = ?").get(result.lastInsertRowid) });
});

router.get("/tasks/overdue", (req, res) => {
  res.json({ ok: true, data: db.prepare("SELECT * FROM tasks WHERE deleted_at IS NULL AND due_date IS NOT NULL AND due_date < date('now','localtime') AND status NOT IN ('已完成') ORDER BY due_date ASC").all() });
});

router.get("/tasks/:id", (req, res) => {
  const task = db.prepare("SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL").get(req.params.id);
  if (!task) return res.status(404).json({ ok: false, error: "任务不存在" });
  res.json({ ok: true, data: task });
});

router.put("/tasks/:id", (req, res) => {
  const { title, description, priority, assignee, kanban_column, due_date, status } = req.body;
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id);
  if (!task) return res.status(404).json({ ok: false, error: "任务不存在" });
  db.prepare("UPDATE tasks SET title=COALESCE(?,title), description=COALESCE(?,description), priority=COALESCE(?,priority), assignee=COALESCE(?,assignee), kanban_column=COALESCE(?,kanban_column), due_date=COALESCE(?,due_date), status=COALESCE(?,status), updated_at=datetime('now','localtime') WHERE id=?").run(title, description, priority, assignee, kanban_column, due_date, status, req.params.id);
  res.json({ ok: true, data: db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id) });
});

router.delete("/tasks/:id", (req, res) => {
  db.prepare("UPDATE tasks SET deleted_at=datetime('now','localtime') WHERE id = ?").run(req.params.id);
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
  db.prepare(`UPDATE tasks SET ${sets.join(", ")}, updated_at=datetime('now','localtime') WHERE id IN (${ids.map(() => "?").join(",")})`).run(...params);
  res.json({ ok: true });
});

router.get("/kanban-columns", (req, res) => {
  res.json({ ok: true, data: db.prepare("SELECT * FROM kanban_columns ORDER BY column_order").all() });
});

router.put("/kanban-columns", (req, res) => {
  const { columns } = req.body;
  if (!columns || !columns.length) return res.status(400).json({ ok: false, error: "columns 必填" });
  db.prepare("DELETE FROM kanban_columns").run();
  const insert = db.prepare("INSERT INTO kanban_columns (name, column_order, color, is_default) VALUES (?, ?, ?, ?)");
  columns.forEach(c => insert.run(c.name, c.column_order || c.order, c.color || "#1565C0", c.is_default ? 1 : 0));
  res.json({ ok: true, data: db.prepare("SELECT * FROM kanban_columns ORDER BY column_order").all() });
});

export default router;
