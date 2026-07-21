// 认证路由：登录 / 当前用户 / 登出。
// 注册（建账号）不在此暴露，由 scripts/create-user 直接写入 users 表，
// 符合「管理员手动逐个添加、不开放公开注册」的决策。

import { Router } from "express";
import bcrypt from "bcryptjs";
import db from "./db.js";

const router = Router();

// POST /api/auth/login  { username, password }
router.post("/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: "用户名和密码必填" });
  }
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!user) {
    return res.status(401).json({ ok: false, error: "用户名或密码错误" });
  }
  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ ok: false, error: "用户名或密码错误" });
  }
  req.session.userId = user.id;
  req.session.username = user.username;
  res.json({ ok: true, data: { id: user.id, username: user.username, role: user.role } });
});

// GET /api/auth/me  — 返回当前登录用户（含角色）
router.get("/me", (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ ok: false, error: "未登录", code: "UNAUTHENTICATED" });
  }
  const u = db.prepare("SELECT username, role FROM users WHERE id = ?").get(req.session.userId);
  if (!u) {
    return res.status(401).json({ ok: false, error: "用户不存在", code: "UNAUTHENTICATED" });
  }
  res.json({ ok: true, data: { id: req.session.userId, username: u.username, role: u.role } });
});

// POST /api/auth/logout
router.post("/logout", (req, res) => {
  if (req.session) {
    req.session.destroy(() => res.json({ ok: true }));
  } else {
    res.json({ ok: true });
  }
});

export default router;
