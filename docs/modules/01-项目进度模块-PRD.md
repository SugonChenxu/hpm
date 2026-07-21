# M1 — 项目进度模块详细 PRD

> **关联顶层 PRD**: `docs/PRD.md` v2.0  
> **开发优先级**: ①（最优先——全局基础模块）  
> **依赖**: 无（M1 是全局底座，M2–M6 均依赖 M1 的项目/阶段结构）  
> **实现状态**: ✅ 已落地（项目管理 / 阶段 / 门禁 / 甘特图 / 项目计划排期表 2.6 均已实现；2026-07-20 校订排期 API 与数据模型）

---

## 一、模块职责

承载各项目**完整项目计划排期能力**，是整个应用的数据基础层。M2–M6 模块的任务、故障、物料、会议、周报均以 M1 的项目和阶段作为关联锚点。

---

## 二、功能清单

### 2.1 项目管理

| 功能 | 描述 | UI 入口 |
|------|------|--------|
| **创建项目** | 输入代号、名称、类别（新品/OEM/升级/定制/派生/部件引入/独立板卡/机柜机箱/产品维护）、选择流程模板 | 仪表盘「新建项目」按钮 |
| **编辑项目** | 修改项目基本信息、切换流程模板（切换后阶段重新实例化） | 项目详情页「编辑」按钮 |
| **删除项目** | 软删除（标记 archived），不物理删除数据 | 项目详情页「更多→删除」 |
| **项目卡片列表** | 仪表盘首页——所有项目以卡片网格展示：代号/名称/当前阶段/进度百分比/风险色标/最后更新时间 | 仪表盘 |
| **筛选与搜索** | 按状态（进行中/已结项/全部）、类别筛选；按代号/名称模糊搜索 | 仪表盘顶部 |

### 2.2 阶段管理

| 功能 | 描述 |
|------|------|
| **流程模板选择** | 创建项目时可选「曙光硬件产品开发标准流程」预设模板，或「空白模板」从零定义 |
| **预设模板内容** | M1 预研→M2 计划→M3 研发测试→M4 试制→M5 新品导入；每个大阶段内含 L 级任务骨架和 TR/DCP/MR 门禁点；DI 阈值预置(EVT→DVT<130, DVT→PVT<30, PVT→量产<10) |
| **自定义阶段** | 增/删/改名/调序；拖拽排序；可为每个阶段设定名称、目标描述、计划工期（周） |
| **阶段时间线** | 水平或垂直可视化时间线，类似地铁线路图——当前阶段高亮，已完成阶段绿色，未开始灰色，逾期红色 |
| **阶段状态** | 未开始 / 进行中 / 已完成 / 已逾期；系统根据计划结束日期与当前日期自动判断「已逾期」 |
| **阶段内任务列表** | 点击阶段展开该阶段下所有任务（来自 M2 待办事项模块的关联任务） |

### 2.3 里程碑 / 门禁管理

| 功能 | 描述 |
|------|------|
| **门禁点定义** | 每个阶段出口可定义门禁：名称、类型(TR 技术评审/DCP 决策评审/MR 管理评审/G-O 版本发布)、DI 值阈值 |
| **转段判定** | 系统自动检查门禁条件——所有关联任务的完成状态 + DI 值是否达标（DI 值取自 M3 故障管理模块按阶段统计）→ 显示「已满足/未满足」 |
| **转段操作** | 手动确认转段（MVP 不做自动转段），记录转段时间戳 |
| **门禁历史** | 每个门禁点显示判定结果和通过时间，形成审计追溯 |

### 2.4 甘特图（P1 增强）

| 功能 | 描述 |
|------|------|
| **时间线视图** | 以甘特图展示项目所有阶段的计划起止日期、实际起止日期（进度条对比） |
| **任务甘特条** | 阶段内任务（来自 M2）以细粒度条形显示 |
| **拖拽调整** | 拖拽调整阶段/任务的起止日期 |
| **里程碑标记** | 甘特图上以菱形图标标注门禁点位置 |
| **依赖线** | 阶段间以箭头连线表示先后依赖关系 |

### 2.5 进度可视化

| 功能 | 描述 |
|------|------|
| **进度百分比** | 按已完成阶段数/总阶段数，或按已完成任务数/总任务数计算 |
| **风险色标** | 绿色(正常)、黄色(有逾期风险，距计划结束<2周)、红色(已逾期) |
| **仪表盘摘要卡片** | 每个项目卡片上显示：进度圆环图 + 风险色标 + 当前阶段名称 |
| **故障概览区块** | 项目卡片待办事项下方嵌入 M3 故障管理实时指标（DI/故障总数/解决率 + DI 趋势 sparkline + 未解决分类饼图），详见 2.5.1 |

#### 2.5.1 项目概览卡片「故障概览」区块（关联 M3 故障管理）

> **概述**：在【项目概览】页面每个项目卡片的「待办事项」区块下方，嵌入与 M3 故障管理模块联动的质量健康度区块，直接呈现该项目（经 Forge→Mantis 映射）在 Mantis 中的实时故障指标，无需进入故障管理模块即可一眼掌握项目质量状态。

| 要素 | 描述 |
|------|------|
| 指标行 | DI 值 / 故障总数（全量） / 故障解决率，三者间距宽松（gap=4） |
| DI 配色阈值 | ≤10 绿色 `#10B981` ／ ≤30 黄色 `#F59E0B` ／ 其余 红色 `#EF4444` |
| 解决率配色阈值 | ≥90% 绿色 ／ ≥50% 黄色 ／ 其余 红色 |
| DI 趋势 | 紧凑 Area 折线 sparkline（近 29 周），hover tooltip 显示「周数（ISO 周，如 2026-W02）+ DI 值」 |
| 缺陷分布饼图 | 按「未解决问题」的模块分类分布（拉取真实缺陷列表 → 过滤 status≠已解决 → 按 category 分组计数）；10 色高区分度调色板；附 Top5 模块图例 |
| 数据透传与缓存 | 经 Forge→Mantis 映射解析 Mantis 项目 id，并行拉取 summary / di-trend / 未解决分类统计，写入 sync_cache（key=`dashboard_faults`，TTL 300s） |
| 未关联态 | 项目未建立 Forge→Mantis 映射时，区块显示「· 未关联 Mantis 故障」提示，不报错 |

> **口径说明**：故障总数取自全量缺陷；饼图取自未解决问题，二者口径不同、互补展示（总数看规模、饼图看当下存量风险）。

---

## 三、数据模型

### 3.1 `projects`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| code | TEXT | 项目代号（如 HG4-001） |
| name | TEXT | 项目名称 |
| category | TEXT | 类别：新品/OEM/升级/定制/派生/部件引入/独立板卡/机柜机箱/产品维护 |
| status | TEXT | 进行中/已结项/已归档 |
| template_id | INTEGER FK | 关联 phase_templates |
| department | TEXT | 部门（M4 OA 导入按内部立项号匹配用） |
| order_number | TEXT | 内部立项号（OA 导入匹配项目用） |
| storage_location | TEXT | 存放位置 |
| meeting_time | TEXT | 周例会时间「周一 09:00-10:00」（会议计划页只读展示） |
| current_phase | TEXT | 当前阶段代号（项目概览卡片联动显示） |
| theme_color | TEXT | 项目主题色（看板/会议计划用，8 色池） |
| sort_order | INTEGER | 看板/仪表盘拖拽排序持久化 |
| created_at | TEXT | ISO8601 |
| updated_at | TEXT | ISO8601 |

> **`projects` 表扩展说明**：上表在初版基础上已扩展 `department / order_number / storage_location / meeting_time / current_phase / theme_color / sort_order` 等字段，分别服务于物料 OA 导入匹配、会议计划例会展示、看板主题色与排序，均为后续模块迭代新增。

### 3.2 `phase_templates`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | — |
| name | TEXT | 模板名（如「曙光标准流程」） |
| is_preset | INTEGER | 1=系统预设不可删, 0=用户自定义 |
| phases_json | TEXT | JSON 数组：[{name, order, type(PHASE/GATE), duration_weeks, di_threshold, ...}] |

### 3.3 `phases`（项目实例化后的阶段）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | — |
| project_id | INTEGER FK | 所属项目 |
| name | TEXT | 阶段名 |
| phase_order | INTEGER | 阶段序号 |
| type | TEXT | PHASE / GATE |
| planned_start | TEXT | 计划开始日期 |
| planned_end | TEXT | 计划结束日期 |
| actual_start | TEXT | 实际开始日期 |
| actual_end | TEXT | 实际结束日期 |
| status | TEXT | 未开始/进行中/已完成/已逾期 |
| di_threshold | REAL | DI 值门槛（仅 GATE 类型有效） |

### 3.4 `gates`（门禁记录）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | — |
| phase_id | INTEGER FK | 关联的阶段（出口门禁） |
| name | TEXT | 门禁点名（如 TR3/DCP1/MR2） |
| gate_type | TEXT | TR/DCP/MR/G-O |
| di_threshold | REAL | 所需 DI 值 |
| current_di | REAL | 当前实际 DI 值（由 M3 模块计算写入） |
| is_passed | INTEGER | 0/1 |
| passed_at | TEXT | 通过时间 |

---

## 四、接口

| Method | Path | 说明 |
|--------|------|------|
| GET | /api/projects | 项目列表（支持 ?status=&category=&search=） |
| POST | /api/projects | 创建项目 |
| GET | /api/projects/:id | 项目详情（含阶段列表） |
| PUT | /api/projects/:id | 更新项目 |
| DELETE | /api/projects/:id | 归档项目（软删除） |
| GET | /api/templates | 流程模板列表 |
| GET | /api/projects/:id/phases | 项目阶段列表 |
| PUT | /api/projects/:id/phases | 批量更新阶段（含排序/增删） |
| PUT | /api/projects/:id/phases/:phaseId | 更新单个阶段 |
| POST | /api/projects/:id/gates/:gateId/check | 触发门禁条件检查 |
| POST | /api/projects/:id/gates/:gateId/pass | 手动通过门禁 |
| GET | /api/projects/:id/faults | 项目概览故障概览：解析 Forge→Mantis 映射，聚合 summary / di-trend / unresolvedCategoryStats（并行拉取，sync_cache key=`dashboard_faults` 缓存 300s；未建立映射则返回 linked:false） |

---

## 五、UI 设计要点

- **仪表盘**：卡片网格布局，每张卡片顶部项目代号大标题 + 彩色阶段进度条 + 右下角风险状态圆点
- **项目详情**：左侧纵向阶段时间线（M1→M5 地铁线风格，当前阶段脉冲高亮）+ 右侧内容区随选中阶段切换
- **甘特图**：使用 `@mui/x-charts` 或 `frappe-gantt`，水平滚动时间轴
- **创建项目**：分步对话框——Step1 基本信息 → Step2 选择模板 → Step3 确认创建


【项目进度】功能开发
核心功能是进行项目计划的排期，以及后续在项目出现延期的时候，可以调整前置任务完成时间，后续相关任务的排期也快速变化。

我的想法是这样，首先我们会有一个模板，因为每个项目的开发控制流程都差不多，这样可以快速进行项目排期

最后的呈现形式大概率是类似excel表格的形式呈现，表格逐列分别为序号，任务名称，开始时间，完成时间，工期，完成情况，前置任务，逐行位各项任务


前置任务功能：
功能清单：
1.一键创建计划：以今日日期为项目开始基准，使用内置模版平移生成全部排期节点；模版来源设置一个文件，后续我自己更改；
2.表格视图：任务行 序号，任务名称，开始时间，完成时间，工期，完成情况，前置任务
  任务名：点击进入编辑，回车/失焦保存，空值不删除
- 开始日期：点击弹出 DatePicker，修改后联动周期和后续节点；
- 结束日期：点击弹出 DatePicker，与开始日期 + 周期保持联动
- 周期(天)：点击进入 InputNumber，修改后联动结束日期
- 完成情况：自动判定，Tag 展示（已完成/进行中/未开始）
- 前置任务：任务选择前置任务后，开始时间变为前置任务结束时间+1天，具有多个前置任务时，为多个任务的最晚结束时间+1天
3.右键功能：对任务右键点击，功能包括修改任务类型、升级、降级、前置任务设置、在上方插入任务、在下方插入任务、删除任务
4.状态自动判定

| 状态 | 判定规则 | 标签样式 |
|------|---------|---------|
| 已完成 | 结束日期 < 今天 | 灰色 Tag + 行 45% 透明度 |
| 进行中 | 开始日期 ≤ 今天 ≤ 结束日期 | 蓝色 Tag |
| 未开始 | 开始日期 > 今天 | 灰色 Tag |
5.任务类型：任务类型有三种，普通任务，阶段任务，节点任务
	普通任务，默认逻辑
	阶段任务，开始时间、结束时间，为项目组内所有任务最早开始时间至最晚结束时间
	节点任务，默认1天，默认锁定时间不可变更

6.日期修改级联：
	修改开始日期，结束时间自动在开始日期基础上+工期；
	修改结束日期，开始时间不变，工期变化
	修改工期，结束时间变化
	阶段任务，节点任务逻辑按照上述
7.计划保存：设置计划保存按钮，保存的计划存在本地，每个变更的计划版本按照 日期+VersionX 命名
8.导出excel：
  任务名称存文本值，日期存日期值，工期存数值，日期包含函数关系的要体现出函数关系

---

### 2.6 项目计划（Excel 排期表）

> **概述**：在现有项目管理/阶段管理基础上，新增类 Excel 表格的精细化项目排期能力。排期表以「任务行」为粒度管理每个计划条目的时间、工期、依赖与状态，支持一键从模板生成、行内编辑、前置依赖联动、版本快照和 Excel 导出。

---

#### 2.6.1 一键创建计划

| 属性 | 说明 |
|------|------|
| **触发** | 在排期页面点击「从模板生成」按钮 |
| **基准日期** | 以当日日期（`new Date()`）作为项目首任务开始基准 |
| **模板来源** | `server/src/templates/` 目录下的 JSON 配置文件，支持用户自行新增/修改 |
| **生成逻辑** | 遍历模板中的任务列表，按 `duration_days` 和 `predecessors`（模板内序号引用）平移计算每个任务节点的 `planned_start` / `planned_end` |

**模板 JSON 结构示例**（`server/src/templates/曙光标准排期.json`）：

```json
{
  "name": "曙光硬件产品开发标准排期",
  "description": "基于曙光标准流程的默认项目排期模板",
  "tasks": [
    { "name": "M1 预研阶段",       "task_type": "阶段任务", "duration_days": 20, "predecessors": [] },
    { "name": "需求分析",          "task_type": "普通任务", "duration_days": 8,  "predecessors": [] },
    { "name": "技术可行性评估",     "task_type": "普通任务", "duration_days": 5,  "predecessors": [1] },
    { "name": "TR1 技术评审",      "task_type": "节点任务", "duration_days": 1,  "predecessors": [2] },
    { "name": "M2 计划阶段",       "task_type": "阶段任务", "duration_days": 15, "predecessors": [] },
    { "name": "详细设计",          "task_type": "普通任务", "duration_days": 10, "predecessors": [3] },
    { "name": "DCP1 决策评审",     "task_type": "节点任务", "duration_days": 1,  "predecessors": [5] }
  ]
}
```

> **注意**：模板中的 `predecessors` 使用模板内 tasks 数组**零基索引**。生成时系统自动将索引映射为数据库 ID，并平移日期。

---

#### 2.6.2 Excel 表格排期视图

采用类 Excel 表格（MUI DataGrid / 自研可编辑表格）呈现项目排期。

| 列序号 | 列名 | 数据来源 | 列宽 | 说明 |
|:--:|------|------|:--:|------|
| 1 | 序号 | `task_order` | 60px | 自动编号，拖拽/右键调整后重新编号 |
| 2 | 任务名称 | `name` | 240px | 可点击行内编辑（见 2.6.3） |
| 3 | 开始时间 | `planned_start` | 130px | DatePicker 编辑 |
| 4 | 完成时间 | `planned_end` | 130px | DatePicker 编辑 |
| 5 | 工期 | `duration_days` | 80px | 单位：天，InputNumber 编辑 |
| 6 | 完成情况 | 自动判定 | 100px | Tag 展示（见 2.6.4） |
| 7 | 前置任务 | `predecessor_ids` | 160px | 显示前置任务名称列表，点击可跳转 |

> **行维度说明**：此处的「任务」是排期计划条目（`schedule_tasks` 表），与 M2 待办事项模块的 `tasks` 表是**不同实体**——前者是计划层面的排期节点，后者是执行层面的日常工作项。两者通过 `project_id` 和 `phase_id` 关联但不直接耦合。

**额外 UI 元素**：
- **顶部项目选择器**：`Select` 下拉切换已创建的项目，切换后自动加载对应项目的排期数据
- **「新建项目」入口**：选择器旁放置 `Button`（outlined），点击跳转 `/projects/new`
- **工具栏**：`[从模板生成]` `[保存版本]` `[导出 Excel]` `[导入 Excel]` `[腾讯文档导入]` `[清空计划]` 按钮组

---

#### 2.6.3 行内编辑

| 列 | 编辑控件 | 触发方式 | 保存逻辑 | 边界规则 |
|------|----------|----------|----------|----------|
| **任务名称** | 内联 `TextField` | 单击单元格进入编辑 | 回车或失焦 → `PUT /api/schedule-tasks/:id` | 空值不执行保存（前端拦截，不清空不删除） |
| **开始日期** | `DatePicker` (MUI) | 单击弹出日历面板 | 选择日期后即时保存 | 修改后触发级联（见 2.6.8） |
| **结束日期** | `DatePicker` (MUI) | 单击弹出日历面板 | 选择日期后即时保存 | 与开始日期、工期保持双向联动 |
| **工期(天)** | `InputNumber` 或 MUI `TextField type="number"` | 单击进入编辑 | 回车或失焦保存 | 修改后自动更新结束日期 = 开始日期 + 工期 |
| **前置任务** | 弹窗多选（`Dialog` + `Checkbox`列表） | 右键菜单进入 | 确认后保存 | 多选时取最晚结束时间 + 1 天（见 2.6.5） |

**联动规则**：
- 任一日期/工期字段变更后，前端即时计算受影响值并在 UI 中预览
- 确认保存时调用 API，后端校验并持久化
- 阶段任务和节点任务的编辑规则见 2.6.7

---

#### 2.6.4 完成情况自动判定

完全由系统根据日期自动计算，不提供手动修改入口。

| 状态 | 判定规则 | Tag 样式 | 行样式 |
|------|----------|----------|--------|
| **已完成** | `planned_end < 今日日期` | `<Chip>` 灰色（MUI `default`） | 整行 `opacity: 0.45` |
| **进行中** | `planned_start ≤ 今日日期 ≤ planned_end` | `<Chip>` 蓝色（`color="primary"`） | 正常 |
| **未开始** | `planned_start > 今日日期` | `<Chip>` 灰色（`variant="outlined"`） | 正常 |

> **刷新时机**：页面加载时计算一次；每次保存或编辑后重新计算。不依赖定时刷新——用户操作驱动。

---

#### 2.6.5 前置任务

| 属性 | 说明 |
|------|------|
| **设置入口** | 右键菜单 →「前置任务设置」→ 弹出多选对话框，列出当前项目所有排期任务 |
| **单选逻辑** | 选择任务 A 作为前置 → 当前任务 `planned_start` = 任务 A 的 `planned_end` + 1 天 |
| **多选逻辑** | 选择多个前置任务 → 取所有前置任务中**最晚的 `planned_end`** + 1 天作为当前任务 `planned_start` |
| **存储** | `predecessor_ids` 字段，JSON 数组格式，如 `[3, 5, 7]` |
| **联动** | 前置任务的结束日期变更时，受影响的后置任务开始日期自动级联更新（触发 2.6.8 规则） |
| **循环依赖防护** | 后端保存时校验——不允许 A→B→A 的环；前端在选择器中自动过滤会导致环的任务 |

---

#### 2.6.6 右键菜单

在任务行上右键点击（`onContextMenu`）弹出 `Menu` 组件，包含以下选项：

| 菜单项 | 图标 | 行为 | 适用任务类型 |
|--------|------|------|:--:|
| **修改任务类型** | `SwapHoriz` | 弹出子菜单选择「普通任务」「阶段任务」「节点任务」 | 全部 |
| **升级** | `ArrowUpward` | `outdent`：减少缩进、提升一级层级（`parent_id` 上移） | 全部（顶层项 disabled） |
| **降级** | `ArrowDownward` | `indent`：增加缩进、设为前一条任务的子任务（`parent_id` 指向前一兄弟） | 全部（首行 disabled） |
| **前置任务设置** | `AccountTree` | 弹出多选对话框设置前置依赖 | 全部 |
| **在上方插入** | `Add` | 在当前行上方插入空白任务行，`task_order` 后续全部 +1 | 全部 |
| **在下方插入** | `Add` | 在当前行下方插入空白任务行，`task_order` 后续全部 +1 | 全部 |
| **删除任务** | `Delete` (红色) | 弹出 `ConfirmDialog` 确认后物理删除 | 全部 |

> **升级/降级规则**：实际映射为层级 indent/outdent（调整 `parent_id`），而非 `task_order` 交换。阶段任务的聚合时间范围在层级变更后重新计算。排序仍由 `task_order` 决定，插入/删除时全局重排。

---

#### 2.6.7 任务类型

| 类型 | 标识 | 时间行为 | 编辑限制 |
|------|------|----------|----------|
| **普通任务** | 默认 | 执行标准级联联动逻辑（2.6.8） | 无限制 |
| **阶段任务** | 行首加粗 + 背景色微区分 | **聚合型**：`planned_start` = 其下所有子任务的最早开始时间；`planned_end` = 最晚结束时间 | 开始/结束日期只读（自动计算）；工期 = `planned_end - planned_start`（只读）；可修改名称和任务类型 |
| **节点任务** | 行首特殊图标（◆） | 固定 1 天工期（`duration_days = 1`） | **时间锁定**：开始日期和工期不可变更；`is_locked = 1`；仅名称可编辑 |

**阶段任务的范围界定**：
- 两个阶段任务之间的所有普通/节点任务视为该阶段的子任务
- 若为顶层阶段（第一个阶段任务之前），则其范围涵盖从项目开始到该阶段任务之间的所有任务
- 若为最后一个阶段任务，则其范围涵盖从该阶段任务到项目末尾之间的所有任务

---

#### 2.6.8 日期修改级联逻辑

| 操作 | 联动规则 | 公式 |
|------|----------|------|
| **修改开始日期** | 结束日期联动；工期不变 | `planned_end = new_planned_start + duration_days` |
| **修改结束日期** | 开始日期不变；工期联动 | `duration_days = planned_end - planned_start` |
| **修改工期** | 开始日期不变；结束日期联动 | `planned_end = planned_start + new_duration_days` |

**级联传播**（修改任一任务的日期后）：
1. 更新当前任务的时间字段
2. 检查是否有其他任务以当前任务为前置依赖（`predecessor_ids` 包含当前任务 ID）
3. 对每个后置任务，重新计算其 `planned_start = max(所有前置任务 planned_end) + 1 天`
4. 递归传播至所有受影响的后续任务
5. 重新计算所有阶段任务的聚合时间范围

> **节点任务例外**：节点任务不参与级联传播——其时间固定，不可被联动修改。

---

#### 2.6.9 保存与版本管理

| 属性 | 说明 |
|------|------|
| **保存按钮** | 工具栏「保存版本」按钮（`Save` icon） |
| **存储位置** | SQLite 数据库——当前工作副本存于 `schedule_tasks` 表，历史快照存于 `schedule_versions.tasks_snapshot`（JSON） |
| **版本命名** | 自动生成，格式 `{当日日期}_Version{N}`，如 `2026-07-07_Version1`；N 为当日已有版本数 +1 |
| **保存流程** | 1. 将当前 `schedule_tasks` 全部行序列化为 JSON；2. 插入 `schedule_versions` 新行；3. 前端 Snackbar 提示「已保存：2026-07-07_Version1」 |
| **版本历史** | 工具栏「版本历史」下拉——列出所有已保存版本，点击可查看只读快照（表格灰显，不可编辑） |
| **恢复版本** | 在版本历史中选择版本 →「恢复此版本」→ 弹出 ConfirmDialog → 确认后用快照数据替换当前 `schedule_tasks`（当前未保存的修改将被覆盖） |

---

#### 2.6.10 导出 Excel

| 属性 | 说明 |
|------|------|
| **触发** | 工具栏「导出 Excel」按钮 |
| **导出内容** | 当前排期表的全部可见列 |
| **数据格式规则** | 见下表 |
| **实现方案** | 前端使用 `exceljs` 或 `xlsx` 库在前端生成 `.xlsx` 文件并触发下载 |

| 列 | 导出格式 | 说明 |
|----|----------|------|
| 序号 | 数值 | 纯数字 |
| 任务名称 | 文本 | 纯文本值 |
| 开始时间 | 日期值（`Short Date` 格式） | 若该单元格存在公式依赖（如 =前置任务结束日期+1），则导出为 `=DATE(...)` 公式 |
| 完成时间 | 日期值 / 公式 | 若工期由公式决定，导出 `=开始日期+工期` 公式 |
| 工期 | 数值 | 纯数字（天数） |
| 完成情况 | 文本 | 「已完成」「进行中」「未开始」 |
| 前置任务 | 文本 | 前置任务名称，多个用「、」分隔 |

> **公式导出策略**：排期表中存在以下三类公式关系——①日期级联（结束=开始+工期）、②前置依赖（开始=前置结束+1）、③阶段聚合（开始/结束=MIN/MAX子任务日期）。导出的 Excel 应保留这些公式逻辑，使用 `=WORKDAY()` 或 `=DATE()` 等 Excel 原生函数表达，以便用户在 Excel 中修改后仍能联动。

---

#### 2.6.11 文件导入（本地 Excel / 腾讯文档）

> **概述**：支持从外部表格批量建立排期，免去逐行手工录入。提供两种来源——「导入 Excel」（本地 `.xlsx/.xls` 文件）与「腾讯文档导入」（粘贴腾讯文档分享/下载链接）。两者共用同一套**表头模糊识别 + 任务类型自动区分**逻辑，导入行为均为**追加**（不清空现有计划，用户可先用「清空计划」再导入）。

**表头模糊识别**（中英文别名均可，未匹配列收集为提示）：

| 系统字段 | 候选列名（中/英，模糊匹配，顺序即优先级） |
|----------|------------------|
| 任务名称 | 任务、任务名、任务名称、名称、事项、工作、工作项、工作事项、活动 / name、task、title |
| 任务类型 | 任务类型、任务类别、类型、类别、分类 / tasktype、type |
| 阶段分组 | 阶段、所属阶段、阶段分组、阶段名称 / phase、group（见下方「阶段列分组」） |
| 开始时间 | 开始、开始时间、开始日期、开始日、起始、起始时间、起始日期、开工、开工日期、计划开始、计划开始时间、计划开始日期 / start、startdate |
| 完成时间 | 结束、结束时间、结束日期、完成、完成时间、完成日期、截止、截止日期、截止时间、完工、完工日期、竣工、交付日期、计划结束、计划结束日期 / end、enddate |
| 工期 | 工期、工期天、工期(天)、天数、历时、持续天数、工作天数、所需天数 / duration |
| 前置 | 前置、前置任务、前置条件、前置依赖、前置工序、紧前、紧前任务、先行任务、依赖 / predecessor、depends |
| 备注 | 备注、备注说明、说明、说明信息、备注信息、描述、注释 / notes、remark |
| 层级 | 层级、层次、缩进、级别、等级、深度 / level、indent |
| 序号 | 序号、seq、no、行号（自动重排，忽略） |

**阶段 / 普通 / 节点任务自动区分规则**（三级 fallback）：
1. **优先**「任务类型」列的值：阶段 / 里程碑 / 节点 → 对应 `阶段任务` / `节点任务` / `普通任务`（别名兼容 大阶段/阶段任务/关键节点/一般任务/子任务/phase/stage/milestone/task/normal 等）；
2. **回退** 行名关键字：含「阶段」→ 阶段任务；含「里程碑 / 节点」→ 节点任务；
3. **默认** 普通任务。

**阶段列分组**（`阶段` 列作为阶段分组，而非每行任务类型）：常见于「阶段 / 任务 / 计划开始时间 / 计划完成时间 / 工期」式模板（如「项目计划模板.xlsx」）。规则：
- 若 `阶段` 列有值 → 自动合成一条「**阶段任务**」父节点（名称取该列值，如「计划阶段」「详细设计阶段」），其下任务自动挂为子节点（缩进 1）；
- `阶段` 列空白的行 → 归属**上一个**非空阶段（连续空白表示同属该阶段）；
- 阶段任务本身不带日期，导入后由后端 `recalcPhaseAggregation` 按 `parent_id` 自动聚合其全部子孙任务的**最小开始 / 最大完成**作为阶段起止时间；
- 前置条件：模板表头含 `阶段` 列即可，无需单独的类型列。

**表头容错增强**：`norm()` 先做**全角→半角归一**（`（）`→`()`、全角短横、全角空格），再做精确别名匹配；精确未命中时启用**「包含关键字」兜底**（表头含「开始 / 完成 / 工期 / 阶段 / 前置 / 备注 / 层级 / 类型 / 任务」即匹配），兼容「计划开始时间」「计划完成时间」「工期（天）」等常见写法。

**开始 / 完成 / 工期 三字段自动互推**（`deriveDates`，前端预览与后端落库共用同一逻辑）：
- 给定任意两个字段即可推导第三个——**开始 + 完成 → 算工期**；**开始 + 工期 → 算完成**；**完成 + 工期 → 反推开始**；
- **阶段任务**：时间由子任务聚合回推；若显式给了开始+完成也先算出工期（无子任务时仍正确显示）；
- **节点任务**：单日里程碑，开始 = 完成，工期恒为 1 天；
- **仅给工期**（无起止日期）：落库时锚定到项目起始日，保证甘特图可渲染；后续可由前置依赖级联调整。
- 示例：只填「开始 2026-07-01、工期 5 天」→ 自动得「完成 2026-07-05」；只填「完成 2026-07-20、工期 3 天」→ 自动得「开始 2026-07-18」。


**层级与依赖**：
- `层级` 列（整数，0=顶级）或名称前导空白（每 2 空格 / 1 制表符为一级）决定 `parent_id`；导入时用「层级 → 最近行 id」栈还原父子关系，跨级自动截断避免悬空。
- `前置` 列：若全为数字视为 1-based 行号映射到同批任务 id；否则按任务名匹配；映射失败忽略该依赖（不阻断导入）。

**腾讯文档导入链路**：用户输入分享/下载链接 → 后端 `fetch` 该 URL（20s 超时）→ `exceljs` 解析首个工作表为矩阵 → 复用与本地导入完全相同的 `mapScheduleMatrix` 映射 → 批量插入。要求文档设为「任何人可阅读或下载」（否则链接拉取失败）。

**导入反馈**：前端 Snackbar 提示「已导入 N 条计划（M 条提示）」；解析失败（无任务列 / 空文件）给出明确错误。

---

#### 2.6.12 一键清空计划

| 属性 | 说明 |
|------|------|
| **触发** | 工具栏「清空计划」按钮（红色 outlined） |
| **确认** | 点击后弹出 ConfirmDialog，展示「将删除当前项目的全部 N 条计划，不可恢复」 |
| **接口** | `DELETE /api/projects/:id/schedule`（owner 校验） |
| **行为** | 物理删除该项目全部 `schedule_tasks`，清空后列表为空；需重新导入或从模板生成 |
| **与导入配合** | 典型流程：清空计划 → 导入 Excel / 腾讯文档，快速重建整份排期 |

---

### 新增数据模型

#### `schedule_templates`（排期模板——文件存储，非数据库表）

模板以 JSON 文件形式存储于 `server/src/templates/` 目录，格式见 2.6.1。系统读取目录下所有 `.json` 文件作为可选模板列表。

#### `schedule_versions`（排期版本快照）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| project_id | INTEGER FK | 关联 `projects.id` |
| version_name | TEXT | 版本名，如 `2026-07-07_Version1` |
| tasks_snapshot | TEXT | JSON 序列化的排期任务快照（完整 `schedule_tasks` 行数据） |
| created_at | TEXT | 保存时间 ISO8601 |

```sql
CREATE TABLE schedule_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    version_name TEXT NOT NULL,
    tasks_snapshot TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_schedule_versions_project ON schedule_versions(project_id);
```

#### `schedule_tasks`（排期任务——核心表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| project_id | INTEGER FK | 关联 `projects.id` |
| name | TEXT | 任务名称 |
| task_order | INTEGER | 排序序号（从 1 开始） |
| task_type | TEXT | `普通任务` / `阶段任务` / `节点任务` |
| planned_start | TEXT | 计划开始日期（ISO8601 日期） |
| planned_end | TEXT | 计划结束日期（ISO8601 日期） |
| duration_days | INTEGER | 工期（天） |
| completion_status | TEXT | 自动判定：`已完成` / `进行中` / `未开始`（只读） |
| predecessor_ids | TEXT | 前置任务 ID 列表，JSON 数组如 `[3,5]`，无前置为 `[]` |
| parent_id | INTEGER | 父任务 ID（层级缩进用，`indent`/`outdent` 调整）；NULL=顶层 |
| is_locked | INTEGER | 0=可编辑 / 1=时间锁定（节点任务专用） |
| notes | TEXT | 备注信息 |
| bg_color | TEXT | 行底色标记（右键菜单 7 色，类似物料管理） |
| created_at | TEXT | 创建时间 ISO8601 |
| updated_at | TEXT | 更新时间 ISO8601 |

```sql
CREATE TABLE schedule_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT '',
    task_order INTEGER NOT NULL DEFAULT 0,
    task_type TEXT NOT NULL DEFAULT '普通任务',
    planned_start TEXT,
    planned_end TEXT,
    duration_days INTEGER DEFAULT 1,
    completion_status TEXT DEFAULT '未开始',
    predecessor_ids TEXT DEFAULT '[]',
    parent_id INTEGER REFERENCES schedule_tasks(id) ON DELETE SET NULL,
    is_locked INTEGER DEFAULT 0,
    notes TEXT DEFAULT '',
    bg_color TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_schedule_tasks_project ON schedule_tasks(project_id, task_order);
CREATE INDEX idx_schedule_tasks_parent ON schedule_tasks(parent_id);
```

#### 与现有表的关系

```
projects 1 ──── * schedule_tasks        （一个项目可有多个排期任务）
projects 1 ──── * schedule_versions     （一个项目可有多个排期版本）
phases   ? ──── ? schedule_tasks        （无直接 FK 关系——排期中的"阶段任务"是排期内部层级概念，
                                          与 phases 表的项目顶层阶段结构独立）
```

---

### 新增 API 接口

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/projects/:id/schedule` | 获取当前排期任务列表（按 `task_order` 排序） |
| POST | `/api/projects/:id/schedule/generate` | 一键生成排期——Body: `{ "template_name": "曙光标准排期" }` |
| PUT | `/api/schedule-tasks/:id` | 更新单个排期任务（行内编辑保存） |
| POST | `/api/projects/:id/schedule/insert` | 插入新任务——Body: `{ "position": "above"\|"below", "reference_id": 5 }` |
| DELETE | `/api/schedule-tasks/:id` | 删除排期任务（物理删除，弹出 ConfirmDialog 确认） |
| PUT | `/api/projects/:id/schedule/:taskId/indent` | 降级：增加缩进（设为前一条任务的子任务，parent_id 指向其兄弟） |
| PUT | `/api/projects/:id/schedule/:taskId/outdent` | 升级：减少缩进（提升一级层级，parent_id 上移） |
| PUT | `/api/schedule-tasks/:id/predecessors` | 更新前置任务——Body: `{ "predecessor_ids": [3, 5] }` |
| GET | `/api/templates/schedule` | 列出 `server/src/templates/` 下所有可用模板 |
| POST | `/api/projects/:id/schedule/save` | 保存当前版本快照到 `schedule_versions` |
| GET | `/api/projects/:id/schedule/versions` | 获取版本历史列表 |
| GET | `/api/projects/:id/schedule/versions/:vid` | 查看指定版本快照详情 |
| POST | `/api/projects/:id/schedule/versions/:vid/restore` | 恢复指定版本到当前工作区 |
| GET | `/api/projects/:id/schedule/export` | 导出 Excel 文件（`Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`） |
| DELETE | `/api/projects/:id/schedule` | 一键清空当前项目的全部排期任务（owner 校验，不可恢复） |
| POST | `/api/projects/:id/schedule/import` | 批量导入——Body: `{ "tasks": [...] }`，前端解析 Excel 后提交；自动按 `indentLevel` 还原父子层级、按名称/行号映射前置依赖 |
| POST | `/api/projects/:id/schedule/import-from-url` | 腾讯文档导入——Body: `{ "url": "https://docs.qq.com/..." }`，后端拉取表格并复用表头模糊识别逻辑 |

---

### 交叉影响分析

#### 1. 排期「阶段任务」与 `phases` 表的关系

| 维度 | `phases` 表 | 排期「阶段任务」（`schedule_tasks.task_type='阶段任务'`） |
|------|-------------|----------------------------------------------------------|
| 层级 | 项目顶层阶段结构（M1~M5） | 排期表内部的层级组织单元 |
| 来源 | 从 `phase_templates` 实例化 | 从排期模板生成或手动创建 |
| 用途 | 门禁判定、项目进度百分比、模块关联锚点 | 排期表视图的聚合行，自动汇总子任务时间范围 |
| 数据关联 | `phases.id` 是 M2 tasks / M3 issues 等的外键 | 无独立外键——仅在排期表内部使用 |

**建议**：两个概念保持独立，互不耦合。排期表生成时可根据 phases 结构建议阶段任务分组，但不强制执行。未来如需关联，可在 `schedule_tasks` 增加 `phase_id` 可空 FK。

#### 2. 完成情况与门禁判定的关系

- 排期完成情况（`completion_status`）：基于**日期**的纯视觉状态标识，用于排期表内行样式渲染
- 门禁判定（`gates.is_passed`）：基于 **DI 值 + 关联任务完成状态**的条件判定，用于阶段推进决策
- **两者独立计算，互不依赖**。排期表中节点任务通常对应门禁点，但其完成情况仍仅按日期判定。

#### 3. `schedule_tasks` 与 M2 `tasks` 的区分

| 维度 | `schedule_tasks`（M1 排期） | `tasks`（M2 待办） |
|------|---------------------------|-------------------|
| 粒度 | 计划节点（里程碑级） | 日常工作项（操作级） |
| 时间属性 | `planned_start` / `planned_end` / `duration_days` | `due_date`（单截止日） |
| 依赖管理 | 内置前置任务图（`predecessor_ids`） | 无内置依赖 |
| 状态 | 基于日期自动判定 | 基于看板列（kanban_column）手动流转 |
| 编辑方式 | 行内表格编辑 | Drawer 表单编辑 |

**命名约定**：API 路径中排期任务统一使用 `schedule` / `schedule-tasks` 前缀，M2 任务使用 `tasks` 前缀，避免混淆。

#### 4. 与甘特图（2.4）的关系

- 甘特图（P1 增强）当前以 `phases` 表为数据源
- 新增排期表后，甘特图可扩展支持以 `schedule_tasks` 为数据源的细粒度视图
- 建议甘特图增加「排期视图」切换选项，当项目存在 `schedule_tasks` 数据时可选择排期表模式
- 依赖线可复用 `predecessor_ids` 字段自动绘制

#### 5. 前端路由扩展

新增路由：

```
/projects/:id/schedule     → 排期表页面 SchedulePage
```

在 ProjectDetailPage 的子模块 Tabs 中新增「排期」标签。

#### 6. 组件树扩展

```
SchedulePage
├── ScheduleToolbar
│   ├── ProjectSelector (Select 项目切换)
│   ├── CreateProjectButton (→ /projects/new)
│   ├── GenerateFromTemplateButton
│   ├── SaveVersionButton
│   ├── VersionHistoryDropdown
│   └── ExportExcelButton
├── ScheduleTable (MUI DataGrid / 自研可编辑表格)
│   ├── InlineTextField (任务名称)
│   ├── InlineDatePicker (开始/结束日期)
│   ├── InlineInputNumber (工期)
│   ├── CompletionStatusTag (完成情况 Tag)
│   └── PredecessorLink (前置任务链接)
├── PredecessorDialog (前置任务多选弹窗)
├── VersionHistoryDialog (版本历史查看)
└── ContextMenu (右键菜单)
```

---

> **排期模块版本**: v1.0（追加至 M1 PRD） | **依赖**: M1 基础（projects/phases 表） | **被依赖**: 甘特图 P1 增强可复用 `schedule_tasks` 数据源

