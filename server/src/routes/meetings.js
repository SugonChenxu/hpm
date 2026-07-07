import { Router } from "express";
import db from "../db.js";
const router = Router();

router.get("/meetings", (req, res) => {
  const { project_id, platform, from, to } = req.query;
  let sql = "SELECT * FROM meetings WHERE 1=1";
  const params = [];
  if (project_id) { sql += " AND project_id = ?"; params.push(project_id); }
  if (platform) { sql += " AND platform = ?"; params.push(platform); }
  if (from) { sql += " AND start_time >= ?"; params.push(from); }
  if (to) { sql += " AND start_time <= ?"; params.push(to); }
  sql += " ORDER BY start_time DESC";
  res.json({ ok: true, data: db.prepare(sql).all(...params) });
});

router.post("/meetings", (req, res) => {
  const { project_id, phase_id, title, start_time, end_time, attendee_count, attendees_json, platform } = req.body;
  if (!title) return res.status(400).json({ ok: false, error: "title 必填" });
  const duration = start_time && end_time ? Math.round((new Date(end_time) - new Date(start_time)) / 60000) : null;
  const result = db.prepare("INSERT INTO meetings (project_id, phase_id, platform, title, start_time, end_time, duration_minutes, attendee_count, attendees_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(project_id || null, phase_id || null, platform || "manual", title, start_time || null, end_time || null, duration, attendee_count || null, attendees_json ? JSON.stringify(attendees_json) : null);
  res.status(201).json({ ok: true, data: db.prepare("SELECT * FROM meetings WHERE id = ?").get(result.lastInsertRowid) });
});

router.get("/meetings/:id", (req, res) => {
  const meeting = db.prepare("SELECT * FROM meetings WHERE id = ?").get(req.params.id);
  if (!meeting) return res.status(404).json({ ok: false, error: "会议不存在" });
  const actionItems = db.prepare("SELECT * FROM meeting_action_items WHERE meeting_id = ?").all(req.params.id);
  res.json({ ok: true, data: { ...meeting, action_items: actionItems } });
});

router.put("/meetings/:id", (req, res) => {
  const { title, minutes_text, minutes_status, start_time, end_time } = req.body;
  const m = db.prepare("SELECT * FROM meetings WHERE id = ?").get(req.params.id);
  if (!m) return res.status(404).json({ ok: false, error: "会议不存在" });
  db.prepare("UPDATE meetings SET title=COALESCE(?,title), minutes_text=COALESCE(?,minutes_text), minutes_status=COALESCE(?,minutes_status), start_time=COALESCE(?,start_time), end_time=COALESCE(?,end_time), updated_at=datetime('now','localtime') WHERE id=?").run(title, minutes_text, minutes_status, start_time, end_time, req.params.id);
  res.json({ ok: true, data: db.prepare("SELECT * FROM meetings WHERE id = ?").get(req.params.id) });
});

router.post("/meetings/:id/action-items", (req, res) => {
  const { content, assignee, due_date } = req.body;
  if (!content) return res.status(400).json({ ok: false, error: "content 必填" });
  const result = db.prepare("INSERT INTO meeting_action_items (meeting_id, content, assignee, due_date) VALUES (?, ?, ?, ?)").run(req.params.id, content, assignee || "", due_date || null);
  res.status(201).json({ ok: true, data: db.prepare("SELECT * FROM meeting_action_items WHERE id = ?").get(result.lastInsertRowid) });
});

router.put("/meetings/:id/action-items/:aid", (req, res) => {
  const { content, assignee, due_date, status } = req.body;
  db.prepare("UPDATE meeting_action_items SET content=COALESCE(?,content), assignee=COALESCE(?,assignee), due_date=COALESCE(?,due_date), status=COALESCE(?,status), completed_at=CASE WHEN ?='已完成' THEN datetime('now','localtime') ELSE completed_at END WHERE id=? AND meeting_id=?").run(content, assignee, due_date, status, status, req.params.aid, req.params.id);
  res.json({ ok: true });
});

router.post("/meetings/:id/action-items/:aid/convert", (req, res) => {
  const ai = db.prepare("SELECT * FROM meeting_action_items WHERE id = ?").get(req.params.aid);
  if (!ai) return res.status(404).json({ ok: false, error: "决议项不存在" });
  const result = db.prepare("INSERT INTO tasks (project_id, title, description, assignee, due_date, priority, kanban_column) VALUES (?, ?, ?, ?, ?, 'P1', '待开始')").run(null, ai.content, `来自会议决议 #${ai.id}`, ai.assignee, ai.due_date);
  db.prepare("UPDATE meeting_action_items SET linked_task_id = ? WHERE id = ?").run(result.lastInsertRowid, req.params.aid);
  res.status(201).json({ ok: true, data: db.prepare("SELECT * FROM tasks WHERE id = ?").get(result.lastInsertRowid) });
});

router.get("/meeting-config", (req, res) => {
  res.json({ ok: true, data: db.prepare("SELECT * FROM meeting_platform_config").all() });
});

router.put("/meeting-config", (req, res) => {
  const { platform, app_id, secret, enterprise_id, is_active } = req.body;
  db.prepare("UPDATE meeting_platform_config SET app_id=COALESCE(?,app_id), secret=COALESCE(?,secret), enterprise_id=COALESCE(?,enterprise_id), is_active=COALESCE(?,is_active) WHERE platform=?").run(app_id, secret, enterprise_id, is_active, platform);
  res.json({ ok: true });
});

export default router;
