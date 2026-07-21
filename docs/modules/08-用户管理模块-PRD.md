# 用户管理模块 PRD（系统设置）

> 模块编号：M8（系统设置 / 横切功能，独立于 M1–M7 业务模块）
> 创建日期：2026-07-21
> 状态：✅ 已实装并部署（含 owner/admin/member 三级权限模型）

## 1. 模块定位
面向内网多用户集中部署场景的系统级管理功能。将「加用户 / 改密码」从命令行直连数据库操作，迁移为网页界面操作，降低运维门槛、避免手动跑库出错；并通过三级角色模型实现最小权限原则。

## 2. 用户与权限模型（owner / admin / member 三级）
- 多用户、各自独立管理；业务数据按 `owner_id` 隔离（见顶层 PRD 与 MEMORY）。
- 三级角色：
  - **owner（所有者）**：最高权限，不可被删、不可被降级、密码不可被重置；可管理全部用户、设定 admin/member 角色。系统初始化时指定主账号 `chenxu` 为 owner（② bootstrap）。
  - **admin（管理员）**：可查看列表、新增成员、重置/删除「成员」；**不能**碰 owner、不能碰其他 admin（含其密码、角色）。由 owner 指定。
  - **member（成员）**：只能修改自己的密码，无用户管理权限。
- 认证：服务器会话（`express-session` + 文件存储），有效期 30 天，满足「登录尽量长」。
- 账号开通：owner/admin 手动逐个添加，不开放公开注册；新增默认 `member`，仅 owner 可指定为 `admin`。

## 3. 功能清单
| 功能 | 说明 | 入口 |
|---|---|---|
| 用户列表 | 查看全部账号（用户名、角色、创建时间） | 用户管理页 `/users` |
| 新增账号 | 手动添加同事账号（用户名 + 初始密码；owner 可勾选「设为管理员」） | 用户管理页「＋ 新增用户」 |
| 修改自己的密码 | 输入原密码 + 新密码（自助） | 用户管理页「🔑 修改我的密码」/ 顶栏「修改密码」 |
| 重置他人密码 | 管理员直接重设某用户密码（无需原密码） | 列表行「重置密码」（按角色置灰） |
| 分配角色 | owner 将某用户设为管理员或成员（不能改 owner 角色、不可设为 owner） | 列表行「修改角色」（仅 owner 可见） |
| 删除账号 | 删除指定用户；**禁止删除当前登录账号 / 所有者 / 其他管理员（admin 视角）** | 列表行「删除」（按角色置灰） |

## 4. 接口规范
| 方法 | 路径 | 说明 | 保护 |
|---|---|---|---|
| GET | /api/users | 用户列表（含 `role`） | owner / admin |
| POST | /api/users | 新增用户 `{username, password, role?}` | owner / admin（仅 owner 可指定 `role=admin`） |
| POST | /api/users/me/password | 改自己密码 `{oldPassword, newPassword}` | 登录用户（校验原密码） |
| PUT | /api/users/:id/password | 重置他人密码 `{password}` | owner / admin（禁重置 owner；admin 不可重置 admin） |
| PUT | /api/users/:id/role | 修改角色 `{role}` | **仅 owner**（禁改 owner 角色、禁设为 owner） |
| DELETE | /api/users/:id | 删除用户（禁删自己/owner；admin 不可删 admin） | owner / admin |

## 5. 业务规则
- 角色枚举：`owner` / `admin` / `member`，存于 `users.role` 列（`TEXT NOT NULL DEFAULT 'member'`）。
- 密码强度：≥ 6 位。
- 用户名唯一（`UNIQUE` 约束，重复返回 409）。
- owner 保护：不可被删除、不可被降级、密码不可被重置（后端全部以 403/400 拦截）。
- admin 受限：不可删除/重置其他 admin，不可修改任何角色，不可删除/触碰 owner。
- 不能删除当前登录账号（避免锁死），后端显式 400。
- 删除用户为物理删除；其历史业务数据仍按原 `owner_id` 保留，变为「无主」状态，**不做级联清理**（后续可升级为「停用」软删 + `is_active` 字段）。

## 6. 前端实现
- 路由：`/users` → `UserManagementPage`
- 侧边栏：「系统设置」分组 → 用户管理；**仅 owner/admin 可见**（member 不显示该菜单）
- 顶栏：登录用户区「🔑 修改密码」按钮（所有登录用户可见），复用共享组件 `ChangePasswordDialog`
- 入口守卫：非 owner/admin 直接访问 `/users` 时显示「无权限」提示
- 列表含「角色」列（`Chip` 展示 👑所有者 / 管理员 / 成员）
- 操作按钮按角色禁用：重置/删除对 owner、对其他 admin（admin 视角）置灰并提示原因；「修改角色」仅 owner 对非 owner 用户显示
- 新增用户对话框：仅 owner 可见「设为管理员」勾选框
- 新增 / 重置 / 删除 / 改角色均带二次确认与 Snackbar 反馈
- 图标均用内联 `SvgIcon`，规避 `@mui/icons-material` 的 Vite 8 兼容问题

## 7. 验收记录
- [x] 网页新增用户并可用新账号登录
- [x] 修改自己密码后可用新密码重新登录
- [x] 重置他人密码生效
- [x] 删除他人成功、删除自己被拒（HTTP 400）
- [x] 三级权限矩阵端到端验证 25/25 通过（owner/admin/member 各场景 + 越权被拒）（2026-07-21）
- [x] 前端 `vite build` 通过、PM2 `forge` 重启部署；`chenxu` 已迁移为 owner

## 8. 后续可增强
- 账号「停用」软删（替代物理删除，规避无主数据）
- 密码强度策略强化（复杂度/过期）
- 邀请制 / 注册审批（若未来开放自助加入）
