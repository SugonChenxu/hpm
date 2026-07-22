/**
 * Mantis 集成路由
 *
 * 端点：
 *   GET  /mantis/projects      — 获取 Mantis 项目列表（当前用户）
 *   POST /mantis/sync           — 同步指定项目的缺陷数据（当前用户）
 *   GET  /mantis/connection     — 读取 Mantis 连接配置（当前用户）
 *   PUT  /mantis/connection     — 更新 Mantis 连接配置（当前用户）
 *   POST /cache/invalidate      — 清除指定项目的缓存（当前用户）
 */

import { Router } from "express";
import db from "../db.js";
import { getAdapter, resolveMantisId, resolveForgeId, getWatchedProjects, getRecentProjects, mantisError } from "../mantis-resolve.js";

const router = Router();

const DI_WEIGHTS = { Critical: 10, Major: 3, Minor: 1, Trivial: 0.1 };

// ── 辅助：更新 mantis_connection 最后同步信息（按用户） ────────────────
function updateLastSync(status, ownerId) {
  const conn = db.prepare("SELECT id FROM mantis_connection WHERE owner_id = ? LIMIT 1").get(ownerId);
  if (conn) {
    db.prepare(
      "UPDATE mantis_connection SET last_sync_at=datetime('now','localtime'), last_sync_status=? WHERE id=? AND owner_id=?"
    ).run(status, conn.id, ownerId);
  }
}

// ═══════════════════════════════════════════════════════════
// GET /mantis/projects — 获取 Mantis 项目列表（当前用户）
// ═══════════════════════════════════════════════════════════
router.get("/mantis/projects", async (req, res) => {
  try {
    const adapter = getAdapter(req.userId);
    const data = await adapter.fetchProjects();
    res.json({ ok: true, data });
  } catch (error) {
    if (error.code === "auth_failed") {
      return res.json({ ok: true, data: [], needsConfig: true });
    }
    const { status, message } = mantisError(error, "获取项目列表失败");
    res.status(status).json({ ok: false, error: message });
  }
});

// ═══════════════════════════════════════════════════════════
// GET /mantis/watched-projects — 当前用户关注/最近使用的 Mantis 项目（兼容旧接口）
// ═══════════════════════════════════════════════════════════
router.get("/mantis/watched-projects", async (req, res) => {
  try {
    const watched = await getWatchedProjects(req.userId);
    res.json({ ok: true, data: watched });
  } catch (error) {
    const { status, message } = mantisError(error, "获取关注项目失败");
    res.status(status).json({ ok: false, error: message });
  }
});

// ═══════════════════════════════════════════════════════════
// GET /mantis/recent-projects — 当前用户「最近使用」的 Mantis 项目（真实接口）
//   数据直接来自 Mantis GET /projects?action=get_recent_projects，无需本地维护
// ═══════════════════════════════════════════════════════════
router.get("/mantis/recent-projects", async (req, res) => {
  try {
    const recent = await getRecentProjects(req.userId);
    res.json({ ok: true, data: recent });
  } catch (error) {
    if (error.code === "auth_failed") {
      return res.json({ ok: true, data: [], needsConfig: true });
    }
    const { status, message } = mantisError(error, "获取最近使用项目失败");
    res.status(status).json({ ok: false, error: message });
  }
});

// ═══════════════════════════════════════════════════════════
// POST /mantis/sync — 同步缺陷数据（当前用户）
// ═══════════════════════════════════════════════════════════
router.post("/mantis/sync", async (req, res) => {
  const { project_id } = req.body;
  if (!project_id) return res.status(400).json({ ok: false, error: "project_id 必填" });

  // 前端传入的是 Mantis hex 项目 id；解析为 Forge 数字 id（用于归属校验与落库）
  let adapter, mantisHexId, forgeId;
  try {
    adapter = getAdapter(req.userId);
    mantisHexId = project_id;
    forgeId = await resolveForgeId(req.userId, project_id);
  } catch (error) {
    const { status, message } = mantisError(error, "解析 Mantis 项目失败");
    return res.status(status).json({ ok: false, error: message });
  }

  // 校验 Forge 项目归属（仅当前用户可同步自己的项目）
  const proj = db.prepare("SELECT id FROM projects WHERE id = ? AND owner_id = ?").get(forgeId, req.userId);
  if (!proj) return res.status(403).json({ ok: false, error: "无权访问该项目" });

  try {
    const issues = await adapter.fetchIssues(mantisHexId);

    // 单个 issue 的 upsert（通过 mantis_id 查找已有记录）
    const find = db.prepare("SELECT id FROM issues WHERE mantis_id=? AND owner_id=?");
    const update = db.prepare(`
      UPDATE issues SET
        title=?, description=?, severity=?, status=?,
        assignee=?, di_weight=?, category=?, resolution=?,
        synced_at=datetime('now','localtime'),
        mantis_updated_at=?,
        updated_at=datetime('now','localtime')
      WHERE mantis_id=? AND owner_id=?
    `);
    const insert = db.prepare(`
      INSERT INTO issues
        (project_id, mantis_id, code, title, description, severity, status,
         assignee, di_weight, source, category, resolution,
         owner_id, synced_at, mantis_updated_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, 'mantis', ?, ?,
         ?, datetime('now','localtime'), ?)
    `);

    const syncCount = db.transaction(() => {
      let count = 0;
      for (const issue of issues) {
        const mantisId = issue.issue_id;
        const title = issue.summary || "";
        const description = issue.description || "";
        const severity = issue.severity || "Minor";       // Sugon 返回中文严重度，原样存储
        const status = issue.status || "新建";            // Sugon 返回中文状态，原样存储
        const assignee = issue.handler || "";             // 处理人
        const diWeight = Number(issue.di_value) || DI_WEIGHTS[severity] || 1; // 优先用 di_value
        const category = Array.isArray(issue.category)
          ? issue.category.join("/")
          : (issue.category || null);
        const resolution = issue.resolution || null;
        const mantisUpdatedAt = issue.update_ts || null;

        const existing = find.get(mantisId, req.userId);
        if (existing) {
          update.run(title, description, severity, status, assignee,
            diWeight, category, resolution, mantisUpdatedAt, mantisId, req.userId);
        } else {
          const code = `MNT-${mantisId}`;
          insert.run(forgeId, mantisId, code, title, description,
            severity, status, assignee, diWeight, category, resolution,
            req.userId, mantisUpdatedAt);
        }
        count++;
      }
      return count;
    })(issues);

    // 清除该项目的所有缓存（仅当前用户）
    db.prepare("DELETE FROM sync_cache WHERE project_id=? AND owner_id=?").run(forgeId, req.userId);

    // 更新最后同步状态
    updateLastSync("success", req.userId);

    res.json({ ok: true, data: { sync_count: syncCount } });
  } catch (error) {
    updateLastSync(error.code || "error", req.userId);
    const { status, message } = mantisError(error, "同步失败");
    res.status(status).json({ ok: false, error: message });
  }
});

// ═══════════════════════════════════════════════════════════
// GET /mantis/connection — 读取 Mantis 连接配置（当前用户）
// ═══════════════════════════════════════════════════════════
router.get("/mantis/connection", (req, res) => {
  const conn = db.prepare("SELECT * FROM mantis_connection WHERE owner_id = ? LIMIT 1").get(req.userId);
  res.json({ ok: true, data: conn || {} });
});

// ═══════════════════════════════════════════════════════════
// PUT /mantis/connection — 更新/创建 Mantis 连接配置（当前用户）
// ═══════════════════════════════════════════════════════════
router.put("/mantis/connection", (req, res) => {
  const { server_url, api_token, project_mapping, watched_projects, sync_interval_min } = req.body;
  const existing = db.prepare("SELECT id FROM mantis_connection WHERE owner_id = ? LIMIT 1").get(req.userId);

  if (existing) {
    db.prepare(`
      UPDATE mantis_connection SET
        server_url=COALESCE(?,server_url),
        api_token=COALESCE(?,api_token),
        project_mapping=COALESCE(?,project_mapping),
        watched_projects=COALESCE(?,watched_projects),
        sync_interval_min=COALESCE(?,sync_interval_min)
      WHERE id=? AND owner_id=?
    `).run(
      server_url,
      api_token,
      project_mapping ? JSON.stringify(project_mapping) : null,
      watched_projects ? JSON.stringify(watched_projects) : null,
      sync_interval_min,
      existing.id,
      req.userId
    );
  } else {
    db.prepare(`
      INSERT INTO mantis_connection (server_url, api_token, project_mapping, watched_projects, sync_interval_min, owner_id)
      VALUES (?,?,?,?,?,?)
    `).run(
      server_url || "https://mantis.sugon.com",
      api_token || "",
      project_mapping ? JSON.stringify(project_mapping) : "[]",
      watched_projects ? JSON.stringify(watched_projects) : "[]",
      sync_interval_min || 30,
      req.userId
    );
  }

  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
// POST /cache/invalidate — 清除指定项目缓存（当前用户）
// ═══════════════════════════════════════════════════════════
router.post("/cache/invalidate", (req, res) => {
  const { project_id } = req.body;
  if (!project_id) return res.status(400).json({ ok: false, error: "project_id 必填" });

  const result = db.prepare("DELETE FROM sync_cache WHERE project_id=? AND owner_id=?").run(project_id, req.userId);
  res.json({ ok: true, data: { invalidated: true, deleted_rows: result.changes } });
});

export default router;
