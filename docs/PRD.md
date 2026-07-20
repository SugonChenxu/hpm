# HPM 项目顶层 PRD（产品需求文档）

> **版本**: v2.0  
> **编制日期**: 2026-07-07（v1.0）→ 2026-07-07（v2.0 重构）  
> **基准知识库**: `.workbuddy/memory/hardware-pm-knowledge-base.md`  
> **状态**: 已定稿

---

## 一、产品定位

面向硬件项目经理的**个人级全生命周期项目管控工具**。覆盖六大核心业务模块，以项目为主线串联计划排期、待办看板、故障追踪、物料管控、会议管理、周报生成。

---

## 二、六大核心功能模块

| # | 模块 | 核心职责 | 外部对接 | 开发优先级 |
|---|------|---------|---------|:---:|
| **M1** | 项目进度模块 | 承载各项目完整项目计划排期——阶段时间线、里程碑门禁、甘特图、进度可视化、转段自动判定 | — | ① |
| **M2** | 待办事项模块 | 待办事项可视化看板管理——拖拽流转、分类筛选、截止日期追踪、关联项目/阶段 | — | ② |
| **M3** | 故障管理模块 | 对接拉取 Mantis 系统故障全量数据 + 本地缺陷登记 + DI 值统计与转段判定 | **Mantis API** | ③ |
| **M4** | 物料管理模块 | 统一记录、维护各类物料信息——BOM 清单、备料交期跟踪、逾期预警、通用/开发物料分类 | — | ④ |
| **M5** | 会议纪要模块 | 拉取腾讯会议(tmeet CLI)会议数据——会议列表、AI 智能纪要查看、决议追踪、手动登记 | **腾讯会议 tmeet CLI** | ⑤ |
| **M6** | 周报模块 | 独立生成各项目专属总结周报——聚合进度/任务/故障/物料/会议数据 → 结构化模板输出 | —（数据聚合 M1–M5） | ⑥ |

> **扩展功能（独立于六大核心模块）**：以下功能在 v2.0 定稿时尚未纳入六大核心模块，作为补充能力存在，详见各模块 PRD。

| # | 模块 | 核心职责 | 外部对接 | 状态 |
|---|------|---------|---------|:--:|
| **M7** | 会议计划模块 | 周例会排期与未来周规划——课表式排期网格、拖拽创建、持续 N 周自动同步、输出物记录 | — | 已落地（v1.0） |

> **项目概览已实现交互细节补充**：项目概览卡片「当前阶段」联动显示该项目【项目计划】中状态为「进行中」的任务名称（无进行中任务时回退显示 `current_phase`）；项目代号以加大字号单独成行（`[CODE]`），项目名称单独成行。

---

## 三、模块间关系

```
┌─────────────────────────────────────────────────────────┐
│                      M1 项目进度                         │
│  (项目→阶段→里程碑→甘特图, 全局时间线)                    │
└──────────┬──────────────────────────────────────────────┘
           │ 关联项目/阶段
    ┌──────┼──────────┬──────────────┬──────────────┐
    ▼      ▼          ▼              ▼              ▼
┌──────┐ ┌──────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│  M2  │ │  M3  │ │    M4    │ │    M5    │ │    M6    │
│ 待办 │ │ 故障 │ │   物料   │ │ 会议纪要 │ │   周报   │
│ 看板 │ │ Mantis│ │  BOM+备料│ │腾讯+全时 │ │ 聚合输出 │
└──────┘ └──────┘ └──────────┘ └──────────┘ └────┬─────┘
                                                  │
                     聚合 M1-M5 数据 ←────────────┘
```

**依赖说明**：
- M2 待办可关联 M1 的阶段/任务
- M3 故障可关联 M1 的阶段（用于 DI 值按阶段计算）
- M4 物料可关联 M1 的项目（物料归属项目）
- M5 会议纪要可关联 M1 的项目/阶段
- M6 周报串联 M1–M5 全部数据，是聚合输出层

---

## 四、全局技术约束

| 约束项 | 决策 |
|-------|------|
| **用户** | 个人使用，MVP 无登录/无多用户 |
| **技术栈** | 前端 Vite + React + MUI + Tailwind CSS；后端 Node.js + Express；数据库 SQLite |
| **架构** | 前后端分离，RESTful API |
| **阶段模板** | 预设曙光标准流程(M1-M5/L1-L12)，支持用户自定义 |
| **Mantis 对接** | 全量故障数据拉取 + 双向同步；预留 adapter 层 |
| **会议系统对接** | 腾讯会议 + 全时会议；适配器模式，预留扩展其他会议系统 |
| **移动端** | 响应式布局 + 预留 PWA Service Worker 注册点，MVP 不实现 |
| **GitHub** | 强制同步，每次 push 自动生成 CHANGELOG |
| **部署** | 待定 |
| **开发时序** | 先搭建基础架构（脚手架+DB+API骨架），再按 M1→M2→M3→M4→M5→M6 串行开发 |

---

## 五、全局数据模型（核心表）

| 表 | 所属模块 | 核心字段 |
|----|---------|---------|
| `projects` | M1 | id, code, name, category, status, template_id, department, order_number, storage_location, meeting_time, current_phase, theme_color, sort_order, created_at, updated_at |
| `phase_templates` | M1 | id, name, is_preset, phases_json |
| `phases` | M1 | id, project_id, name, phase_order, type(PHASE/GATE), planned_start/end, actual_start/end, status, di_threshold |
| `gates` | M1 | id, phase_id, name, gate_type(TR/DCP/MR/G-O), di_threshold, current_di, is_passed, passed_at |
| `tasks` | M2 | id, project_id, phase_id, title, description, priority(urgent/high/medium/low), assignee, kanban_column, due_date, status, sort_order, completed_at, created_at, updated_at, deleted_at |
| `subtasks` | M2 | id, task_id, title, is_completed, sort_order, created_at, updated_at, deleted_at |
| `issues` | M3 | id, project_id, phase_id, code, mantis_id, source(local/mantis), title, severity, status, assignee, di_weight, category, resolution, mantis_updated_at, synced_at, created_at, updated_at |
| `mantis_connection` | M3 | id, server_url, api_token, project_mapping, sync_interval_min, is_active, last_sync_at, last_sync_status |
| `sync_cache` | M3 | id, project_id, cache_key, cache_data, cached_at, ttl_seconds |
| `materials` | M4 | id, project_id, seq, part_number, manufacturer, model, material_status, quantity, quantity_per_set, set_count, purchase_date, lead_time, expected_delivery, notes, created_at, updated_at |
| `material_import_snapshots` | M4 | id, project_id, ids_json, created_at |
| `meetings` | M5 | id, project_id, phase_id, platform(tencent/quanshi/manual), external_id, meeting_code, title, start_time, end_time, duration_minutes, attendee_count, attendees_json, transcript_text, recording_url, minutes_text, minutes_status, minutes_url, created_at, updated_at |
| `meeting_action_items` | M5 | id, meeting_id, content, assignee, due_date, status, linked_task_id, completed_at |
| `smart_minutes` | M5 | id, meeting_id(UNIQUE), record_file_id, content, summary, action_items_json, fetched_at, created_at |
| `weekly_reports` | M6 | id, project_id, week_start, week_end, title, content_json, status, version, created_at, updated_at |
| `schedule_tasks` | M1 | id, project_id, name, task_order, task_type(普通任务/阶段任务/节点任务), planned_start, planned_end, duration_days, completion_status, predecessor_ids, parent_id, is_locked, notes, bg_color, created_at, updated_at |
| `schedule_versions` | M1 | id, project_id, version_name, tasks_snapshot, created_at |
| `week_meetings` | M7 | id, week_key(YYYY-MM-DD 周一), weekday, start_time, end_time, title, created_at, updated_at |
| `meeting_outputs` | M7 | id, week_key, weekday, title, is_done, sort_order, cycle(weekly/biweekly/monthly/''), is_template(0/1), source_id, created_at, updated_at |

> **M7 输出物表改名说明**：原 `week_meeting_outputs`（单行 blob，UNIQUE(week_key, weekday)）已迁移为 `meeting_outputs`（逐条 item 模型），支持每条输出物独立完成态、排序、周期模板/实例区分。详见 `docs/modules/07-会议计划模块-PRD.md`。

---

## 六、各模块详细 PRD 索引

| 模块 | 详细 PRD 文件 | 状态 |
|------|-------------|:--:|
| M1 项目进度模块 | `docs/modules/01-项目进度模块-PRD.md` | 已落地（含项目计划排期表 2.6） |
| M2 待办事项模块 | `docs/modules/02-待办事项模块-PRD.md` | 已落地（v3.0） |
| M3 故障管理模块 | `docs/modules/03-故障管理模块-PRD.md` | 已落地（v1.1） |
| M4 物料管理模块 | `docs/modules/04-物料管理模块-PRD.md` | 已落地（2026-07-17） |
| M5 会议纪要模块 | `docs/modules/05-会议纪要模块-PRD-v2.md` | 已落地（tmeet CLI 版 v2.0） |
| M6 周报模块 | `docs/modules/06-周报模块-PRD.md` | 已落地（服务端聚合） |
| M7 会议计划模块 | `docs/modules/07-会议计划模块-PRD.md` | 已落地（含周期输出物模型） |

> **注意**：M5 原 `05-会议纪要模块-PRD.md`（v1，基于腾讯/全时 API + OAuth）已废弃，现行实现以 `05-会议纪要模块-PRD-v2.md`（tmeet CLI 极简版）为准，详见该文件头部说明。

---

> **PRD 版本**: v2.0 | **变更**: 从"P0/P1/P2 三级需求池"重构为"六大核心模块"最终定稿结构；Mantis 对接从 P2 提升至 P0(M3)；新增 M5 会议纪要、M6 周报模块。

> **2026-07-10 补充**: 新增扩展模块 **M7 会议计划**（见 `docs/modules/07-会议计划模块-PRD.md`，状态已落地）；「五、全局数据模型」补充 `week_meetings` / `week_meeting_outputs` 两表；「六、各模块详细 PRD 索引」补充 M7 行；「二」补充项目概览卡片「当前阶段」联动与代号/名称分两行的已实现交互细节。六大核心模块语义保持不变。

> **2026-07-20 准确性修订**：根据 Forge 当前实装状态全量校订——「六、各模块详细 PRD 索引」M1–M6 状态由「待编写」更正为「已落地」；「五、全局数据模型」补全各表真实字段（含 subtasks/sync_cache/smart_minutes/schedule_tasks 等），并将已过时的 `week_meeting_outputs` 更正为现行 `meeting_outputs`（逐条 item + 周期模板/实例模型）；M5 索引指向现行 v2（tmeet CLI 版），原 v1 标记为废弃。
