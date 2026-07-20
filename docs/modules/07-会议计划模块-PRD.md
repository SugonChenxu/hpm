# M7 — 会议计划模块 PRD（2026-07-10 补充新增）

> **关联顶层 PRD**: `docs/PRD.md` v2.0  
> **当前版本**: v2.0（初版 v1.0 补录于 2026-07-10；v2.0 于 2026-07-20 依实际实现重写输出物周期模型）  
> **模块定位**: 扩展模块（独立于六大核心模块 M1–M6，顶层 PRD v2.0 定稿时尚未纳入）  
> **状态**: 已落地（代码已验收，本 PRD 自 v2.0 起与实现严格对齐）

---

## 〇、模块边界说明（重要）

> **会议计划 ≠ M5 会议纪要。**

| 维度 | M7 会议计划（本模块） | M5 会议纪要 |
|------|----------------------|-------------|
| 关注点 | **事前排期**——周例会时间规划、未来周会议安排 | **事后记录**——已开会议的纪要、决议、参会人 |
| 数据表 | `week_meetings` + `meeting_outputs` | `meetings` + `meeting_action_items` + `smart_minutes` |
| 外部对接 | 无（纯本地排期） | 腾讯会议 API + 全时会议 API |
| 导航位置 | 侧边栏「协作沟通」分组，路由 `/week-meetings` | 侧边栏「协作沟通」分组，路由 `/meetings` |
| 视图形态 | 课表式周网格（时间轴 × 工作日） | 会议列表 + 纪要编辑 |

本模块是独立一级页面，使用独立数据表，不属于 M5。顶层 PRD「六大核心模块」语义保持不变，本模块作为**扩展模块 M7** 补充。

---

## 一、模块职责

**周例会排期与未来周规划页面**。以「课表」形式呈现每周一至周六的工作日会议安排，支持拖拽创建会议、设置持续多周自动同步、按周浏览/规划历史与未来会议，并记录每日输出物。

- 导航：`协作沟通` 分组下的一级菜单「会议计划」，图标 `EventNote`，路由 `/week-meetings`（与原页面名「本周会议」对应，导航现改名「会议计划」）
- 核心用户价值：让硬件项目经理在一屏内看清「这周 / 未来几周每天什么会」，并支持把固定例会一键铺到多周

---

## 二、已实现功能

### 2.1 页面定位与导航

| 功能 | 状态 | 描述 |
|------|------|------|
| 一级导航「会议计划」 | ✅ | 侧边栏「协作沟通」分组，与「会议纪要」并列；路由 `/week-meetings`，图标 `EventNote` |
| 课表式排期网格 | ✅ | 首列时间轴 + 周一~周六 6 个工作日列（**已删除周日列**） |

### 2.2 排期表格

| 功能 | 状态 | 描述 |
|------|------|------|
| 列布局 | ✅ | 首列时间轴 + 周一~周六 6 列，7 列等宽 `grid` |
| 表头 / 首列背景色 | ✅ | 星期标题行、首列时间列均填充 `HEADER_BG = #F3F4F6` |
| 斜线表头 | ✅ | 首个单元格 SVG 对角线，左上「时间」、右下「星期」 |
| 时间槽常量 | ✅ | `SLOT_HEIGHT = 28`；会议卡片用绝对定位覆盖在对应时间格上 |
| 时间范围 | ✅ | 09:00–21:00，30 分钟一槽（`09:00 / 09:30 / … / 21:00`） |

### 2.3 会议创建交互（拖拽 + Popper）

| 功能 | 状态 | 描述 |
|------|------|------|
| 拖拽框选 | ✅ | 左键在空白时间格**拖拽**起止时间段 → 弹出 Popper |
| Popper 表单 | ✅ | 会议名称输入 + 「持续周数」数字输入（默认 `1`，`min 1` `max 52`） |
| 确认 / 取消 | ✅ | 底部 `[取消] [确认]` 按钮；确认或回车创建，取消或点外部=取消（**已移除误触自动创建**） |
| 备选对话框 | ✅ | 顶部「添加会议」按钮打开 Dialog（星期 / 起止时间 / 名称 / 周数），保留为备选录入方式 |
| 删除会议 | ✅ | 自定义会议卡片悬浮删除按钮（`DeleteOutline`） |

### 2.4 会议卡片

| 功能 | 状态 | 描述 |
|------|------|------|
| 卡片显示 | ✅ | 会议名 + 时间（`09:00-10:00`），绝对定位覆盖对应时间格 |
| 样式 | ✅ | 去除中间边框线（`borderBottom: none`），字号稍大（`0.72rem`）；左侧 3px 主题色竖条 |
| 项目例会标记 | ✅ | 从 `projects.meeting_time` 解析的周例会以**项目主题色**显示，标题 `[代号] 名称 周例会`，只读不可删除 |

### 2.5 输出物（InlineOutput）—— 周期模板 / 每周实例模型

> **核心设计（v2.0）**：输出物区分「周期模板」与「每周实例」两类，均存于 `meeting_outputs` 表（通过 `is_template` 区分）。周期项按周/隔周/每月规则**自动在每周生成虚拟项**，用户对其「完成」操作仅代表**当前这一周**的周期交付，不影响后续周。

| 功能 | 状态 | 描述 |
|------|------|------|
| 行内编辑 | ✅ | 每个工作日底部多行 `InlineOutput`，点击空白区出现输入框；输入回车 / 失焦保存为一条输出物 |
| 自动编号 | ✅ | 同一周同一工作日的多条输出物按添加顺序自动编号 `1.` `2.` `3.`…（字号与文字一致，加粗） |
| 周期标签前缀 | ✅ | 设周期的项在标题前加紧凑标签：`1W`(每周) / `2W`(隔周) / `1M`(每月)；标签带浅色底，与编号、文字同基线水平对齐 |
| 完成框 | ✅ | 每条输出物首行最左侧一个与字号等大的勾选框（✓）；勾选代表**当前周**该条完成；换行第二行对齐到 `1W` 列，首行四要素（完成框/标签/编号/文字）始终保持水平对齐 |
| 设置周期 | ✅ | 行尾 ▶ 展开菜单含「编辑 / 设置周期 / 删除」；设周期后该行升级为**周期模板**（`is_template=1`），后续周自动出现 |
| 周期规则 | ✅ | `1W` 每周出现；`2W` 每隔 1 周（weekDiff%2==0）；`1M` 显示「每月」但实际**每隔 4 周**出现（weekDiff%4==0） |
| 持续 N 周同步 | ✅ | 普通会议设 `weeks` 会在多周各插一条；周期输出物**永久按规则每周自动生成虚拟项**，无需手动铺 |
| 删除 | ✅ | 普通项/实例删该条；周期模板删除后停止后续周生成 |
| 存储 | ✅ | 持久化到 `meeting_outputs` 表（逐条 item，不再按 week_key+weekday 唯一） |

> **虚拟周期项说明**：服务端 GET 时仅返回 `is_template=0` 的普通/实例条目 + 按 `is_template=1` 模板规则推算的虚拟项（id 形如 `recurring_<id>`，`source_id` 指向模板）。虚拟项被勾选「完成」时调用 `cycle-instance` 接口 upsert 一条当周实例（`is_template=0`），其完成态独立于其他周。

### 2.6 周次导航与未来周规划

| 功能 | 状态 | 描述 |
|------|------|------|
| 周切换 | ✅ | 顶部左右箭头切换周 + 「回到本周」按钮 |
| ISO 周号 | ✅ | 显示「2026年 第28周」（按周四归属年计算 ISO 周号） |
| 日期范围 | ✅ | 显示「7/6-7/11」（周一~周六） |
| 未来周规划 | ✅ | 可向前 / 向后浏览任意周，查看并规划历史与未来周会议安排 |

### 2.7 「持续 N 周」自动同步

| 功能 | 状态 | 描述 |
|------|------|------|
| 多周插入 | ✅ | `POST` 支持 `weeks` 参数：事务内为当前周及之后 `(weeks-1)×7` 天各插入一条相同会议 |
| 本地安全计算 | ✅ | 用 `addDaysToWeekKey` 按本地时间推算 `week_key`，规避时区偏移 |
| 周数约束 | ✅ | 前端 / 后端双重 `clamp`：`weeks` 限定在 `1–52` |

---

## 三、数据模型（已实施）

### 3.1 `week_meetings`（核心表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增 |
| week_key | TEXT | 该周周一，格式 `YYYY-MM-DD` |
| weekday | TEXT | 周一 / 周二 / … / 周六 |
| start_time | TEXT | 开始时间 `HH:MM` |
| end_time | TEXT | 结束时间 `HH:MM` |
| title | TEXT | 会议名称 |
| created_at | TEXT | `datetime('now','localtime')` |
| updated_at | TEXT | `datetime('now','localtime')` |

索引：`idx_week_meetings_key ON week_meetings(week_key)`

### 3.2 `meeting_outputs`（核心表，由旧 `week_meeting_outputs` 迁移）

> 原 `week_meeting_outputs`（单行 blob，UNIQUE(week_key, weekday)）已迁移为逐条 item 模型，支持每条输出物独立完成态、排序、周期模板/实例区分。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增 |
| week_key | TEXT | 该周周一 `YYYY-MM-DD` |
| weekday | TEXT | 周一 / … / 周六 |
| title | TEXT | 输出物内容文本 |
| is_done | INTEGER | 0/1，当前周完成态 |
| sort_order | INTEGER | 同周同工作日排序（自动编号依据） |
| cycle | TEXT | 周期类型：`''`(一次性) / `weekly`(1W) / `biweekly`(2W) / `monthly`(1M) |
| is_template | INTEGER | 0=普通/每周实例（直接展示）；1=周期模板（定义，不直接展示，由 GET 推算虚拟项） |
| source_id | INTEGER | 实例指向其模板 id（`is_template=1` 行的 id）；模板行该值为 0 |
| created_at | TEXT | `datetime('now','localtime')` |
| updated_at | TEXT | `datetime('now','localtime')` |

索引：`idx_meeting_outputs` 建议建在 `(week_key, weekday, sort_order)`。

> **月度语义**：`cycle='monthly'` 在 UI 显示「每月」，但服务端按 **每隔 4 周**（weekDiff%4==0）推算出现周，避免自然月边界歧义。

### 3.3 `projects` 关联字段（例会来源）

| 字段 | 类型 | 说明 |
|------|------|------|
| meeting_time | TEXT | 例会时间，格式「周一 09:00-10:00」；为空则不显示该项目例会 |

> 项目例会**只读**显示在会议计划页，由服务端 `GET` 时实时从 `projects` 解析，不落地到 `week_meetings`。

---

## 四、API（已实施）

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/week-meetings?week=YYYY-MM-DD` | 参数化查询当周；返回 `{ ok, data: { meetings, outputs, recurring } }`；`outputs` 含 `is_template=0` 的普通/实例条目 + 按模板推算的虚拟周期项（`id` 形如 `recurring_<id>`，带 `source_id`） |
| POST | `/api/week-meetings` | 创建会议；`weeks` 参数支持持续多周（事务内批量插入，`clamp 1–52`） |
| PUT | `/api/week-meetings/:id` | 更新单条会议（weekday / 起止时间 / 名称） |
| DELETE | `/api/week-meetings/:id` | 删除单条会议 |
| POST | `/api/week-meetings/outputs` | 新增一条输出物（普通或显式周期/模板）；body: `{ week_key, weekday, title, cycle?, is_template?, source_id? }` |
| POST | `/api/week-meetings/outputs/cycle-instance` | 周期项「完成」：按 `(week_key, weekday, title)` upsert 当周实例（`is_template=0`，保留 `cycle` 与 `source_id`）；已存在则仅更新 `is_done` |
| PUT | `/api/week-meetings/outputs/:id` | 更新输出物：`title` / `is_done` / `cycle` / `is_template` / `source_id` 任一字段 |
| DELETE | `/api/week-meetings/outputs/:id` | 删除一条输出物（周期模板删除后停止后续周生成） |

**`recurring` 字段说明**：服务端从 `projects` 表读取 `meeting_time` 非空项目，解析为 `{ weekday, start_time, end_time, title: '[代号] 名称 周例会', project_id, theme_color, source: 'project' }`，前端按主题色展示且不可删除。

**输出物周期推算（GET）**：服务端读取 `is_template=1` 的模板，按其与查询周 `week_key` 的周数差 `weekDiff` 决定本周是否出现——`weekly` 恒出现、`biweekly` 取 `weekDiff%2==0`、`monthly` 取 `weekDiff%4==0`；已存在一致实例（`weekday|title`）的周去重，不重复生成。

---

## 五、前端组件清单

| 路径 | 说明 |
|------|------|
| `pages/WeekMeetingPage.jsx` | 会议计划页面入口（课表网格 + 周导航 + Popper + 备选 Dialog） |
| `InlineOutput`（页面内组件） | 行内可编辑输出物组件（点击空白→输入→回车/失焦保存） |
| `Row`（页面内子组件） | 单行：时间标签 + 6 天格子 + 叠加的会议卡片 |

> 前端 API 封装：`api.weekMeetings.{ list, create, update, remove, saveOutputs }`（`client/src/api/client.js`）

---

## 六、已知局限（P2 后续迭代）

- 会议卡片**不支持拖拽移动 / 改时间**（仅能删除后重建）
- 项目例会**只读**（来自 `projects.meeting_time`，不支持在会议计划页直接编辑）
- 无会议提醒 / 通知 / 日历导出（如 `.ics`）
- 输出物为纯文本条目，无结构化字段、无附件
- 未与 M5 会议纪要、M6 周报打通（例会与纪要 / 周报暂无自动关联）

---

> **v2.0 变更（2026-07-20）**：依据实际实现重写「2.5 输出物」——由旧版「单行文本 blob」升级为「逐条 item + 周期模板/每周实例模型」，新增自动编号、1W/2W/1M 周期标签、与字号等大的完成框、周期项按周/隔周/每4周自动生成虚拟项；「3.2 数据模型」由 `week_meeting_outputs` 更正为 `meeting_outputs`（含 `title/is_done/sort_order/cycle/is_template/source_id`）；「四、API」补充 `cycle-instance` 与按字段更新的 `outputs/:id` 端点，移除旧版批量 `PUT /outputs`。
