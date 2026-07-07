import { Router } from "express";
import db from "../db.js";
const router = Router();

const DI_WEIGHTS = { Critical: 10, Major: 3, Minor: 1, Trivial: 0.1 };

router.get("/issues", (req, res) => {
  const { project_id, phase_id, severity, status, source, search } = req.query;
  let sql = "SELECT * FROM issues WHERE 1=1";
  const params = [];
  if (project_id) { sql += " AND project_id = ?"; params.push(project_id); }
  if (phase_id) { sql += " AND phase_id = ?"; params.push(phase_id); }
  if (severity) { sql += " AND severity = ?"; params.push(severity); }
  if (status) { sql += " AND status = ?"; params.push(status); }
  if (source) { sql += " AND source = ?"; params.push(source); }
  if (search) { sql += " AND (code LIKE ? OR title LIKE ?)"; params.push(`%${search}%`, `%${search}%`); }
  sql += " ORDER BY di_weight DESC, created_at DESC";
  res.json({ ok: true, data: db.prepare(sql).all(...params) });
});

router.post("/issues", (req, res) => {
  const { project_id, phase_id, title, description, severity, assignee } = req.body;
  if (!title || !project_id) return res.status(400).json({ ok: false, error: "title 和 project_id 必填" });
  const di_weight = DI_WEIGHTS[severity] || 1;
  const count = db.prepare("SELECT COUNT(*) as cnt FROM issues WHERE source='local'").get().cnt;
  const code = `HPM-${String(count + 1).padStart(4, "0")}`;
  const result = db.prepare("INSERT INTO issues (project_id, phase_id, code, title, description, severity, assignee, di_weight, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'local')").run(project_id, phase_id || null, code, title, description || "", severity || "Minor", assignee || "", di_weight);
  res.status(201).json({ ok: true, data: db.prepare("SELECT * FROM issues WHERE id = ?").get(result.lastInsertRowid) });
});

router.get("/issues/di-summary", (req, res) => {
  const { project_id } = req.query;
  if (!project_id) return res.status(400).json({ ok: false, error: "project_id 必填" });
  const byPhase = db.prepare("SELECT phase_id, SUM(di_weight) as current_di, COUNT(*) as count FROM issues WHERE project_id=? AND status NOT IN ('已关闭') GROUP BY phase_id").all(project_id);
  const total = db.prepare("SELECT SUM(di_weight) as total_di, COUNT(*) as total_count FROM issues WHERE project_id=? AND status NOT IN ('已关闭')").get(project_id);
  res.json({ ok: true, data: { byPhase, total } });
});

router.get("/issues/:id", (req, res) => {
  const issue = db.prepare("SELECT * FROM issues WHERE id = ?").get(req.params.id);
  if (!issue) return res.status(404).json({ ok: false, error: "缺陷不存在" });
  res.json({ ok: true, data: issue });
});

router.put("/issues/:id", (req, res) => {
  const { title, description, severity, status, assignee } = req.body;
  const issue = db.prepare("SELECT * FROM issues WHERE id = ?").get(req.params.id);
  if (!issue) return res.status(404).json({ ok: false, error: "缺陷不存在" });
  const newSeverity = severity || issue.severity;
  const di_weight = DI_WEIGHTS[newSeverity] || issue.di_weight;
  db.prepare("UPDATE issues SET title=COALESCE(?,title), description=COALESCE(?,description), severity=COALESCE(?,severity), status=COALESCE(?,status), assignee=COALESCE(?,assignee), di_weight=?, updated_at=datetime('now','localtime') WHERE id=?").run(title, description, severity, status, assignee, di_weight, req.params.id);
  res.json({ ok: true, data: db.prepare("SELECT * FROM issues WHERE id = ?").get(req.params.id) });
});

router.get("/mantis/connection", (req, res) => {
  res.json({ ok: true, data: db.prepare("SELECT * FROM mantis_connection LIMIT 1").get() || {} });
});

router.put("/mantis/connection", (req, res) => {
  const { server_url, api_token, project_mapping, sync_interval_min } = req.body;
  const existing = db.prepare("SELECT id FROM mantis_connection LIMIT 1").get();
  if (existing) {
    db.prepare("UPDATE mantis_connection SET server_url=COALESCE(?,server_url), api_token=COALESCE(?,api_token), project_mapping=COALESCE(?,project_mapping), sync_interval_min=COALESCE(?,sync_interval_min) WHERE id=?").run(server_url, api_token, project_mapping ? JSON.stringify(project_mapping) : null, sync_interval_min, existing.id);
  } else {
    db.prepare("INSERT INTO mantis_connection (server_url, api_token, project_mapping, sync_interval_min) VALUES (?,?,?,?)").run(server_url || "", api_token || "", project_mapping ? JSON.stringify(project_mapping) : "[]", sync_interval_min || 30);
  }
  res.json({ ok: true });
});

export default router;
