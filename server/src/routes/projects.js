import { Router } from "express";
import db from "../db.js";
import { getConnection, getAdapter, resolveMantisId } from "../mantis-resolve.js";

const router = Router();

// ── 项目卡片故障概览：DI 趋势（Mantis 实时）短缓存 ──
// 说明：头条 DI / 故障数 / 解决率 / 未解决分类 已统一改读本地 issues 表（与 M3 故障管理同源），
// 因此这些字段每次实时计算、无需缓存。仅「DI 趋势」依赖 Mantis 时序接口，
// 保留短缓存（TTL 300s），并在 Mantis 同步成功后失效（见 mantis.js）。
function getTrendCache(ownerId, mantisId) {
  const row = db.prepare(
    "SELECT cache_data FROM sync_cache WHERE project_id=? AND cache_key=? AND owner_id=?"
  ).get(String(mantisId), "dashboard_trend", ownerId);
  if (!row) return null;
  try { return JSON.parse(row.cache_data); } catch { return null; }
}
function setTrendCache(ownerId, mantisId, data) {
  db.prepare("DELETE FROM sync_cache WHERE project_id=? AND cache_key=? AND owner_id=?")
    .run(String(mantisId), "dashboard_trend", ownerId);
  db.prepare(
    "INSERT INTO sync_cache (project_id, cache_key, cache_data, ttl_seconds, owner_id) VALUES (?,?,?,300,?)"
  ).run(String(mantisId), "dashboard_trend", JSON.stringify(data), ownerId);
}

// 从本地 issues 表聚合故障概览（与 M3 故障管理共用同一数据源）
// 返回 { di, total, resolved, rate }
function aggregateLocalIssues(ownerId, projectId) {
  const rows = db.prepare(
    "SELECT di_weight, status, category FROM issues WHERE project_id=? AND owner_id=?"
  ).all(Number(projectId), ownerId);
  const total = rows.length;
  const resolved = rows.filter((r) => (r.status || "") === "已解决").length;
  const di = Math.round(
    rows
      .filter((r) => (r.status || "") !== "已关闭")
      .reduce((s, r) => s + (Number(r.di_weight) || 0), 0) * 100
  ) / 100;
  const rate = total > 0 ? Math.round((resolved / total) * 10000) / 100 : 0;
  // 未解决分类分布（category 可能以 "/" 分隔多分类）
  const counts = {};
  for (const r of rows) {
    if ((r.status || "") === "已解决") continue;
    const cats = (r.category || "").split("/").map((c) => c.trim()).filter(Boolean);
    const list = cats.length ? cats : ["其他"];
    for (const c of list) counts[c] = (counts[c] || 0) + 1;
  }
  const unresolvedCategoryStats = Object.entries(counts)
    .map(([category, count]) => ({ category, count }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count);
  return { summary: { di, total, resolved, rate }, unresolvedCategoryStats };
}

// 项目卡片故障概览
// 返回 { linked, summary(来自本地 issues), unresolvedCategoryStats(本地), diTrend(Mantis 时序) }
//       linked=false 时 diTrend=[]，但 summary 仍来自本地 issues（即使未关联 Mantis 也展示本地缺陷）
router.get("/projects/:id/faults", async (req, res) => {
  const projectId = req.params.id;
  const ownerId = req.userId;
  const project = db.prepare("SELECT id FROM projects WHERE id=? AND owner_id=?").get(projectId, ownerId);
  if (!project) return res.status(404).json({ ok: false, error: "项目不存在" });

  // 1) 头条 DI / 故障数 / 解决率 / 分类 —— 始终来自本地 issues（实时、与 M3 同源）
  const local = aggregateLocalIssues(ownerId, projectId);

  // 2) DI 趋势 —— 来自 Mantis 时序接口（与 M3 故障仪表板同源），短缓存
  let linked = false;
  let diTrend = [];
  try {
    const conn = getConnection(ownerId);
    if (conn && conn.api_token) {
      let mantisId;
      try {
        mantisId = await resolveMantisId(ownerId, projectId);
      } catch (e) {
        if (e.code === "no_match") mantisId = null;
        else throw e;
      }
      if (mantisId) {
        linked = true;
        const cached = getTrendCache(ownerId, mantisId);
        if (cached) {
          diTrend = cached;
        } else {
          const adapter = getAdapter(ownerId);
          diTrend = await adapter.fetchDITrend(mantisId);
          setTrendCache(ownerId, mantisId, diTrend);
        }
      }
    }
  } catch (e) {
    // 趋势拉取失败不影响头条 DI（已来自本地），仅趋势为空
    console.warn(`[faults] DI 趋势拉取失败 project=${projectId}:`, e?.message || e);
  }

  res.json({
    ok: true,
    linked,
    ...local,
    diTrend,
  });
});

// 项目列表（仅当前用户）
router.get("/projects", (req, res) => {
  const { status, category, search } = req.query;
  let sql = `SELECT p.* FROM projects p WHERE p.owner_id = ?`;
  const params = [req.userId];
  if (status) { sql += " AND p.status = ?"; params.push(status); }
  if (category) { sql += " AND p.category = ?"; params.push(category); }
  if (search) { sql += " AND (p.code LIKE ? OR p.name LIKE ?)"; params.push(`%${search}%`, `%${search}%`); }
  sql += " ORDER BY p.sort_order ASC, p.updated_at DESC";
  res.json({ ok: true, data: db.prepare(sql).all(...params) });
});

// 创建项目（归属当前用户）
router.post("/projects", (req, res) => {
  const { code, name, category, template_id, theme_color, department, order_number, storage_location, meeting_time, current_phase } = req.body;
  if (!code || !name) return res.status(400).json({ ok: false, error: "code 和 name 必填" });

  const result = db.prepare(
    `INSERT INTO projects (code, name, category, template_id, theme_color, department, order_number, storage_location, meeting_time, current_phase, owner_id) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    code, name, category || "新品", template_id || null,
    theme_color || "#1565C0",
    department || "", order_number || "", storage_location || "", meeting_time || "",
    current_phase || "pre_research",
    req.userId
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
  const update = db.prepare("UPDATE projects SET sort_order = ? WHERE id = ? AND owner_id = ?");
  const tx = db.transaction(() => {
    orderedIds.forEach((id, index) => update.run(index, id, req.userId));
  });
  tx();
  res.json({ ok: true });
});

// 项目详情（仅当前用户）
router.get("/projects/:id", (req, res) => {
  const project = db.prepare("SELECT * FROM projects WHERE id = ? AND owner_id = ?").get(req.params.id, req.userId);
  if (!project) return res.status(404).json({ ok: false, error: "项目不存在" });
  const phases = db.prepare("SELECT * FROM phases WHERE project_id = ? ORDER BY phase_order").all(req.params.id);
  res.json({ ok: true, data: { ...project, phases } });
});

// 更新项目（仅当前用户）
router.put("/projects/:id", (req, res) => {
  const { code, name, category, status, theme_color, department, order_number, storage_location, meeting_time, current_phase } = req.body;
  const project = db.prepare("SELECT * FROM projects WHERE id = ? AND owner_id = ?").get(req.params.id, req.userId);
  if (!project) return res.status(404).json({ ok: false, error: "项目不存在" });

  db.prepare(
    `UPDATE projects SET 
      code=?, name=?, category=?, status=?, 
      theme_color=COALESCE(?, theme_color),
      department=COALESCE(?, department),
      order_number=COALESCE(?, order_number),
      storage_location=COALESCE(?, storage_location),
      meeting_time=COALESCE(?, meeting_time),
      current_phase=COALESCE(?, current_phase),
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
    current_phase !== undefined ? current_phase : project.current_phase,
    req.params.id
  );
  res.json({ ok: true, data: db.prepare("SELECT * FROM projects WHERE id = ? AND owner_id = ?").get(req.params.id, req.userId) });
});

// 删除项目（级联清除所有关联数据，仅当前用户）
router.delete("/projects/:id", (req, res) => {
  const { id } = req.params;
  const project = db.prepare("SELECT id FROM projects WHERE id = ? AND owner_id = ?").get(id, req.userId);
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

  const project = db.prepare("SELECT id FROM projects WHERE id = ? AND owner_id = ?").get(projectId, req.userId);
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
  const project = db.prepare("SELECT id FROM projects WHERE id = ? AND owner_id = ?").get(req.params.id, req.userId);
  if (!project) return res.status(404).json({ ok: false, error: "项目不存在" });
  res.json({
    ok: true,
    data: db.prepare("SELECT * FROM phases WHERE project_id = ? ORDER BY phase_order").all(req.params.id),
  });
});

// 更新阶段
router.put("/projects/:id/phases/:phaseId", (req, res) => {
  const { name, planned_start, planned_end, actual_start, actual_end, status } = req.body;
  const project = db.prepare("SELECT id FROM projects WHERE id = ? AND owner_id = ?").get(req.params.id, req.userId);
  if (!project) return res.status(404).json({ ok: false, error: "项目不存在" });
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
  const project = db.prepare("SELECT id FROM projects WHERE id = ? AND owner_id = ?").get(req.params.id, req.userId);
  if (!project) return res.status(404).json({ ok: false, error: "项目不存在" });
  db.prepare(
    "UPDATE gates SET is_passed=1, passed_at=datetime('now','localtime') WHERE id=? AND phase_id IN (SELECT id FROM phases WHERE project_id=?)"
  ).run(req.params.gateId, req.params.id);
  res.json({ ok: true });
});

export default router;
