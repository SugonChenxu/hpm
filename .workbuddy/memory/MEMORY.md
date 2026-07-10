# HPM 项目 — 常驻记忆

## 项目概览
- **项目代号**: HPM (Hardware Project Management)
- **目标**: 构建一个面向硬件产品研发全生命周期的 Web 项目管理工具
- **用户**: 个人使用（X, 天津, 硬件项目管理）
- **领域知识库**: `D:\HPM\.workbuddy\memory\hardware-pm-knowledge-base.md`

## 工程约束（来自用户明确要求, 必须遵守）

1. **GitHub 同步强制**: 任意代码迭代完成后，立即 git push 到远程仓库，保持本地与远端版本一致。
2. **版本变更日志**: 每次代码更新提交时，自动生成标准化 CHANGELOG，记录修改模块/新增功能/缺陷修复/接口调整/参数变动。
3. **顶层 PRD + 模块 PRD**: 编制项目顶层整体 PRD 文档作为需求总基线；单个功能模块研发验收完成后同步迭代更新对应模块细分 PRD。
4. **研发时序**: 优先搭建项目全局基础架构，落地完毕后按分模块串行开展各业务单元开发。
5. **前后端分离**: 前端页面与后端服务并行同步迭代开发，业务数据可完整持久化、正常读写与查询。
6. **软件工程规范**: 全流程严格遵循标准软件工程开发规范，同步识别/记录/跟进各阶段研发节点。
7. **Memory 决策基准**: 所有设计/实现决策应以本 memory 和知识库为基准，决策时无需重读原始 PPTX/JPG。

## 技术栈（默认）
- **前端**: Vite + React + MUI + Tailwind CSS
- **后端**: Node.js + Express/Fastify（待架构师确认）
- **数据库**: PostgreSQL / SQLite（待架构师确认，个人用可先 SQLite）
- **部署**: 待定（参考 Codex 工作流: Vercel + Supabase 或自部署）

## 开发环境
- **当前工作目录**: `D:\HPM`
- **文档资料**: `D:\HPM\工作流\` (9 JPG), `D:\HPM\硬件开发流程\` (11 PPTX)
- **已抽取 PPTX 文本**: `D:\HPM\__pptx_extracted_xml\` (10 txt)
- **团队**: `software-hwpm` (TeamCreate 已建)
- **GitHub 连接**: connected
- **PM2 进程守护**: hpm-server(3001) + hpm-client(5173)，autorestart=true
- **PM2 开机自启**: 注册表 HKCU\Run → `D:\HPM\scripts\pm2-resurrect.bat` → pm2 resurrect
- **PM2 管理**: `bash start.sh [start|stop|restart|status|logs]`

## 项目阶段追踪
| 阶段 | 状态 | 完成日期 | 交付物 |
|------|------|---------|-------|
| Memory 初始化 | ✅ | 2026-07-07 | knowledge-base.md |
| 顶层 PRD | ✅ | 2026-07-07 | docs/PRD.md v2.0 |
| 模块详细 PRD | ✅ | 2026-07-07 | docs/modules/01-06-*.md |
| 架构设计 | ✅ | 2026-07-07 | docs/architecture.md |
| 基础架构搭建 | ✅ | 2026-07-07 | client/ + server/ 全栈脚手架 |
| 模块开发 | 🔄 进行中 | 2026-07-07 | M1 项目计划排期表 ✅ |

## 六大核心模块（最终定稿）
| # | 模块 | 详细 PRD |
|---|------|---------|
| M1 | 项目进度（阶段/里程碑/甘特图） | docs/modules/01-项目进度模块-PRD.md |
| M2 | 待办事项（Kanban 看板） | docs/modules/02-待办事项模块-PRD.md |
| M3 | 故障管理（Mantis 对接+DI 计算） | docs/modules/03-故障管理模块-PRD.md |
| M4 | 物料管理（BOM+备料跟踪） | docs/modules/04-物料管理模块-PRD.md |
| M5 | 会议纪要（腾讯会议+全时会议对接） | docs/modules/05-会议纪要模块-PRD.md |
| M6 | 周报（聚合 M1-M5 数据输出） | docs/modules/06-周报模块-PRD.md |

## 用户决策（2026-07-07 确认）
- 目标用户：个人使用（单用户，无角色权限）
- 外部对接：后续对接 Mantis（缺陷双向同步）和 PLM（文档拉取），需预留适配层接口
- 阶段模板：支持自定义，预设曙光标准流程为默认模板
- 物料管理：需备料跟踪（交期状态 + 逾期预警）
- 文档导出：不做
- 移动端：预留响应式 + PWA 接口，MVP 不实现

## 运维知识库 — 服务器挂了排查 SOP

### 排查步骤（按优先级执行）

**第1步：检查 PM2 进程状态**
```bash
npx pm2 status
```
- 进程列表为空 → 跳到「情况A：PM2 daemon 未启动 / 进程丢失」
- 进程 status=errored/stopped → 跳到「情况B：进程崩溃」
- 进程 status=online 但网页打不开 → 跳到「情况C：进程在线但服务异常」

**第2步：HTTP 健康检查**
```bash
curl -s -o /dev/null -w "Server: %{http_code}\n" http://localhost:3001/api/projects
curl -s -o /dev/null -w "Client: %{http_code}\n" http://localhost:5173
```
- 非 200 → 查 PM2 日志 `npx pm2 logs --lines 50`

---

### 情况A：PM2 daemon 未启动 / 进程丢失（最常见）

**症状**: `pm2 status` 进程列表为空，或 PM2 daemon 刚启动

**原因**: 重启后 PM2 daemon 没有自动启动（Windows 原生不支持 pm2 startup）

**修复**:
```bash
cd /d/HPM
npx pm2 start ecosystem.config.js   # 启动进程
npx pm2 save                         # 保存进程列表到 dump.pm2
```

**开机自启已配置**（2026-07-10）:
- 注册表 `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\HPM-PM2-AutoStart`
- → `D:\HPM\scripts\pm2-resurrect.bat`（延迟15秒 + 完整node路径执行 pm2 resurrect）
- 如果开机自启失效，检查注册表项是否存在：
  ```powershell
  Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name HPM-PM2-AutoStart
  ```
- 如果不存在，重新注册：
  ```powershell
  Set-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name HPM-PM2-AutoStart -Value "D:\HPM\scripts\pm2-resurrect.bat"
  ```

---

### 情况B：进程崩溃（status=errored）

**症状**: PM2 进程存在但 status=errored，或频繁重启（↺ 数字大）

**排查**:
```bash
npx pm2 logs hpm-server --lines 100 --err
npx pm2 logs hpm-client --lines 100 --err
```

**历史 Bug 参考**:
1. **react-dom 包损坏**（2026-07-09）: `node_modules/react-dom/cjs/react-dom.production.js` 文件缺失 → `npm install react-dom react` 重装 + 删 `node_modules/.vite` 缓存
2. **Vite --force 无限循环**（2026-07-09）: ecosystem.config.js 的 `--force` 标志导致 Vite 优化中崩溃 → PM2 重启 → 又 --force → 死循环。修复：移除 `--force`
3. **fastRefresh:false 白屏**（2026-07-09）: `@vitejs/plugin-react` 设 `fastRefresh:false` 后注入 `$RefreshSig$()` 但不加载运行时 → ReferenceError。修复：移除 `fastRefresh:false`
4. **NODE_ENV 错误**: hpm-client 必须用 `NODE_ENV: "development"`（Vite 开发模式），hpm-server 用 `"production"`

**修复后必做**:
```bash
npx pm2 restart ecosystem.config.js
npx pm2 save   # 更新 dump.pm2
```

---

### 情况C：进程在线但服务异常

**症状**: PM2 status=online 但 HTTP 非 200 或白屏

**排查**:
1. 查日志: `npx pm2 logs --lines 50`
2. 检查端口占用: `npx pm2 status` 看 PID，确认 3001/5173 没被其他进程抢占
3. 检查 SQLite 文件锁: `server/data/hpm.db` 是否被其他进程锁定
4. 检查磁盘空间: 内存 81%+ 时可能出问题

**核武器（重启大法）**:
```bash
npx pm2 delete all
npx pm2 start ecosystem.config.js
npx pm2 save
```

---

### PM2 常用命令速查
| 命令 | 作用 |
|------|------|
| `npx pm2 status` | 查看进程状态 |
| `npx pm2 logs` | 实时查看所有日志 |
| `npx pm2 logs hpm-server --err` | 查看服务端错误日志 |
| `npx pm2 restart ecosystem.config.js` | 重启所有进程 |
| `npx pm2 restart hpm-server` | 重启单个进程 |
| `npx pm2 delete all` | 删除所有进程（核武器） |
| `npx pm2 start ecosystem.config.js` | 从配置启动 |
| `npx pm2 save` | 保存当前进程列表到 dump.pm2 |
| `npx pm2 resurrect` | 从 dump.pm2 恢复进程（开机自启用） |
| `bash start.sh [start\|stop\|restart\|status\|logs]` | HPM 封装的管理脚本 |

### 关键文件路径
- PM2 配置: `D:\HPM\ecosystem.config.js`
- 开机自启 bat: `D:\HPM\scripts\pm2-resurrect.bat`
- 开机自启 vbs（备用）: `D:\HPM\scripts\pm2-autostart.vbs`
- 管理脚本: `D:\HPM\start.sh`
- PM2 dump: `C:\Users\chenxu\.pm2\dump.pm2`
- 服务端日志: `D:\HPM\server\pm2-error.log` / `pm2-out.log`
- 客户端日志: `D:\HPM\client\pm2-error.log` / `pm2-out.log`
- Node 路径: `C:\Users\chenxu\.workbuddy\binaries\node\versions\22.22.2\node.exe`

## 上次任务
2026-07-10: PM2 开机自启固化（注册表 HKCU\Run + pm2-resurrect.bat → pm2 resurrect），彻底解决重启后服务丢失问题。
