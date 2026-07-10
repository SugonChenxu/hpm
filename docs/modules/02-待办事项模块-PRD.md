# M2 — 每日待办看板模块 PRD（2026-07-08 更新）

> **关联顶层 PRD**: `docs/PRD.md` v2.0  
> **当前版本**: v3.0（全功能重构完成）  
> **提交**: `d3e395d`

---

## 一、模块职责

**多项目看板网格页面**。每个项目一张独立双栏看板卡片，支持左右双栏（待办/已完成）布局、四级优先级状态灯、子任务管理、拖拽排序、项目主题色区分。看板卡片可在页面中自由拖拽排列位置。

---

## 二、已实现功能

### 2.1 项目看板网格

| 功能 | 状态 | 描述 |
|------|------|------|
| 多项目看板并排 | ✅ | `/todos` 页面展示所有项目的看板卡片，响应式网格 `auto-fill minmax(540px, 1fr)` |
| 看板卡片拖拽 | ✅ | @dnd-kit 实现卡片级拖拽，交换看板排列位置 |
| 主题色 | ✅ | 每个项目独立主题色（8 色池随机分配），顶栏 3px 横条 + 边框装饰 |
| 自动折叠 | ✅ | 全部任务完成后自动折叠（Collapse 动画 300ms），新增/取消完成自动展开 |
| 手动折叠 | ✅ | 每张看板 ▲/▼ 按钮，折叠状态持久化到 localStorage |
| 项目名编辑 | ✅ | 点击标题 → 内联 TextField → 回车/失焦保存 |
| 空状态引导 | ✅ | 无项目时居中引导卡片「创建你的第一个项目看板」 |
| 新建项目 | ✅ | 「新建项目看板」按钮 → CreateProjectDialog（无模板，自动分配主题色） |

### 2.2 双栏看板（待办 / 已完成）

| 功能 | 状态 | 描述 |
|------|------|------|
| 极简快速录入 | ✅ | 待办栏顶部 TextField，输入任务标题回车即新增，光标即刻返回，支持连续快速录入 |
| 待办栏 | ✅ | 任务列表支持 @dnd-kit 拖拽排序，sort_order 持久化 |
| 已完成栏 | ✅ | 按 completed_at 倒序排列，灰化+删除线，opacity 0.6，✓ M/D 完成时间标签 |
| 撤销完成 | ✅ | 悬浮回退箭头，点击移回待办栏 |
| 删除任务 | ✅ | 悬浮删除按钮 + 二次确认弹窗 |
| 乐观更新 | ✅ | 所有操作即时 UI 反馈 + API 后台同步 |

### 2.3 优先级状态灯

| 功能 | 状态 | 描述 |
|------|------|------|
| 四级优先级 | ✅ | 紧急 #cf1322 / 高 #ff4d4f / 中 #faad14 / 低 #52c41a（默认低） |
| 纯色圆点 | ✅ | 10px 圆形状态灯，位于任务左侧 |
| 点击切换 | ✅ | 点击圆点循环切换：低→中→高→紧急→低，乐观更新 + API 持久化 |
| 文字颜色联动 | ✅ | 紧急/高优先级：标题文字变色加粗（#cf1322/#ff4d4f），中/低保持黑色 |
| 旧值兼容 | ✅ | P0→紧急、P1→高、P2→中 自动映射 |

### 2.4 子任务

| 功能 | 状态 | 描述 |
|------|------|------|
| 展开/收起 | ✅ | 点击 ▶ 箭头展开子任务面板，展开后自动聚焦输入框 |
| 快速新增 | ✅ | 子任务输入框回车新增，光标保持，支持连续添加 |
| 完成勾选 | ✅ | 勾选框标记完成，文字添加删除线；再次点击取消完成 |
| 删除子任务 | ✅ | 悬浮展示删除按钮，点击弹出二次确认弹窗 |
| 子任务标识 | ✅ | 存在子任务时 ▶ 替换为 📋 蓝色列表图标，Tooltip: (未完成数/总数) |
| 进度条 | ✅ | 面板底部进度条显示完成比例 |

### 2.5 已完成栏 UI 标准

| 功能 | 状态 | 描述 |
|------|------|------|
| 标题置灰+删除线 | ✅ | ✅ |
| 状态灯透明度 | ✅ | 保留色值，整体 opacity 0.35 |
| 完成时间标签 | ✅ | ✓ M/D 格式 |
| 子任务标识 | ✅ | 📋 图标 + Tooltip |
| 撤销待办 | ✅ | 悬浮回退箭头 ↩ |
| 删除 | ✅ | 悬浮删除按钮 + 二次确认 |
| 状态灯/任务名/完成时间水平对齐 | ✅ | 已完成栏中优先级状态灯、任务标题、✓ M/D 完成时间标签采用 flex 水平对齐（已完成栏 UI 标准已落地） |

---

## 三、数据模型（已实施）

### 3.1 `subtasks`（新表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | — |
| task_id | INTEGER FK | 关联 tasks(id)，级联删除 |
| title | TEXT | 子任务标题 |
| is_completed | INTEGER | 0/1 |
| sort_order | INTEGER | 排序 |
| created_at | TEXT | — |
| updated_at | TEXT | — |
| deleted_at | TEXT | 软删除 |

### 3.2 `tasks` 新增字段

| 字段 | 类型 | 说明 |
|------|------|------|
| sort_order | INTEGER | 拖拽排序 |
| completed_at | TEXT | 完成时间（NULL=未完成） |
| priority | TEXT | 变更：urgent/high/medium/low 四级 |

### 3.3 `projects` 新增字段

| 字段 | 类型 | 说明 |
|------|------|------|
| theme_color | TEXT | 默认 #1565C0，8 色池随机分配 |

---

## 四、API（已实施）

| Method | Path | 说明 |
|--------|------|------|
| GET | /api/tasks | 任务列表（含 subtask_count 子查询） |
| POST | /api/tasks | 创建任务（sort_order 自动计算） |
| PUT | /api/tasks/:id | 更新任务 |
| DELETE | /api/tasks/:id | 软删除 |
| POST | /api/tasks/:id/subtasks | 新增子任务 |
| GET | /api/tasks/:id/subtasks | 获取子任务列表 |
| PUT | /api/subtasks/:id | 更新子任务（标题/完成状态） |
| DELETE | /api/subtasks/:id | 软删除子任务 |
| PUT | /api/tasks/:id/reorder | 调整任务排序 |
| PUT | /api/tasks/:id/toggle-complete | 切换完成状态 |
| GET | /api/projects/:id/kanban-stats | 项目看板统计 |

---

## 五、前端组件清单

| 路径 | 说明 |
|------|------|
| `pages/TaskKanbanPage.jsx` | 多项目看板网格入口 |
| `components/kanban/KanbanProjectView.jsx` | 单项目双栏看板卡片 |
| `components/kanban/TodoColumn.jsx` | 待办栏（快速录入 + 拖拽） |
| `components/kanban/DoneColumn.jsx` | 已完成栏 |
| `components/kanban/TaskCard.jsx` | 任务卡片（@dnd-kit sortable） |
| `components/kanban/TaskItem.jsx` | 任务行（状态灯 + 标题编辑 + 子任务入口） |
| `components/kanban/PriorityChip.jsx` | 10px 纯色圆点优先级灯 |
| `components/kanban/SubtaskList.jsx` | 子任务列表 |
| `components/kanban/SubtaskItem.jsx` | 子任务行 |
| `components/kanban/CollapsedProjectHeader.jsx` | 折叠态头部 |
| `hooks/useOptimistic.js` | 乐观更新 hook |
| `hooks/useKanbanScroll.js` | 滚动保持 hook |

---

## 六、已知局限（P2 后续迭代）

- 全局四列看板视图保留但简化，未与双栏看板深度整合
- 子任务完成不影响父任务状态（按设计决策）
- 看板卡片拖拽顺序未持久化到后端（仅前端 state）
- 无负责人/截止日期字段交互（MVP 简化）
