import { Router } from "express";
import db from "../db.js";
const router = Router();

router.post("/weekly-reports/generate", (req, res) => {
  const { project_id, week_start, week_end } = req.body;
  if (!week_start || !week_end) return res.status(400).json({ ok: false, error: "week_start, week_end 必填" });

  if (project_id) {
    const proj = db.prepare("SELECT owner_id FROM projects WHERE id = ?").get(Number(project_id));
    if (!proj || proj.owner_id !== req.userId) return res.status(403).json({ ok: false, error: "无权访问该项目" });
  }
  const project = project_id ? db.prepare("SELECT * FROM projects WHERE id = ?").get(project_id) : null;
  const title = project ? `${project.code} 周报 ${week_start} ~ ${week_end}` : `全项目汇总 ${week_start} ~ ${week_end}`;

  // 汇总六板块数据（无 project_id 时按 owner_id 隔离，避免跨用户汇总）
  const progress = project_id
    ? db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN status='已完成' THEN 1 ELSE 0 END) as done FROM phases WHERE project_id=?").get(project_id)
    : { total: 0, done: 0 };

  const tasksNew = project_id
    ? db.prepare("SELECT COUNT(*) as cnt FROM tasks WHERE project_id=? AND created_at >= ? AND created_at <= ? AND deleted_at IS NULL").get(project_id, week_start, week_end).cnt
    : db.prepare("SELECT COUNT(*) as cnt FROM tasks WHERE owner_id=? AND created_at >= ? AND created_at <= ? AND deleted_at IS NULL").get(req.userId, week_start, week_end).cnt;

  const tasksDone = project_id
    ? db.prepare("SELECT COUNT(*) as cnt FROM tasks WHERE project_id=? AND status='已完成' AND updated_at >= ? AND updated_at <= ? AND deleted_at IS NULL").get(project_id, week_start, week_end).cnt
    : db.prepare("SELECT COUNT(*) as cnt FROM tasks WHERE owner_id=? AND status='已完成' AND updated_at >= ? AND updated_at <= ? AND deleted_at IS NULL").get(req.userId, week_start, week_end).cnt;

  const tasksOverdue = project_id
    ? db.prepare("SELECT COUNT(*) as cnt FROM tasks WHERE project_id=? AND due_date < ? AND status != '已完成' AND deleted_at IS NULL").get(project_id, week_end).cnt
    : db.prepare("SELECT COUNT(*) as cnt FROM tasks WHERE owner_id=? AND due_date < ? AND status != '已完成' AND deleted_at IS NULL").get(req.userId, week_end).cnt;

  const phaseDI = project_id
    ? db.prepare("SELECT SUM(di_weight) as total FROM issues WHERE project_id=? AND status != '已关闭'").get(project_id)
    : db.prepare("SELECT SUM(di_weight) as total FROM issues WHERE owner_id=? AND status != '已关闭'").get(req.userId);

  const materialOverdue = project_id
    ? db.prepare("SELECT COUNT(*) as cnt FROM materials WHERE project_id=? AND planned_delivery<date('now','localtime') AND status NOT IN ('已到货')").get(project_id).cnt
    : db.prepare("SELECT COUNT(*) as cnt FROM materials WHERE owner_id=? AND planned_delivery<date('now','localtime') AND status NOT IN ('已到货')").get(req.userId).cnt;

  const meetingCount = project_id
    ? db.prepare("SELECT COUNT(*) as cnt FROM meetings WHERE project_id=? AND start_time >= ? AND start_time <= ?").get(project_id, week_start, week_end).cnt
    : db.prepare("SELECT COUNT(*) as cnt FROM meetings WHERE owner_id=? AND start_time >= ? AND start_time <= ?").get(req.userId, week_start, week_end).cnt;

  const content = { progress: { total: progress.total, done: progress.done }, tasks: { new: tasksNew, done: tasksDone, overdue: tasksOverdue }, issues: { current_di: phaseDI?.total || 0 }, materials: { overdue: materialOverdue }, meetings: { count: meetingCount }, next_plan: "" };

  res.json({ ok: true, data: { title, week_start, week_end, content } });
});

router.get("/weekly-reports", (req, res) => {
  const { project_id } = req.query;
  let sql = "SELECT id, project_id, week_start, week_end, title, status, version, created_at FROM weekly_reports WHERE 1=1";
  const params = [];
  sql += " AND owner_id = ?";
  params.push(req.userId);
  if (project_id) { sql += " AND project_id = ?"; params.push(project_id); }
  sql += " ORDER BY week_start DESC";
  res.json({ ok: true, data: db.prepare(sql).all(...params) });
});

router.get("/weekly-reports/:id", (req, res) => {
  const report = db.prepare("SELECT * FROM weekly_reports WHERE id = ? AND owner_id = ?").get(req.params.id, req.userId);
  if (!report) return res.status(404).json({ ok: false, error: "周报不存在" });
  res.json({ ok: true, data: report });
});

router.put("/weekly-reports/:id", (req, res) => {
  const { content_json, status, title } = req.body;
  const report = db.prepare("SELECT * FROM weekly_reports WHERE id = ? AND owner_id = ?").get(req.params.id, req.userId);
  if (!report) {
    // 新建
    const { project_id, week_start, week_end } = req.body;
    if (project_id) {
      const proj = db.prepare("SELECT owner_id FROM projects WHERE id = ?").get(Number(project_id));
      if (!proj || proj.owner_id !== req.userId) return res.status(403).json({ ok: false, error: "无权访问该项目" });
    }
    const result = db.prepare("INSERT INTO weekly_reports (project_id, week_start, week_end, title, content_json, status, owner_id) VALUES (?, ?, ?, ?, ?, ?, ?)").run(project_id, week_start, week_end, title, JSON.stringify(content_json), status || "草稿", req.userId);
    return res.status(201).json({ ok: true, data: db.prepare("SELECT * FROM weekly_reports WHERE id = ?").get(result.lastInsertRowid) });
  }
  const newVersion = report.version + 1;
  db.prepare("UPDATE weekly_reports SET title=COALESCE(?,title), content_json=COALESCE(?,content_json), status=COALESCE(?,status), version=?, updated_at=datetime('now','localtime') WHERE id=?").run(title, content_json ? JSON.stringify(content_json) : null, status, newVersion, req.params.id);
  res.json({ ok: true, data: db.prepare("SELECT * FROM weekly_reports WHERE id = ?").get(req.params.id) });
});

export default router;
