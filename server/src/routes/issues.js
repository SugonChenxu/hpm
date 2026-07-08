import { Router } from "express";
import db from "../db.js";
import MantisAdapter from "../adapters/mantis.js";
const router = Router();
const mantis = new MantisAdapter();

const DI_WEIGHTS = { Critical: 10, Major: 3, Minor: 1, Trivial: 0.1 };

// ── 缓存辅助函数 ──────────────────────────────────────────────

/**
 * 读取 sync_cache 中的缓存条目。
 * 若未命中或已过期（age > ttl_seconds），返回 null。
 */
function getCache(projectId, cacheKey) {
  const row = db.prepare(
    "SELECT cache_data, cached_at, ttl_seconds FROM sync_cache WHERE project_id=? AND cache_key=?"
  ).get(projectId, cacheKey);
  if (!row) return null;
  const age = (Date.now() - new Date(row.cached_at + "Z").getTime()) / 1000;
  if (age > row.ttl_seconds) return null;
  try { return JSON.parse(row.cache_data); } catch { return row.cache_data; }
}

/**
 * 写入/更新 sync_cache（TTL 固定 300 秒）。
 * 先删后插，保证幂等。
 */
function setCache(projectId, cacheKey, data) {
  db.prepare("DELETE FROM sync_cache WHERE project_id=? AND cache_key=?").run(projectId, cacheKey);
  db.prepare(
    "INSERT INTO sync_cache (project_id, cache_key, cache_data, ttl_seconds) VALUES (?,?,?,300)"
  ).run(projectId, cacheKey, JSON.stringify(data));
}

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

// ──────────────────────────────────────────────────────────
// M3 增量：聚合分析端点
// ──────────────────────────────────────────────────────────

// A. DI 趋势（折线图数据）— 从 Mantis 实时拉取
router.get("/issues/di-trend", async (req, res) => {
  const { project_id } = req.query;
  if (!project_id) return res.status(400).json({ ok: false, error: "project_id 必填" });

  const cached = getCache(project_id, "di_trend");
  if (cached !== null) return res.json({ ok: true, data: cached });

  try {
    const data = await mantis.fetchDITrend(project_id);
    setCache(project_id, "di_trend", data);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// B. 缺陷分类柱状图数据 — 从 Mantis 实时拉取
router.get("/issues/category-stats", async (req, res) => {
  const { project_id } = req.query;
  if (!project_id) return res.status(400).json({ ok: false, error: "project_id 必填" });

  const cached = getCache(project_id, "category_stats");
  if (cached !== null) return res.json({ ok: true, data: cached });

  try {
    const data = await mantis.fetchCategoryStats(project_id);
    setCache(project_id, "category_stats", data);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// C. 全局统计摘要 — 从 Mantis 实时拉取
router.get("/issues/summary", async (req, res) => {
  const { project_id } = req.query;
  if (!project_id) return res.status(400).json({ ok: false, error: "project_id 必填" });

  const cached = getCache(project_id, "summary");
  if (cached !== null) return res.json({ ok: true, data: cached });

  try {
    const data = await mantis.fetchSummary(project_id);
    setCache(project_id, "summary", data);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// D. 自动生成故障报告 — 从 Mantis 实时拉取
router.get("/issues/report", async (req, res) => {
  const { project_id } = req.query;
  if (!project_id) return res.status(400).json({ ok: false, error: "project_id 必填" });

  const cached = getCache(project_id, "report");
  if (cached !== null) return res.json({ ok: true, data: cached });

  try {
    const report = await mantis.fetchReport(project_id);
    setCache(project_id, "report", report);
    res.json({ ok: true, data: report });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
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

export default router;
