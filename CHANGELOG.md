# CHANGELOG

> 每次代码迭代的变更记录，字段：修改模块 / 新增功能 / 缺陷修复 / 接口调整 / 参数变动。

## 2026-07-10 — 项目概览「当前阶段」毛玻璃框 + 下拉选择

- **新增功能**
  - 项目概览卡片新增「当前阶段」毛玻璃半透明框，显示在**项目代号右侧**
  - 支持点击下拉选择 6 个固定阶段，各阶段配色：预研阶段（紫）/ 详细设计（蓝）/ EVT（绿）/ DVT（黄）/ 批量试制（橙）/ 直通率爬坡（红）
  - 新建项目默认「预研阶段」；切换阶段即时持久化并刷新卡片

- **修改模块**
  - `server/src/db.js`：projects 表新增 `current_phase` 列（DEFAULT `'pre_research'`），并对历史项目回填
  - `server/src/routes/projects.js`：`GET /projects` 改 `SELECT p.*`（去除原“进行中阶段名”子查询）；`POST`/`PUT` 支持 `current_phase`
  - `client/src/components/kanban/ProjectCard.jsx`：毛玻璃框（backdrop-filter 毛玻璃 + 半透明底 + 彩色边框）+ 下拉菜单；移除原信息区「当前阶段」行
  - `client/src/pages/DashboardPage.jsx`：新增 `onPhaseChange` 回调，选择后回写并刷新

- **接口调整**
  - `POST /api/projects`：新增可选字段 `current_phase`（默认 `pre_research`）
  - `PUT /api/projects/:id`：新增可选字段 `current_phase`
  - `GET /api/projects`：返回对象新增 `current_phase` 字段

- **参数变动**
  - 前端阶段 key→label→color 映射固化为 `PROJECT_PHASES` / `PHASE_MAP` 常量，无外部参数变更

- **缺陷修复**
  - 无（纯增量功能）
