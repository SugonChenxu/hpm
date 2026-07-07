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
| **M5** | 会议纪要模块 | 对接拉取腾讯会议、全时会议会议数据——会议列表、纪要编辑、决议追踪、参会人管理 | **腾讯会议 API + 全时会议 API** | ⑤ |
| **M6** | 周报模块 | 独立生成各项目专属总结周报——聚合进度/任务/故障/物料/会议数据 → 结构化模板输出 | —（数据聚合 M1–M5） | ⑥ |

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
| `projects` | M1 | id, code, name, category, status, template_id, created_at |
| `phase_templates` | M1 | id, name, is_preset, phases_json |
| `phases` | M1 | id, project_id, name, order, planned_start/end, actual_start/end, status |
| `gates` | M1 | id, phase_id, name, type(TR/DCP/MR), di_threshold, is_passed |
| `tasks` | M2 | id, phase_id, title, assignee, priority, status, kanban_column, due_date |
| `issues` | M3 | id, project_id, phase_id, mantis_id, code, severity, title, status, di_weight, synced_at |
| `materials` | M4 | id, project_id, part_no, name, spec, qty, supplier, lead_time_days, planned_delivery, actual_delivery, status |
| `meetings` | M5 | id, project_id, phase_id, platform(tencent/quanshi/manual), external_id, title, start_time, end_time, attendees_json, transcript |
| `meeting_action_items` | M5 | id, meeting_id, content, assignee, due_date, status |
| `weekly_reports` | M6 | id, project_id, week_start, week_end, content_json, status |

---

## 六、各模块详细 PRD 索引

| 模块 | 详细 PRD 文件 | 状态 |
|------|-------------|:--:|
| M1 项目进度模块 | `docs/modules/01-项目进度模块-PRD.md` | 待编写 |
| M2 待办事项模块 | `docs/modules/02-待办事项模块-PRD.md` | 待编写 |
| M3 故障管理模块 | `docs/modules/03-故障管理模块-PRD.md` | 待编写 |
| M4 物料管理模块 | `docs/modules/04-物料管理模块-PRD.md` | 待编写 |
| M5 会议纪要模块 | `docs/modules/05-会议纪要模块-PRD.md` | 待编写 |
| M6 周报模块 | `docs/modules/06-周报模块-PRD.md` | 待编写 |

---

> **PRD 版本**: v2.0 | **变更**: 从"P0/P1/P2 三级需求池"重构为"六大核心模块"最终定稿结构；Mantis 对接从 P2 提升至 P0(M3)；新增 M5 会议纪要、M6 周报模块。
