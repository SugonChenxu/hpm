// 用户管理路由：列出 / 新增 / 重置密码 / 删除 / 修改自己的密码。
// 全部挂载在 /api 下，受 index.js 的 requireAuth 保护（需登录会话）。
// 内网小团队、人人平等：任何登录用户均可管理其他用户；不能删除自己。

import { Router } from "express";
import bcrypt from "bcryptjs";
import db from "../db.js";

const router = Router();

// GET /api/users — 列出全部用户（不含密码哈希）
router.get("/", (req, res) => {
  const users = db
    .prepare("SELECT id, username, created_at FROM users ORDER BY id")
    .all();
  res.json({ ok: true, data: users });
});

// POST /api/users — 新增用户（手动添加同事账号）
router.post("/", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: "用户名和密码必填" });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ ok: false, error: "密码至少 6 位" });
  }
  if (db.prepare("SELECT id FROM users WHERE username = ?").get(username)) {
    return res.status(409).json({ ok: false, error: "用户名已存在" });
  }
  const hash = bcrypt.hashSync(password, 10);
  const r = db
    .prepare("INSERT INTO users(username, password_hash) VALUES(?, ?)")
    .run(username, hash);
  res.json({ ok: true, data: { id: r.lastInsertRowid, username } });
});

// POST /api/users/me/password — 当前登录用户修改自己的密码
router.post("/me/password", (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ ok: false, error: "新旧密码必填" });
  }
  if (String(newPassword).length < 6) {
    return res.status(400).json({ ok: false, error: "新密码至少 6 位" });
  }
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.userId);
  if (!user) return res.status(404).json({ ok: false, error: "用户不存在" });
  if (!bcrypt.compareSync(oldPassword, user.password_hash)) {
    return res.status(400).json({ ok: false, error: "原密码错误" });
  }
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
    bcrypt.hashSync(newPassword, 10),
    user.id
  );
  res.json({ ok: true });
});

// PUT /api/users/:id/password — 重置指定用户密码（管理员）
router.put("/:id/password", (req, res) => {
  const id = Number(req.params.id);
  const { password } = req.body || {};
  if (!password || String(password).length < 6) {
    return res.status(400).json({ ok: false, error: "密码至少 6 位" });
  }
  if (!db.prepare("SELECT id FROM users WHERE id = ?").get(id)) {
    return res.status(404).json({ ok: false, error: "用户不存在" });
  }
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
    bcrypt.hashSync(password, 10),
    id
  );
  res.json({ ok: true });
});

// DELETE /api/users/:id — 删除用户（禁止删除当前登录账号）
router.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (req.userId === id) {
    return res.status(400).json({ ok: false, error: "不能删除当前登录账号" });
  }
  if (!db.prepare("SELECT id FROM users WHERE id = ?").get(id)) {
    return res.status(404).json({ ok: false, error: "用户不存在" });
  }
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
  res.json({ ok: true });
});

export default router;
