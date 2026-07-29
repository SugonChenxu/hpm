/**
 * 快速笔记路由
 *
 * 端点：
 *   GET    /quick-notes          — 列表（id/title/pinned/updated_at/preview），置顶优先、更新时间倒序
 *   POST   /quick-notes          — 新建空白笔记（可选 title）
 *   GET    /quick-notes/:id      — 详情（含 content_html）
 *   PUT    /quick-notes/:id      — 更新（title / content_html / pinned）
 *   DELETE /quick-notes/:id      — 删除
 *
 * 全部按 owner_id 隔离；HTML 内容以 base64 内嵌图片形式存储于 SQLite。
 */

import { Router } from "express";
import db from "../db.js";

const router = Router();

/** 从 content_html 提取纯文本预览（去标签 + 折叠空白） */
function toPreview(html) {
  if (!html) return "";
  const text = String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, 120);
}

// ═══════════════════════════════════════════════
// GET /quick-notes
// ═══════════════════════════════════════════════
router.get("/quick-notes", (req, res) => {
  const rows = db
    .prepare(
      "SELECT id, title, content_html, pinned, created_at, updated_at FROM quick_notes WHERE owner_id = ? ORDER BY pinned DESC, updated_at DESC"
    )
    .all(req.userId);
  const data = rows.map((r) => ({
    id: r.id,
    title: r.title,
    pinned: !!r.pinned,
    created_at: r.created_at,
    updated_at: r.updated_at,
    preview: toPreview(r.content_html),
  }));
  res.json({ ok: true, data });
});

// ═══════════════════════════════════════════════
// POST /quick-notes
// ═══════════════════════════════════════════════
router.post("/quick-notes", (req, res) => {
  const title = (req.body.title || "无标题笔记").toString().slice(0, 200);
  const info = db
    .prepare("INSERT INTO quick_notes (owner_id, title) VALUES (?, ?)")
    .run(req.userId, title);
  const note = db.prepare("SELECT * FROM quick_notes WHERE id = ?").get(info.lastInsertRowid);
  res.json({ ok: true, data: note });
});

// ═══════════════════════════════════════════════
// GET /quick-notes/:id
// ═══════════════════════════════════════════════
router.get("/quick-notes/:id", (req, res) => {
  const note = db
    .prepare("SELECT * FROM quick_notes WHERE id = ? AND owner_id = ?")
    .get(req.params.id, req.userId);
  if (!note) return res.status(404).json({ ok: false, error: "笔记不存在" });
  res.json({ ok: true, data: note });
});

// ═══════════════════════════════════════════════
// PUT /quick-notes/:id
// ═══════════════════════════════════════════════
router.put("/quick-notes/:id", (req, res) => {
  const existing = db
    .prepare("SELECT id FROM quick_notes WHERE id = ? AND owner_id = ?")
    .get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ ok: false, error: "笔记不存在" });

  const { title, content_html, pinned } = req.body;
  const cur = db.prepare("SELECT title, content_html, pinned FROM quick_notes WHERE id = ?").get(req.params.id);

  const newTitle = title !== undefined ? String(title).slice(0, 200) : cur.title;
  const newContent = content_html !== undefined ? String(content_html) : cur.content_html;
  // 内容长度保护（base64 图片可能较大，上限对齐 body 上限留足余量）
  const safeContent = newContent.length > 20_000_000 ? newContent.slice(0, 20_000_000) : newContent;
  const newPinned = pinned !== undefined ? (pinned ? 1 : 0) : cur.pinned;

  db.prepare(
    "UPDATE quick_notes SET title = ?, content_html = ?, pinned = ?, updated_at = datetime('now','localtime') WHERE id = ? AND owner_id = ?"
  ).run(newTitle, safeContent, newPinned, req.params.id, req.userId);

  const note = db.prepare("SELECT * FROM quick_notes WHERE id = ? AND owner_id = ?").get(req.params.id, req.userId);
  res.json({ ok: true, data: note });
});

// ═══════════════════════════════════════════════
// DELETE /quick-notes/:id
// ═══════════════════════════════════════════════
router.delete("/quick-notes/:id", (req, res) => {
  const existing = db
    .prepare("SELECT id FROM quick_notes WHERE id = ? AND owner_id = ?")
    .get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ ok: false, error: "笔记不存在" });
  db.prepare("DELETE FROM quick_notes WHERE id = ? AND owner_id = ?").run(req.params.id, req.userId);
  res.json({ ok: true });
});

export default router;
