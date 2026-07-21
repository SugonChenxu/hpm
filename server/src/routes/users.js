// 用户管理路由（owner / admin / member 三级权限模型）
// 全部挂载在 /api 下，受 index.js 的 requireAuth 保护（需登录会话）。
//
// 权限矩阵：
//   owner  ：最高权限，不可被删 / 不可被降级 / 密码不可被重置；可管理全部用户、设定 admin/member 角色。
//   admin  ：可查看列表、新增成员、重置/删除「成员」；不能碰 owner，不能碰其他 admin（含其密码）。
//   member ：只能修改自己的密码（/me/password），无用户管理权限。
//
// ② bootstrap：首个/指定账号(chenxu) 在 db.js 迁移时设为 owner；新增用户默认 member。

import { Router } from "express";
import bcrypt from "bcryptjs";
import db from "../db.js";

const router = Router();

const ROLE_OWNER = "owner";
const ROLE_ADMIN = "admin";
const ROLE_MEMBER = "member";

// ── 权限中间件：admin 及以上（owner / admin） ──
function requireAdmin(req, res, next) {
  const u = db.prepare("SELECT role FROM users WHERE id = ?").get(req.userId);
  if (!u || (u.role !== ROLE_OWNER && u.role !== ROLE_ADMIN)) {
    return res.status(403).json({ ok: false, error: "无权限：仅管理员可操作" });
  }
  next();
}

// ── 权限中间件：仅 owner ──
function requireOwner(req, res, next) {
  const u = db.prepare("SELECT role FROM users WHERE id = ?").get(req.userId);
  if (!u || u.role !== ROLE_OWNER) {
    return res.status(403).json({ ok: false, error: "无权限：仅所有者可操作" });
  }
  next();
}

// POST /api/users/me/password — 当前登录用户修改自己的密码（所有登录用户可用）
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

// ===== 以下管理接口需 admin 及以上 =====
router.use(requireAdmin);

// GET /api/users — 列出全部用户（含角色，不含密码哈希）
router.get("/", (req, res) => {
  const users = db
    .prepare("SELECT id, username, role, created_at FROM users ORDER BY id")
    .all();
  res.json({ ok: true, data: users });
});

// POST /api/users — 新增用户（手动添加同事账号）
// 默认 role = member；仅 owner 可指定为 admin；禁止任何人指定 owner。
router.post("/", (req, res) => {
  const operator = db.prepare("SELECT role FROM users WHERE id = ?").get(req.userId);
  const { username, password, role } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: "用户名和密码必填" });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ ok: false, error: "密码至少 6 位" });
  }
  if (db.prepare("SELECT id FROM users WHERE username = ?").get(username)) {
    return res.status(409).json({ ok: false, error: "用户名已存在" });
  }
  // 确定新用户角色
  let newRole = ROLE_MEMBER;
  if (role === ROLE_ADMIN && operator.role === ROLE_OWNER) {
    newRole = ROLE_ADMIN; // 仅 owner 可创建管理员
  }
  // 防御性：库为空时（理论上 chenxu 已存在，不会触发）第一个用户自动为 owner
  const cnt = db.prepare("SELECT COUNT(*) AS cnt FROM users").get().cnt;
  if (cnt === 0) newRole = ROLE_OWNER;

  const hash = bcrypt.hashSync(password, 10);
  const r = db
    .prepare("INSERT INTO users(username, password_hash, role) VALUES(?, ?, ?)")
    .run(username, hash, newRole);
  res.json({ ok: true, data: { id: r.lastInsertRowid, username, role: newRole } });
});

// PUT /api/users/:id/password — 重置指定用户密码（管理员）
router.put("/:id/password", (req, res) => {
  const id = Number(req.params.id);
  const operator = db.prepare("SELECT role FROM users WHERE id = ?").get(req.userId);
  const target = db.prepare("SELECT id, role FROM users WHERE id = ?").get(id);
  if (!target) return res.status(404).json({ ok: false, error: "用户不存在" });
  const { password } = req.body || {};
  if (!password || String(password).length < 6) {
    return res.status(400).json({ ok: false, error: "密码至少 6 位" });
  }
  // 不能重置 owner 密码（防任何人动老板）
  if (target.role === ROLE_OWNER) {
    return res.status(403).json({ ok: false, error: "不能重置所有者的密码" });
  }
  // admin 不能重置其他 admin 的密码（只有 owner 能）
  if (operator.role === ROLE_ADMIN && target.role === ROLE_ADMIN) {
    return res.status(403).json({ ok: false, error: "管理员不能重置其他管理员的密码" });
  }
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
    bcrypt.hashSync(password, 10),
    id
  );
  res.json({ ok: true });
});

// PUT /api/users/:id/role — 修改指定用户角色（仅 owner）
// 仅可在 admin / member 间切换；不能改 owner 角色；不能设为 owner（防越权升权）。
router.put("/:id/role", requireOwner, (req, res) => {
  const id = Number(req.params.id);
  const target = db.prepare("SELECT id, role FROM users WHERE id = ?").get(id);
  if (!target) return res.status(404).json({ ok: false, error: "用户不存在" });
  const { role } = req.body || {};
  if (role !== ROLE_ADMIN && role !== ROLE_MEMBER) {
    return res.status(400).json({ ok: false, error: "角色只能设为管理员或成员" });
  }
  // 不能修改 owner 角色（owner 永远不可降级/移除）
  if (target.role === ROLE_OWNER) {
    return res.status(403).json({ ok: false, error: "不能修改所有者的角色" });
  }
  db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, id);
  res.json({ ok: true });
});

// DELETE /api/users/:id — 删除用户
router.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (req.userId === id) {
    return res.status(400).json({ ok: false, error: "不能删除当前登录账号" });
  }
  const operator = db.prepare("SELECT role FROM users WHERE id = ?").get(req.userId);
  const target = db.prepare("SELECT id, role FROM users WHERE id = ?").get(id);
  if (!target) return res.status(404).json({ ok: false, error: "用户不存在" });
  // 不能删除 owner（防系统失守）
  if (target.role === ROLE_OWNER) {
    return res.status(403).json({ ok: false, error: "不能删除所有者账号" });
  }
  // admin 不能删除其他 admin（只有 owner 能）
  if (operator.role === ROLE_ADMIN && target.role === ROLE_ADMIN) {
    return res.status(403).json({ ok: false, error: "管理员不能删除其他管理员" });
  }
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
  res.json({ ok: true });
});

export default router;
