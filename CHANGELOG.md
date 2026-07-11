# CHANGELOG

> 每次代码迭代的变更记录，字段：修改模块 / 新增功能 / 缺陷修复 / 接口调整 / 参数变动。

## 2026-07-11 — 排期模板接口契约对齐（GET 支持中文名读回 + POST 拒绝路径穿越字符）

- **缺陷修复**
  - 【中文名模板读回】`GET /api/templates/schedule/:file` 文件名白名单原为 `^[A-Za-z0-9_\-]+\.json$`，拒绝 CJK，导致中文名模板能存不能读（返回 400），「编辑已有模板」链路断裂；改为 `^[\u4e00-\u9fa5A-Za-z0-9_\-]+\.json$`，与 `POST` 端 `sanitizeTemplateName`（保留中文）保持一致
  - 【路径穿越显式拒绝】`POST /api/templates/schedule` 原仅靠 `sanitizeTemplateName` 静默剥除 `/`、`\`、`..`，`../etcpasswd` 被洗成 `etcpasswd.json` 仍落盘并返回 200，不符合「拒绝→400」契约且与 `***`→400 不一致；改为在清洗前先做显式校验，原始 `name` 含 `/`、`\` 或 `..` 直接 400 拒绝（保留 `dirname` 守卫作纵深防御）

- **修改模块**
  - `server/src/routes/schedule.js`：仅改上述两处（GET 白名单字符类、POST 路径穿越前置校验），`custom-hardware.json` 等已有模板文件不受影响

- **接口调整**
  - `GET /api/templates/schedule/:file`：现接受中文名（如 `我的模板A.json`），返回 200 + 完整模板内容（含 `bg_color`）；`dirname` 穿越守卫不变
  - `POST /api/templates/schedule`：新增前置校验，body.name 含路径分隔符（`/`、`\`）或 `..` 时返回 `400 { ok:false, error:"模板名称含非法字符（禁止路径分隔符或 ..）" }`；普通中文/字母/数字名正常通过并保留

- **参数变动**
  - 无新增依赖，无数据模型变动；仅收紧输入校验契约

- **新增功能**
  - 无

## 2026-07-11 — 项目计划页三项增量（阶段折叠联动 + 甘特图时间轴单位切换 + 模板阶段背景色）

- **新增功能**
  - 【折叠联动】排期表与甘特图中 `task_type='阶段任务'` 可展开/收起其子孙；折叠状态上提至 `SchedulePage`（`collapsedPhases`/`toggleCollapse`），排期表与甘特图共用同一份 `visibleTasks`，阶段自身始终保留、仅隐藏子孙
  - 【时间轴单位切换】甘特图时间刻度支持 **日 / 周 / 月 / 季度** 切换（`ToggleButtonGroup`），采用缩放模型 `PX_PER_DAY = { day:24, week:12, month:4, quarter:1.5 }`（px/天随单位递减），条形/箭头/今天线随缩放自动重算；表头改为通用 major/minor 双行（按 unit 生成标签）
  - 【模板阶段背景色 + 存入模板】排期模板每个阶段任务带背景色；新增模板管理对话框（从当前项目克隆 / 编辑已有模板），仅阶段任务可设色（复用 `ContextMenu` 的 `PRESET_COLORS` 调色板 + 自定义取色器）；保存时持久化到 JSON 文件
  - 模板 `generate` 时将 `bg_color` 透传写入 `schedule_tasks.bg_color`，排期表 `getBgColor` 继承 + 甘特图 `resolveColor` 优先 `bg_color` 着色

- **修改模块**
  - `client/src/utils/schedule-date.js`：新增纯函数 `computeVisibleTasks(tasks, collapsedPhases)`（提取自 `ScheduleTable` 递归隐藏子孙逻辑）
  - `client/src/components/schedule/ScheduleTable.jsx`：移除内部 `collapsedPhases` state，改为受控 props（`collapsedPhases`/`onToggleCollapse`），`visibleTasks` 复用 `computeVisibleTasks`
  - `client/src/components/schedule/GanttChart.jsx`：新增 `unit` prop（默认 `'day'`）；`DAY_WIDTH` 改为集中常量 `PX_PER_DAY[unit]`；`x/width/segment/todayX/links` 统一经 `daysFromStart(d)*PX` 换算；分段按 unit 生成 major/minor 并传给 `GanttTimeline`；启用 `dayjs` 的 `quarterOfYear` 插件
  - `client/src/components/schedule/GanttTimeline.jsx`：props 由 `monthSegments`/`weekSegments` 改为通用 `majorSegments`/`minorSegments`（双行表头），标签已在上游预格式化
  - `client/src/components/schedule/ContextMenu.jsx`：导出共享常量 `PRESET_COLORS`（含 `transparent` 清除约定），供模板编辑对话框复用
  - `client/src/components/schedule/TemplateEditorDialog.jsx`（新增）：模板新建/编辑对话框，列阶段任务树 + 阶段调色板，保存调用新增接口
  - `client/src/api/client.js`：`api.schedule` 新增 `saveTemplate(body)` 与 `getTemplate(file)`
  - `client/src/pages/SchedulePage.jsx`：上提折叠 state + `unit` state + 时间轴单位控件 + 「模板管理」按钮与对话框接入；`ScheduleTable` 传 `collapsedPhases`/`onToggleCollapse`，`GanttChart` 传 `visibleTasks`/`unit`
  - `server/src/routes/schedule.js`：新增 `POST /api/templates/schedule`（写回 JSON，含文件名安全校验、颜色格式校验、ref 越界/循环依赖防御，同名 upsert）；新增 `GET /api/templates/schedule/:file`（单模板读取，供编辑预填）；`generate` INSERT 末尾 `bg_color` 由字面 `''` 改为占位 `?` 并补 `tmpl.bg_color || ''` 参数
  - `server/src/templates/custom-hardware.json`：M1–M5 及各嵌套阶段（共 11 个阶段任务）补充 `bg_color` 字段

- **接口调整**
  - `POST /api/templates/schedule`：保存/新建模板，body `{ name, description, tasks:[{name,task_type,duration_days,parent_ref,predecessor_refs,bg_color}] }`，返回 `{ ok, data:{ file, name, task_count } }`（同名覆盖，目录穿越/非法字符/循环依赖均 400）
  - `GET /api/templates/schedule/:file`：返回单模板完整内容 `{ ok, data:{ name, description, tasks } }`（含 `bg_color`），文件不存在 404

- **参数变动**
  - 零新增依赖：复用既有 `react` / `@mui/material` / `dayjs`，仅 `dayjs.extend(quarterOfYear)`（dayjs 内置插件，无新包）；不改任何数据模型，仅新增接口与透传字段

- **缺陷修复**
  - 无（纯增量功能）

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
