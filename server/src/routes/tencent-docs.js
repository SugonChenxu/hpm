import { Router } from "express";
import db from "../db.js";

// ============================================================
// 腾讯文档关联配置（项目计划 → 腾讯文档在线表格）
// 仅存"关联配置"，同步动作由 WorkBuddy 手动触发执行（读 Forge 排期 → 写腾讯文档）
// ============================================================
const router = Router();

// GET /api/tencent-docs/link?project_id=1 — 读取某项目的关联配置
router.get("/tencent-docs/link", (req, res) => {
  try {
    const projectId = Number(req.query.project_id);
    if (!projectId) return res.status(400).json({ ok: false, error: "缺少 project_id" });
    const proj = db.prepare("SELECT id, owner_id FROM projects WHERE id = ?").get(projectId);
    if (!proj) return res.status(404).json({ ok: false, error: "项目不存在" });
    if (proj.owner_id !== req.userId) return res.status(403).json({ ok: false, error: "无权访问该项目" });

    const link = db.prepare(
      "SELECT * FROM tencent_docs_link WHERE owner_id = ? AND project_id = ?"
    ).get(req.userId, projectId);
    res.json({ ok: true, data: link || null });
  } catch (err) {
    console.error("GET tencent-docs/link:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /api/tencent-docs/link — 保存/更新关联配置（file_url、可空 sheet_name）
router.put("/tencent-docs/link", (req, res) => {
  try {
    const { project_id, file_url, sheet_name } = req.body;
    if (!project_id || !file_url) {
      return res.status(400).json({ ok: false, error: "缺少 project_id 或 file_url" });
    }
    const proj = db.prepare("SELECT id, owner_id FROM projects WHERE id = ?").get(Number(project_id));
    if (!proj) return res.status(404).json({ ok: false, error: "项目不存在" });
    if (proj.owner_id !== req.userId) return res.status(403).json({ ok: false, error: "无权访问该项目" });

    const url = String(file_url).trim();
    // 从链接解析 file_id（docs.qq.com/sheet/XXXXXXXX 或 /open/... 或含 id=）
    let fileId = "";
    const m = url.match(/docs\.qq\.com\/(?:sheet|doc|open)\/([A-Za-z0-9]+)/);
    if (m) fileId = m[1];
    const idm = url.match(/[?&]id=([A-Za-z0-9]+)/);
    if (!fileId && idm) fileId = idm[1];

    const existing = db.prepare(
      "SELECT id FROM tencent_docs_link WHERE owner_id = ? AND project_id = ?"
    ).get(req.userId, Number(project_id));
    if (existing) {
      db.prepare(
        "UPDATE tencent_docs_link SET file_url = ?, file_id = ?, sheet_name = ?, updated_at = datetime('now','localtime') WHERE id = ?"
      ).run(url, fileId, (sheet_name || "").trim(), existing.id);
    } else {
      db.prepare(
        "INSERT INTO tencent_docs_link (owner_id, project_id, file_url, file_id, sheet_name) VALUES (?,?,?,?,?)"
      ).run(req.userId, Number(project_id), url, fileId, (sheet_name || "").trim());
    }

    const link = db.prepare(
      "SELECT * FROM tencent_docs_link WHERE owner_id = ? AND project_id = ?"
    ).get(req.userId, Number(project_id));
    res.json({ ok: true, data: link });
  } catch (err) {
    console.error("PUT tencent-docs/link:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /api/tencent-docs/link?project_id=1 — 解除关联
router.delete("/tencent-docs/link", (req, res) => {
  try {
    const projectId = Number(req.query.project_id);
    if (!projectId) return res.status(400).json({ ok: false, error: "缺少 project_id" });
    db.prepare(
      "DELETE FROM tencent_docs_link WHERE owner_id = ? AND project_id = ?"
    ).run(req.userId, projectId);
    res.json({ ok: true, data: null });
  } catch (err) {
    console.error("DELETE tencent-docs/link:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
