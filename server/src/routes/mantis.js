/**
 * Mantis 集成路由
 *
 * 端点：
 *   GET  /mantis/projects      — 获取 Mantis 项目列表
 *   POST /mantis/sync           — 同步指定项目的缺陷数据
 *   GET  /mantis/connection     — 读取 Mantis 连接配置
 *   PUT  /mantis/connection     — 更新 Mantis 连接配置
 *   POST /cache/invalidate      — 清除指定项目的缓存
 */

import { Router } from "express";
import MantisAdapter from "../adapters/mantis.js";
import db from "../db.js";

const router = Router();
const adapter = new MantisAdapter();

const DI_WEIGHTS = { Critical: 10, Major: 3, Minor: 1, Trivial: 0.1 };

// ── 错误码 → HTTP 状态码 + 中文消息 ──────────────────────────
function mapMantisError(error, fallbackMsg) {
  switch (error.code) {
    case "auth_failed":
      return { status: 401, message: "Mantis 鉴权失败，请检查 API Token 是否正确" };
    case "timeout":
      return { status: 504, message: "Mantis 服务器连接超时，请稍后重试" };
    case "network":
      return { status: 502, message: "无法连接到 Mantis 服务器，请检查网络和服务地址" };
    default:
      return { status: 500, message: fallbackMsg || error.message };
  }
}

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
// GET /mantis/projects — 获取 Mantis 项目列表
// ═══════════════════════════════════════════════════════════
router.get("/mantis/projects", async (req, res) => {
  try {
    const result = await adapter.fetchProjects();
    // 返回分组：最近使用 + 其他项目
    res.json({ ok: true, data: result.recent || result.all || result });
  } catch (error) {
    const { status, message } = mapMantisError(error, "获取项目列表失败");
    res.status(status).json({ ok: false, error: message });
  }
});

// ═══════════════════════════════════════════════════════════
// POST /mantis/sync — 同步缺陷数据
// ═══════════════════════════════════════════════════════════
router.post("/mantis/sync", async (req, res) => {
  const { project_id } = req.body;
  if (!project_id) return res.status(400).json({ ok: false, error: "project_id 必填" });

  // 校验项目归属（仅当前用户可同步自己的项目）
  const proj = db.prepare("SELECT id FROM projects WHERE id = ? AND owner_id = ?").get(project_id, req.userId);
  if (!proj) return res.status(403).json({ ok: false, error: "无权访问该项目" });

  try {
    const issues = await adapter.fetchIssues(project_id);

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
        const mantisId = issue.id;
        const title = issue.summary || issue.title || "";
        const description = issue.description || "";
        const severity = issue.severity || "Minor";
        const status = issue.status || "新建";
        const assignee = issue.assignee || issue.handler || "";
        const di_weight = DI_WEIGHTS[severity] || 1;
        const category = issue.category || null;
        const resolution = issue.resolution || null;
        const mantisUpdatedAt = issue.updated_at || null;

        const existing = find.get(mantisId, req.userId);
        if (existing) {
          update.run(title, description, severity, status, assignee,
            di_weight, category, resolution, mantisUpdatedAt, mantisId, req.userId);
        } else {
          const code = `MNT-${mantisId}`;
          insert.run(project_id, mantisId, code, title, description,
            severity, status, assignee, di_weight, category, resolution,
            req.userId, mantisUpdatedAt);
        }
        count++;
      }
      return count;
    })(issues);

    // 清除该项目的所有缓存（仅当前用户）
    db.prepare("DELETE FROM sync_cache WHERE project_id=? AND owner_id=?").run(project_id, req.userId);

    // 更新最后同步状态
    updateLastSync("success", req.userId);

    res.json({ ok: true, data: { sync_count: syncCount } });
  } catch (error) {
    updateLastSync(error.code || "error", req.userId);

    const { status, message } = mapMantisError(error, "同步失败");
    res.status(status).json({ ok: false, error: message });
  }
});

// ═══════════════════════════════════════════════════════════
// GET /mantis/connection — 读取 Mantis 连接配置
// ═══════════════════════════════════════════════════════════
router.get("/mantis/connection", (req, res) => {
  const conn = db.prepare("SELECT * FROM mantis_connection WHERE owner_id = ? LIMIT 1").get(req.userId);
  res.json({ ok: true, data: conn || {} });
});

// ═══════════════════════════════════════════════════════════
// PUT /mantis/connection — 更新/创建 Mantis 连接配置
// ═══════════════════════════════════════════════════════════
router.put("/mantis/connection", (req, res) => {
  const { server_url, api_token, project_mapping, sync_interval_min } = req.body;
  const existing = db.prepare("SELECT id FROM mantis_connection WHERE owner_id = ? LIMIT 1").get(req.userId);

  if (existing) {
    db.prepare(`
      UPDATE mantis_connection SET
        server_url=COALESCE(?,server_url),
        api_token=COALESCE(?,api_token),
        project_mapping=COALESCE(?,project_mapping),
        sync_interval_min=COALESCE(?,sync_interval_min)
      WHERE id=? AND owner_id=?
    `).run(
      server_url,
      api_token,
      project_mapping ? JSON.stringify(project_mapping) : null,
      sync_interval_min,
      existing.id,
      req.userId
    );
  } else {
    db.prepare(`
      INSERT INTO mantis_connection (server_url, api_token, project_mapping, sync_interval_min, owner_id)
      VALUES (?,?,?,?,?)
    `).run(
      server_url || "",
      api_token || "",
      project_mapping ? JSON.stringify(project_mapping) : "[]",
      sync_interval_min || 30,
      req.userId
    );
  }

  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
// POST /cache/invalidate — 清除指定项目缓存
// ═══════════════════════════════════════════════════════════
router.post("/cache/invalidate", (req, res) => {
  const { project_id } = req.body;
  if (!project_id) return res.status(400).json({ ok: false, error: "project_id 必填" });

  const result = db.prepare("DELETE FROM sync_cache WHERE project_id=?").run(project_id);
  res.json({ ok: true, data: { invalidated: true, deleted_rows: result.changes } });
});

export default router;
