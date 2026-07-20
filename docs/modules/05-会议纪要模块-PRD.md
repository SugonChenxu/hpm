# M5 — 会议纪要模块详细 PRD（⚠️ 已废弃）

> **⚠️ 废弃声明（2026-07-20）**：本文件为初版设计（基于腾讯会议/全时会议 REST API + OAuth 授权 + 定时同步 + 参会人管理 + 决议追踪的完整方案）。**现行实现已改为极简 tmeet CLI 版**，以 `docs/modules/05-会议纪要模块-PRD-v2.md` 为准，顶层 PRD「六、索引」也已改指向 v2。本文件仅作历史设计存档，请勿据此开发。

---

> **关联顶层 PRD**: `docs/PRD.md` v2.0  
> **开发优先级**: ⑤  
> **依赖**: M1 项目进度模块；**外部系统**: 腾讯会议 API + 全时会议 API

---

## 一、模块职责

**对接拉取腾讯会议、全时会议会议数据**，为每个项目建立会议台账——会议列表、参会人、纪要与决议追踪。支持手动创建会议记录（无系统来源的线下会议）。

三重数据来源：
1. **腾讯会议 API 拉取**：通过企业授权拉取已结束会议的录制/转写/参会人
2. **全时会议 API 拉取**：同上
3. **手动创建**：线下会议/其他平台会议

---

## 二、功能清单

### 2.1 会议数据拉取

| 功能 | 描述 |
|------|------|
| **平台配置** | 分别配置腾讯会议和全时会议的 API 凭证（AppId/Secret/企业ID）和授权 |
| **会议列表拉取** | 按时间范围拉取指定账号下的会议记录列表——会议主题、开始时间、结束时间、参会人数、会议号 |
| **会议详情拉取** | 拉取单场会议的转写文本（如有）、录制文件链接、参会人明细（姓名/邮箱/入会/离会时间） |
| **项目关联建议** | 根据会议标题关键词匹配已有项目代号，自动建议关联；用户手动确认或修改 |
| **定时同步** | 每日定时拉取新增会议（默认每天凌晨 2:00），也可手动触发「立即同步」 |

### 2.2 会议台账

| 功能 | 描述 |
|------|------|
| **会议列表** | 表格视图——会议标题/平台标签(腾讯/全时/手动)/时间/时长/参会人数/关联项目/纪要状态 |
| **筛选** | 按项目、平台、时间范围、纪要状态（待编写/已编写）筛选 |
| **搜索** | 按会议标题、参会人姓名搜索 |

### 2.3 会议纪要编辑

| 功能 | 描述 |
|------|------|
| **纪要编辑器** | Markdown 编辑器——上半部分自动填入会议基本信息(标题/时间/参会人来自 API 数据)，下半部分自由编辑纪要正文 |
| **AI 摘要（未来能力）** | 基于会议转写文本自动生成会议摘要草案——当期不做，预留接口 |
| **手动创建会议** | 线下会议手工录入：标题、时间、参会人、平台=手动 |
| **会议转写查看** | 如果有 API 拉取的转写文本，以可折叠区域展示在纪要编辑区下方 |

### 2.4 决议追踪

| 功能 | 描述 |
|------|------|
| **添加决议项** | 在纪要中标记「决议/待办」(action item)：内容(必填)、负责人(必填)、截止日期 |
| **决议列表** | 会议室详情页底部列出所有决议项，每项显示内容/负责人/截止日期/状态(待处理/已完成) |
| **自动生成待办** | 「一键转为待办」——将决议项自动创建为 M2 模块的 task，并关联当前项目/阶段 |
| **完成标记** | 勾选完成，记录完成时间 |

### 2.5 参会人管理

| 功能 | 描述 |
|------|------|
| **参会人列表** | 自动从 API 数据提取参会人信息——姓名/邮箱/入会时间/离会时间/参会时长 |
| **角色标注** | 手工标注参会人角色（主持人/记录人/参会人） |
| **出勤统计** | 按项目统计各成员参会次数/总时长 |

---

## 三、数据模型

### 3.1 `meetings`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | — |
| project_id | INTEGER FK | 关联项目 |
| phase_id | INTEGER FK | 关联阶段（可选） |
| platform | TEXT | tencent / quanshi / manual |
| external_id | TEXT | 外部系统会议 ID |
| meeting_code | TEXT | 会议号（如腾讯会议号 123-456-789） |
| title | TEXT | 会议标题 |
| start_time | TEXT | 开始时间 ISO8601 |
| end_time | TEXT | 结束时间 ISO8601 |
| duration_minutes | INTEGER | 时长（分钟） |
| attendee_count | INTEGER | 参会人数 |
| attendees_json | TEXT | JSON：[{name,email,join_time,leave_time,role}] |
| transcript_text | TEXT | 转写全文（来自 API） |
| recording_url | TEXT | 录制文件链接 |
| minutes_text | TEXT | 纪要正文（Markdown） |
| minutes_status | TEXT | 待编写/已编写 |
| created_at | TEXT | — |
| updated_at | TEXT | — |

### 3.2 `meeting_action_items`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | — |
| meeting_id | INTEGER FK | 关联会议 |
| content | TEXT | 决议内容 |
| assignee | TEXT | 负责人 |
| due_date | TEXT | 截止日期 |
| status | TEXT | 待处理/已完成 |
| linked_task_id | INTEGER | 关联的 M2 task ID（通过「一键转为待办」生成） |
| completed_at | TEXT | 完成时间 |

### 3.3 `meeting_platform_config`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | — |
| platform | TEXT | tencent / quanshi |
| app_id | TEXT | AppId |
| secret | TEXT | Secret（加密存储） |
| enterprise_id | TEXT | 企业 ID |
| is_active | INTEGER | 0/1 |

---

## 四、接口

| Method | Path | 说明 |
|--------|------|------|
| GET | /api/meetings | 会议列表（?project_id=&platform=&status=&from=&to=） |
| POST | /api/meetings | 手动创建会议 |
| GET | /api/meetings/:id | 会议详情（含决议项） |
| PUT | /api/meetings/:id | 更新纪要/基本字段 |
| POST | /api/meetings/sync | 手动触发平台同步 |
| GET | /api/meetings/sync-status | 同步状态查询 |
| POST | /api/meetings/:id/action-items | 添加决议项 |
| PUT | /api/meetings/:id/action-items/:itemId | 更新决议项 |
| POST | /api/meetings/:id/action-items/:itemId/convert-to-task | 决议项转 M2 待办 |
| GET | /api/meeting-config | 查看平台配置 |
| PUT | /api/meeting-config | 更新平台配置 |

---

## 五、架构注意事项

- **Adapter 模式**: `TencentMeetingAdapter` + `QuanshiMeetingAdapter` 各自封装 API 调用。公共接口 `MeetingPlatformAdapter { fetchMeetings(), fetchDetail() }` 解耦平台差异
- **API 授权**: 腾讯会议通过企业自建应用 OAuth 授权；全时会议通过 API Key 方式。凭证加密存储于 `meeting_platform_config`
- **转写存储**: 转写文本可能较大——存储于 SQLite 时需注意单字段大小限制（默认 1GB，远超实际需求）
- **增量同步**: 每次同步仅拉取上次同步时间之后的新会议，避免全量重复
