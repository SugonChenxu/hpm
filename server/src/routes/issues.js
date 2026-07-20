import { Router } from "express";
import db from "../db.js";
import { getAdapter, resolveForgeId, mantisError } from "../mantis-resolve.js";
const router = Router();

const DI_WEIGHTS = { Critical: 10, Major: 3, Minor: 1, Trivial: 0.1 };

// ── 缓存辅助函数 ──────────────────────────────────────────────

/**
 * 读取 sync_cache 中的缓存条目。
 * 若未命中或已过期（age > ttl_seconds），返回 null。
 */
function getCache(ownerId, projectId, cacheKey) {
  const row = db.prepare(
    "SELECT cache_data, cached_at, ttl_seconds FROM sync_cache WHERE project_id=? AND cache_key=? AND owner_id=?"
  ).get(projectId, cacheKey, ownerId);
  if (!row) return null;
  const age = (Date.now() - new Date(row.cached_at + "Z").getTime()) / 1000;
  if (age > row.ttl_seconds) return null;
  try { return JSON.parse(row.cache_data); } catch { return row.cache_data; }
}

/**
 * 写入/更新 sync_cache（TTL 固定 300 秒）。
 * 先删后插，保证幂等。按 owner_id 隔离。
 */
function setCache(ownerId, projectId, cacheKey, data) {
  db.prepare("DELETE FROM sync_cache WHERE project_id=? AND cache_key=? AND owner_id=?").run(projectId, cacheKey, ownerId);
  db.prepare(
    "INSERT INTO sync_cache (project_id, cache_key, cache_data, ttl_seconds, owner_id) VALUES (?,?,?,300,?)"
  ).run(projectId, cacheKey, JSON.stringify(data), ownerId);
}

router.get("/issues", (req, res) => {
  const { project_id, phase_id, severity, status, source, search } = req.query;
  let sql = "SELECT * FROM issues WHERE 1=1";
  const params = [];
  sql += " AND owner_id = ?";
  params.push(req.userId);
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
  const proj = db.prepare("SELECT owner_id FROM projects WHERE id = ?").get(Number(project_id));
  if (!proj || proj.owner_id !== req.userId) return res.status(403).json({ ok: false, error: "无权访问该项目" });
  const di_weight = DI_WEIGHTS[severity] || 1;
  const count = db.prepare("SELECT COUNT(*) as cnt FROM issues WHERE source='local'").get().cnt;
  const code = `HPM-${String(count + 1).padStart(4, "0")}`;
  const result = db.prepare("INSERT INTO issues (project_id, phase_id, code, title, description, severity, assignee, di_weight, source, owner_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'local', ?)").run(project_id, phase_id || null, code, title, description || "", severity || "Minor", assignee || "", di_weight, req.userId);
  res.status(201).json({ ok: true, data: db.prepare("SELECT * FROM issues WHERE id = ?").get(result.lastInsertRowid) });
});

router.get("/issues/di-summary", (req, res) => {
  const { project_id } = req.query;
  if (!project_id) return res.status(400).json({ ok: false, error: "project_id 必填" });
  const proj = db.prepare("SELECT owner_id FROM projects WHERE id = ?").get(Number(project_id));
  if (!proj || proj.owner_id !== req.userId) return res.status(403).json({ ok: false, error: "无权访问该项目" });
  const byPhase = db.prepare("SELECT phase_id, SUM(di_weight) as current_di, COUNT(*) as count FROM issues WHERE project_id=? AND status NOT IN ('已关闭') GROUP BY phase_id").all(project_id);
  const total = db.prepare("SELECT SUM(di_weight) as total_di, COUNT(*) as total_count FROM issues WHERE project_id=? AND status NOT IN ('已关闭')").get(project_id);
  res.json({ ok: true, data: { byPhase, total } });
});

// ──────────────────────────────────────────────────────────
// M3 增量：聚合分析端点
// ──────────────────────────────────────────────────────────

// A. DI 趋势（折线图数据）— 从 Mantis 实时拉取
router.get("/issues/di-trend", async (req, res) => {
  const { project_id } = req.query;
  if (!project_id) return res.status(400).json({ ok: false, error: "project_id 必填" });

  // 前端传入 Mantis hex id，先解析为 Forge 数字 id 用于归属校验与缓存
  let forgeId, mantisId;
  try {
    forgeId = await resolveForgeId(req.userId, project_id);
    mantisId = project_id;
  } catch (e) {
    const { status, message } = mantisError(e, "解析项目失败");
    return res.status(status).json({ ok: false, error: message });
  }
  const proj = db.prepare("SELECT owner_id FROM projects WHERE id = ?").get(Number(forgeId));
  if (!proj || proj.owner_id !== req.userId) return res.status(403).json({ ok: false, error: "无权访问该项目" });

  const cached = getCache(req.userId, forgeId,"di_trend");
  if (cached !== null) return res.json({ ok: true, data: cached });

  try {
    const adapter = getAdapter(req.userId);
    const data = await adapter.fetchDITrend(mantisId);
    setCache(req.userId, forgeId,"di_trend", data);
    res.json({ ok: true, data });
  } catch (e) {
    const { status, message } = mantisError(e, "获取 DI 趋势失败");
    res.status(status).json({ ok: false, error: message });
  }
});

// B. 缺陷分类柱状图数据 — 从 Mantis 实时拉取
router.get("/issues/category-stats", async (req, res) => {
  const { project_id, type } = req.query;
  if (!project_id) return res.status(400).json({ ok: false, error: "project_id 必填" });

  let forgeId, mantisId;
  try {
    forgeId = await resolveForgeId(req.userId, project_id);
    mantisId = project_id;
  } catch (e) {
    const { status, message } = mantisError(e, "解析项目失败");
    return res.status(status).json({ ok: false, error: message });
  }
  const proj = db.prepare("SELECT owner_id FROM projects WHERE id = ?").get(Number(forgeId));
  if (!proj || proj.owner_id !== req.userId) return res.status(403).json({ ok: false, error: "无权访问该项目" });

  const cacheKey = type === "di" ? "category_di_stats" : "category_stats";
  const cached = getCache(req.userId, forgeId,cacheKey);
  if (cached !== null) return res.json({ ok: true, data: cached });

  try {
    const adapter = getAdapter(req.userId);
    const data = type === "di"
      ? await adapter.fetchCategoryDIStats(mantisId)
      : await adapter.fetchCategoryStats(mantisId);
    setCache(req.userId, forgeId,cacheKey, data);
    res.json({ ok: true, data });
  } catch (e) {
    const { status, message } = mantisError(e, "获取分类统计失败");
    res.status(status).json({ ok: false, error: message });
  }
});

// C. 全局统计摘要 — 从 Mantis 实时拉取
router.get("/issues/summary", async (req, res) => {
  const { project_id } = req.query;
  if (!project_id) return res.status(400).json({ ok: false, error: "project_id 必填" });

  let forgeId, mantisId;
  try {
    forgeId = await resolveForgeId(req.userId, project_id);
    mantisId = project_id;
  } catch (e) {
    const { status, message } = mantisError(e, "解析项目失败");
    return res.status(status).json({ ok: false, error: message });
  }
  const proj = db.prepare("SELECT owner_id FROM projects WHERE id = ?").get(Number(forgeId));
  if (!proj || proj.owner_id !== req.userId) return res.status(403).json({ ok: false, error: "无权访问该项目" });

  const cached = getCache(req.userId, forgeId,"summary");
  if (cached !== null) return res.json({ ok: true, data: cached });

  try {
    const adapter = getAdapter(req.userId);
    const data = await adapter.fetchSummary(mantisId);
    setCache(req.userId, forgeId,"summary", data);
    res.json({ ok: true, data });
  } catch (e) {
    const { status, message } = mantisError(e, "获取全局统计失败");
    res.status(status).json({ ok: false, error: message });
  }
});

// D. 自动生成故障报告 — 从 Mantis 实时拉取
router.get("/issues/report", async (req, res) => {
  const { project_id } = req.query;
  if (!project_id) return res.status(400).json({ ok: false, error: "project_id 必填" });

  let forgeId, mantisId;
  try {
    forgeId = await resolveForgeId(req.userId, project_id);
    mantisId = project_id;
  } catch (e) {
    const { status, message } = mantisError(e, "解析项目失败");
    return res.status(status).json({ ok: false, error: message });
  }
  const proj = db.prepare("SELECT owner_id FROM projects WHERE id = ?").get(Number(forgeId));
  if (!proj || proj.owner_id !== req.userId) return res.status(403).json({ ok: false, error: "无权访问该项目" });

  const cached = getCache(req.userId, forgeId,"report");
  if (cached !== null) return res.json({ ok: true, data: cached });

  try {
    const adapter = getAdapter(req.userId);
    const report = await adapter.fetchReport(mantisId);
    setCache(req.userId, forgeId,"report", report);
    res.json({ ok: true, data: report });
  } catch (e) {
    const { status, message } = mantisError(e, "生成故障报告失败");
    res.status(status).json({ ok: false, error: message });
  }
});

router.get("/issues/:id", (req, res) => {
  const issue = db.prepare("SELECT * FROM issues WHERE id = ? AND owner_id = ?").get(req.params.id, req.userId);
  if (!issue) return res.status(404).json({ ok: false, error: "缺陷不存在" });
  res.json({ ok: true, data: issue });
});

router.put("/issues/:id", (req, res) => {
  const { title, description, severity, status, assignee } = req.body;
  const issue = db.prepare("SELECT * FROM issues WHERE id = ? AND owner_id = ?").get(req.params.id, req.userId);
  if (!issue) return res.status(404).json({ ok: false, error: "缺陷不存在" });
  const newSeverity = severity || issue.severity;
  const di_weight = DI_WEIGHTS[newSeverity] || issue.di_weight;
  db.prepare("UPDATE issues SET title=COALESCE(?,title), description=COALESCE(?,description), severity=COALESCE(?,severity), status=COALESCE(?,status), assignee=COALESCE(?,assignee), di_weight=?, updated_at=datetime('now','localtime') WHERE id=? AND owner_id = ?").run(title, description, severity, status, assignee, di_weight, req.params.id, req.userId);
  res.json({ ok: true, data: db.prepare("SELECT * FROM issues WHERE id = ?").get(req.params.id) });
});

export default router;
