import { Router } from "express";
import db from "../db.js";

const router = Router();

// 项目列表
router.get("/projects", (req, res) => {
  const { status, category, search } = req.query;
  let sql = `SELECT p.*,
    (SELECT ph.name FROM phases ph 
     WHERE ph.project_id = p.id AND ph.status = '进行中' 
     ORDER BY ph.phase_order LIMIT 1) as current_phase
    FROM projects p WHERE 1=1`;
  const params = [];
  if (status) { sql += " AND p.status = ?"; params.push(status); }
  if (category) { sql += " AND p.category = ?"; params.push(category); }
  if (search) { sql += " AND (p.code LIKE ? OR p.name LIKE ?)"; params.push(`%${search}%`, `%${search}%`); }
  sql += " ORDER BY p.sort_order ASC, p.updated_at DESC";
  res.json({ ok: true, data: db.prepare(sql).all(...params) });
});

// 创建项目
router.post("/projects", (req, res) => {
  const { code, name, category, template_id, theme_color, department, order_number, storage_location, meeting_time } = req.body;
  if (!code || !name) return res.status(400).json({ ok: false, error: "code 和 name 必填" });

  const result = db.prepare(
    `INSERT INTO projects (code, name, category, template_id, theme_color, department, order_number, storage_location, meeting_time) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    code, name, category || "新品", template_id || null,
    theme_color || "#1565C0",
    department || "", order_number || "", storage_location || "", meeting_time || ""
  );
  const projectId = result.lastInsertRowid;

  // 从模板实例化阶段
  if (template_id) {
    const template = db.prepare("SELECT phases_json FROM phase_templates WHERE id = ?").get(template_id);
    if (template) {
      const phases = JSON.parse(template.phases_json);
      const insert = db.prepare(
        "INSERT INTO phases (project_id, name, phase_order, type, di_threshold, planned_end) VALUES (?, ?, ?, ?, ?, ?)"
      );
      phases.forEach((p) => {
        const planned_end = p.duration_weeks
          ? new Date(Date.now() + p.duration_weeks * 7 * 86400000).toISOString().slice(0, 10)
          : null;
        insert.run(projectId, p.name, p.order, p.type, p.di_threshold || null, planned_end);
      });
    }
  }

  res.status(201).json({ ok: true, data: db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) });
});

// 批量更新项目排序
router.put("/projects/reorder", (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) return res.status(400).json({ ok: false, error: "orderedIds 必须是数组" });
  const update = db.prepare("UPDATE projects SET sort_order = ? WHERE id = ?");
  const tx = db.transaction(() => {
    orderedIds.forEach((id, index) => update.run(index, id));
  });
  tx();
  res.json({ ok: true });
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
  const { code, name, category, status, theme_color, department, order_number, storage_location, meeting_time } = req.body;
  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id);
  if (!project) return res.status(404).json({ ok: false, error: "项目不存在" });

  db.prepare(
    `UPDATE projects SET 
      code=?, name=?, category=?, status=?, 
      theme_color=COALESCE(?, theme_color),
      department=COALESCE(?, department),
      order_number=COALESCE(?, order_number),
      storage_location=COALESCE(?, storage_location),
      meeting_time=COALESCE(?, meeting_time),
      updated_at=datetime('now','localtime') 
    WHERE id=?`
  ).run(
    code || project.code,
    name || project.name,
    category || project.category,
    status || project.status,
    (theme_color ?? project.theme_color) || "#1565C0",
    department !== undefined ? department : project.department,
    order_number !== undefined ? order_number : project.order_number,
    storage_location !== undefined ? storage_location : project.storage_location,
    meeting_time !== undefined ? meeting_time : project.meeting_time,
    req.params.id
  );
  res.json({ ok: true, data: db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id) });
});

// 删除项目（级联清除所有关联数据）
router.delete("/projects/:id", (req, res) => {
  const { id } = req.params;
  const project = db.prepare("SELECT id FROM projects WHERE id = ?").get(id);
  if (!project) return res.status(404).json({ ok: false, error: "项目不存在" });

  const tx = db.transaction(() => {
    // 子任务
    db.prepare("DELETE FROM subtasks WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ?)").run(id);
    // 任务
    db.prepare("DELETE FROM tasks WHERE project_id = ?").run(id);
    // 阶段
    db.prepare("DELETE FROM phases WHERE project_id = ?").run(id);
    // 故障
    db.prepare("DELETE FROM issues WHERE project_id = ?").run(id);
    // 物料
    db.prepare("DELETE FROM materials WHERE project_id = ?").run(id);
    // 会议
    db.prepare("DELETE FROM meetings WHERE project_id = ?").run(id);
    // 周报
    db.prepare("DELETE FROM weekly_reports WHERE project_id = ?").run(id);
    // 排期相关
    try { db.prepare("DELETE FROM schedule_tasks WHERE project_id = ?").run(id); } catch (_) {}
    try { db.prepare("DELETE FROM schedule_versions WHERE project_id = ?").run(id); } catch (_) {}
    // 项目本身
    db.prepare("DELETE FROM projects WHERE id = ?").run(id);
  });
  tx();

  res.json({ ok: true, message: `项目及其全部关联数据已删除` });
});

// ── 看板统计 ──────────────────────────────────────────

router.get("/projects/:id/kanban-stats", (req, res) => {
  const projectId = req.params.id;

  const project = db.prepare("SELECT id FROM projects WHERE id = ?").get(projectId);
  if (!project) return res.status(404).json({ ok: false, error: "项目不存在" });

  const total = db.prepare(
    "SELECT COUNT(*) AS cnt FROM tasks WHERE project_id = ? AND deleted_at IS NULL"
  ).get(projectId).cnt;

  const todo = db.prepare(
    "SELECT COUNT(*) AS cnt FROM tasks WHERE project_id = ? AND deleted_at IS NULL AND completed_at IS NULL"
  ).get(projectId).cnt;

  const done = db.prepare(
    "SELECT COUNT(*) AS cnt FROM tasks WHERE project_id = ? AND deleted_at IS NULL AND completed_at IS NOT NULL"
  ).get(projectId).cnt;

  const subtasksTotal = db.prepare(
    `SELECT COUNT(*) AS cnt FROM subtasks s 
     INNER JOIN tasks t ON s.task_id = t.id 
     WHERE t.project_id = ? AND s.deleted_at IS NULL AND t.deleted_at IS NULL`
  ).get(projectId).cnt;

  const subtasksDone = db.prepare(
    `SELECT COUNT(*) AS cnt FROM subtasks s 
     INNER JOIN tasks t ON s.task_id = t.id 
     WHERE t.project_id = ? AND s.deleted_at IS NULL AND t.deleted_at IS NULL AND s.is_completed = 1`
  ).get(projectId).cnt;

  res.json({
    ok: true,
    data: {
      total,
      todo,
      done,
      subtasks_total: subtasksTotal,
      subtasks_done: subtasksDone,
    },
  });
});

// 模板列表
router.get("/templates", (req, res) => {
  res.json({ ok: true, data: db.prepare("SELECT id, name, is_preset FROM phase_templates").all() });
});

// 阶段列表
router.get("/projects/:id/phases", (req, res) => {
  res.json({
    ok: true,
    data: db.prepare("SELECT * FROM phases WHERE project_id = ? ORDER BY phase_order").all(req.params.id),
  });
});

// 更新阶段
router.put("/projects/:id/phases/:phaseId", (req, res) => {
  const { name, planned_start, planned_end, actual_start, actual_end, status } = req.body;
  db.prepare(
    `UPDATE phases SET 
      name=COALESCE(?,name), 
      planned_start=COALESCE(?,planned_start), 
      planned_end=COALESCE(?,planned_end), 
      actual_start=COALESCE(?,actual_start), 
      actual_end=COALESCE(?,actual_end), 
      status=COALESCE(?,status) 
    WHERE id=? AND project_id=?`
  ).run(name, planned_start, planned_end, actual_start, actual_end, status, req.params.phaseId, req.params.id);
  res.json({ ok: true, data: db.prepare("SELECT * FROM phases WHERE id = ?").get(req.params.phaseId) });
});

// 门禁检查
router.post("/projects/:id/gates/:gateId/pass", (req, res) => {
  db.prepare(
    "UPDATE gates SET is_passed=1, passed_at=datetime('now','localtime') WHERE id=? AND phase_id IN (SELECT id FROM phases WHERE project_id=?)"
  ).run(req.params.gateId, req.params.id);
  res.json({ ok: true });
});

export default router;
