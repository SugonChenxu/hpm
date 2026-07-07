import { Router } from "express";
import db from "../db.js";

const router = Router();

// 项目列表
router.get("/projects", (req, res) => {
  const { status, category, search } = req.query;
  let sql = "SELECT * FROM projects WHERE 1=1";
  const params = [];
  if (status) { sql += " AND status = ?"; params.push(status); }
  if (category) { sql += " AND category = ?"; params.push(category); }
  if (search) { sql += " AND (code LIKE ? OR name LIKE ?)"; params.push(`%${search}%`, `%${search}%`); }
  sql += " ORDER BY updated_at DESC";
  res.json({ ok: true, data: db.prepare(sql).all(...params) });
});

// 创建项目
router.post("/projects", (req, res) => {
  const { code, name, category, template_id } = req.body;
  if (!code || !name) return res.status(400).json({ ok: false, error: "code 和 name 必填" });

  const result = db.prepare("INSERT INTO projects (code, name, category, template_id) VALUES (?, ?, ?, ?)").run(code, name, category || "新品", template_id || null);
  const projectId = result.lastInsertRowid;

  // 从模板实例化阶段
  if (template_id) {
    const template = db.prepare("SELECT phases_json FROM phase_templates WHERE id = ?").get(template_id);
    if (template) {
      const phases = JSON.parse(template.phases_json);
      const insert = db.prepare("INSERT INTO phases (project_id, name, phase_order, type, di_threshold, planned_end) VALUES (?, ?, ?, ?, ?, ?)");
      phases.forEach((p) => {
        const planned_end = p.duration_weeks ? new Date(Date.now() + p.duration_weeks * 7 * 86400000).toISOString().slice(0, 10) : null;
        insert.run(projectId, p.name, p.order, p.type, p.di_threshold || null, planned_end);
      });
    }
  }

  res.status(201).json({ ok: true, data: db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) });
});

// 项目详情
router.get("/projects/:id", (req, res) => {
  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id);
  if (!project) return res.status(404).json({ ok: false, error: "项目不存在" });
  const phases = db.prepare("SELECT * FROM phases WHERE project_id = ? ORDER BY phase_order").all(req.params.id);
  res.json({ ok: true, data: { ...project, phases } });
});

// 更新项目
router.put("/projects/:id", (req, res) => {
  const { code, name, category, status } = req.body;
  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id);
  if (!project) return res.status(404).json({ ok: false, error: "项目不存在" });

  db.prepare("UPDATE projects SET code=?, name=?, category=?, status=?, updated_at=datetime('now','localtime') WHERE id=?").run(code || project.code, name || project.name, category || project.category, status || project.status, req.params.id);
  res.json({ ok: true, data: db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id) });
});

// 归档项目
router.delete("/projects/:id", (req, res) => {
  db.prepare("UPDATE projects SET status='已归档', updated_at=datetime('now','localtime') WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// 模板列表
router.get("/templates", (req, res) => {
  res.json({ ok: true, data: db.prepare("SELECT id, name, is_preset FROM phase_templates").all() });
});

// 阶段列表
router.get("/projects/:id/phases", (req, res) => {
  res.json({ ok: true, data: db.prepare("SELECT * FROM phases WHERE project_id = ? ORDER BY phase_order").all(req.params.id) });
});

// 更新阶段
router.put("/projects/:id/phases/:phaseId", (req, res) => {
  const { name, planned_start, planned_end, actual_start, actual_end, status } = req.body;
  db.prepare("UPDATE phases SET name=COALESCE(?,name), planned_start=COALESCE(?,planned_start), planned_end=COALESCE(?,planned_end), actual_start=COALESCE(?,actual_start), actual_end=COALESCE(?,actual_end), status=COALESCE(?,status) WHERE id=? AND project_id=?").run(name, planned_start, planned_end, actual_start, actual_end, status, req.params.phaseId, req.params.id);
  res.json({ ok: true, data: db.prepare("SELECT * FROM phases WHERE id = ?").get(req.params.phaseId) });
});

// 门禁检查
router.post("/projects/:id/gates/:gateId/pass", (req, res) => {
  db.prepare("UPDATE gates SET is_passed=1, passed_at=datetime('now','localtime') WHERE id=? AND phase_id IN (SELECT id FROM phases WHERE project_id=?)").run(req.params.gateId, req.params.id);
  res.json({ ok: true });
});

export default router;
