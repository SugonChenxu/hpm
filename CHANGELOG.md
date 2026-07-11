# CHANGELOG

> 每次代码迭代的变更记录，字段：修改模块 / 新增功能 / 缺陷修复 / 接口调整 / 参数变动。

## 2026-07-11 — 项目计划页甘特图（只读，含 FS 依赖关系可视化）

- **新增功能**
  - 在【项目计划】页排期表下方新增只读甘特图，依据已有 `schedule_tasks` 排期自动生成时间轴（月+周双行刻度 + 竖向网格）与任务条形（按 depth 缩进、按状态/自定义色着色）
  - 自动解析 `predecessor_ids`（FS 完成→开始，lag=0）绘制依赖箭头折线，含重叠/反向时的绕行防穿越逻辑
  - 时间轴标注「今天」红色虚线；阶段任务加粗 + 深色描边区分层级
  - hover 条形显示 Tooltip（名称 / 起止 / 工期 / 状态）
  - 空态、单任务、无依赖、循环依赖防御、跨月长跨度等边界均安全处理，绝不抛错

- **修改模块**
  - `client/src/components/schedule/GanttChart.jsx`（新增）：主容器，纯展示组件，接收 `tasks` props，`useMemo` 计算时间轴范围 / 行模型 / id→rowIndex 映射 / 依赖连线 / 今天线，组合子组件
  - `client/src/components/schedule/GanttTimeline.jsx`（新增）：双行表头刻度 + 竖向网格，sticky 固定
  - `client/src/components/schedule/GanttRow.jsx`（新增）：左侧任务名列（depth 缩进、sticky）+ 右侧条形（着色 / Tooltip）
  - `client/src/components/schedule/GanttLinks.jsx`（新增）：绝对定位 SVG 依赖连线层（FS 箭头 + 今天线）
  - `client/src/pages/SchedulePage.jsx`（修改）：`<ScheduleTable>` 后插入 `<GanttChart tasks={tasks} />`，外层包 `overflowX:auto` 横向滚动容器

- **接口调整**
  - 无（复用 `api.schedule.list(projectId)`，组件内不发请求）

- **参数变动**
  - 零新增依赖，全部使用既有 `react` / `@mui/material` / `dayjs`；绘图常量集中在 `GanttChart.jsx`（DAY_WIDTH=24 等），不改数据模型

- **缺陷修复**
  - 无（纯增量功能）

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

## 2026-07-10 — 会议计划「输出物」逐条 item 化（对齐待办事项 subtask）

- **新增功能**
  - 输出物从「按星期单段文本」改为「逐条 item + 完成态 + 删除线」，体验对齐【待办事项】子任务
  - 每个星期格子内可**逐条添加**输出物（底部输入框，回车连续添加）
  - 每条输出物前有勾选框，**点击完成加删除线并置灰**；hover 显示删除按钮可移除
  - 增/改/删均持久化到后端数据库

- **修改模块**
  - `server/src/db.js`：新增 `meeting_outputs` 逐条表（id, week_key, weekday, title, is_done, sort_order, created_at, updated_at）；首次启动将旧 `week_meeting_outputs` 单 blob 表的非空 content 逐条迁入后 DROP（幂等）
  - `server/src/routes/week-meetings.js`：`GET /week-meetings` 改从 `meeting_outputs` 查询；移除旧批量 `PUT /week-meetings/outputs`，新增逐条 CRUD —— `POST /week-meetings/outputs`（新增，自动算 MAX(sort_order)+1）、`PUT /week-meetings/outputs/:id`（切 is_done/改标题，404 处理）、`DELETE /week-meetings/outputs/:id`（删除）
  - `client/src/api/client.js`：`saveOutputs` 替换为 `meetingOutputs: { add, update, remove }`
  - `client/src/pages/WeekMeetingPage.jsx`：移除 `InlineOutput` 单文本框；新增 `MeetingOutputList`（勾选框+line-through+hover 删除+底部回车连续添加）与 handleAddOutput/handleToggleOutput/handleDeleteOutput（乐观更新+异常回滚）

- **接口调整**
  - 新增 `POST /api/week-meetings/outputs`：body `{week_key, weekday, title}`
  - 新增 `PUT /api/week-meetings/outputs/:id`：body `{title?, is_done?}`
  - 新增 `DELETE /api/week-meetings/outputs/:id`
  - 移除 `PUT /api/week-meetings/outputs`（旧批量覆盖接口）
  - `GET /api/week-meetings` 的 `outputs` 由「单 blob 数组」变为「逐条 item 数组」

- **参数变动**
  - 无外部参数变更；数据模型由单 blob 升级为逐条结构化

- **缺陷修复**
  - 无（纯增量功能，原单 blob 方案不满足逐条管理需求故重构）

## 2026-07-11 — PLM 连接配置与只读探针（P0，为"项目计划→PLM排程"同步打基础）

- **新增功能**
  - 新增 PLM 适配器连接配置：可配置 `server_url` / `api_token`(CAS SSO Cookie) / `collab_space` / `tls_reject_unauthorized`(默认跳过内部 CA)
  - 新增「只读探针」：输入任意 PLM URL，后端携带 Cookie 请求并返回结构化结果（HTTP 状态 / Content-Type / body 长度 / 是否 JSON 及顶层 keys / body 前 2000 字符），用于探明排程读取接口
  - 前端「项目计划」页新增「PLM 连接/探针」入口，可保存连接配置并实时探测

- **修改模块**
  - `server/src/db.js`：新增 `plm_connection`（连接配置表）与 `plm_task_map`（任务映射表，预留给 P1/P2 增量同步，本次仅建表）
  - `server/src/adapters/plm.js`（新）：`PlmAdapter` 类，复用 mantis.js 模式；`_httpRequest` 用 `node:https` + `https.Agent` 默认跳过内部 CA；`probe` 支持相对路径拼接、结构化返回、401/403 友好提示
  - `server/src/routes/plm.js`（新）：`GET/PUT /api/plm/connection` + `POST /api/plm/probe`，统一错误映射（网络/TLS→502，参数/校验→400）
  - `server/src/index.js`：`app.use("/api", plmRouter)` 注册 PLM 路由
  - `client/src/api/client.js`：新增 `plm: { getConnection, saveConnection, probe }`
  - `client/src/components/plm/PlmConnectionDialog.jsx`（新）：连接配置表单 + 探针结果展示
  - `client/src/pages/SchedulePage.jsx`：头部加「PLM 连接/探针」按钮打开 Dialog

- **接口调整**
  - 新增 `GET /api/plm/connection`：返回当前 PLM 连接配置
  - 新增 `PUT /api/plm/connection`：保存/更新连接配置（校验 server_url 必填）
  - 新增 `POST /api/plm/probe`：body `{ url }`，返回 PLM 响应结构化结果

- **参数变动**
  - 无外部参数变更；Cookie 经接口写入数据库，前端无硬编码凭据

- **缺陷修复**
  - 无（纯增量 P0 框架，未实现实际同步逻辑）
