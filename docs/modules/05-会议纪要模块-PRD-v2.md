# M5 — 会议纪要模块 PRD（简化版 v2.0）

> **基于**: 顶层 PRD v2.0 + 旧版 M5 PRD（过于复杂）  
> **性质**: 极简化 MVP，聚焦「拉取腾讯会议 → 查看 AI 纪要」唯一核心链路  
> **技术**: tmeet CLI（child_process 调用）→ SQLite 存储 → 前端展示  
> **实现状态**: ✅ 已落地（2026-07-20 校订：决议追踪与纪要编辑实际已实现，见下方「已实现功能」）

---

## 一、产品目标

一键从腾讯会议拉取历史会议列表，点击查看 AI 智能纪要。**不做同步、不做编辑、不做决议追踪**。

---

## 二、用户故事

| # | 故事 |
|---|------|
| **US1** | 开完一周的会后，一键看到这周开了哪些腾讯会议、每场会 AI 说了什么结论，不用去腾讯会议客户端一个个翻 |
| **US2** | 点击某场会议，直接看到 AI 智能纪要（摘要+待办提取），方便复制使用 |

---

## 三、功能需求

### P0（MVP 必做）

| 功能 | 描述 | 状态 |
|------|------|:--:|
| **手动拉取会议** | 前端点按钮 → 后端调 `tmeet meeting list-ended` → 去重入库 → 返回列表 | ✅ |
| **会议列表展示** | 表格：会议标题、开始时间、时长、参会人数、会议号；按时间倒序；支持标题搜索 | ✅ |
| **查看 AI 纪要** | 点击会议 → 调 `tmeet record smart-minutes` → 前端 Markdown 渲染展示（含摘要 + 待办提取） | ✅ |
| **登录检查** | 调 tmeet 前检查 `tmeet auth status`，未登录提示用户 | ✅ |

### 已实现功能（超出原 MVP 设计，代码已提供）

| 功能 | 描述 | 说明 |
|------|------|------|
| **决议追踪** | 会议详情可添加决议项（内容/负责人/截止日期/状态），支持「一键转为 M2 待办」 | 原 P2「明确不做」→ 实际已实现（`meeting_action_items` + `convert` 端点） |
| **纪要编辑** | 手动创建的会议可 `PUT` 更新纪要正文 / 状态 / 时间 | 原 P2「明确不做」→ 实际已实现（`PUT /api/meetings/:id`） |
| **手动登记会议** | 线下会议手工录入（标题/时间/平台=manual），独立于 tmeet 拉取 | `POST /api/meetings` |
| **全时会议（最小支持）** | 全时会议纪要通过 `minutes_url` 分享链接查看；无 API 拉取 | 仅链接跳转，未做 API 对接 |

### P1（可做，当前未实现）

- 转写全文查看（折叠面板）
- 参会人详情弹出
- 手动关联项目

### P2（明确未做）

- ❌ 定时自动同步（仅手动拉取）
- ❌ 全时会议 API 拉取 / 腾讯会议 OAuth 企业应用授权（当前走 tmeet CLI 本地凭证）
- ❌ 多平台配置管理 UI
- ❌ 会议纪要编辑器富文本 / 历史版本

---

## 四、UI 原型

```
┌─────────────────────────────────────────────────────────┐
│  会议纪要                                    [🔄 拉取会议] │
├─────────────────────────────────────────────────────────┤
│  🔍 搜索会议标题...                                      │
├─────────────────────────────────────────────────────────┤
│  会议标题          │ 开始时间    │ 时长  │ 参会人 │ 会议号 │
│  ─────────────────────────────────────────────────────── │
│  曙光硬件周会       │ 07-07 14:00 │ 45min │ 8人    │ 123… │
│  M3 设计评审会      │ 07-07 10:00 │ 60min │ 12人   │ 456… │
├─────────────────────────────────────────────────────────┤
│                                         点击 → Drawer   │
│  ┌─────────── AI 智能纪要 ────────────── [📋 一键复制] ┐ │
│  │  摘要：本次会议讨论了M3阶段设计评审...                │ │
│  │  待办事项：                                         │ │
│  │  1. @张三 需在周五前完成PCB布局修改                   │ │
│  │  2. @李四 补充热仿真报告                             │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

详细线框图见下方 Mermaid 图。

---

## 五、数据模型（MVP 最小集）

### meetings 表（已有，仅使用部分字段）

`external_id` 作为去重键，`platform` 固定为 `"tencent"`

### smart_minutes 表（新增）

```sql
CREATE TABLE IF NOT EXISTS smart_minutes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE UNIQUE,
    record_file_id TEXT,
    content TEXT,          -- AI 纪要全文（Markdown）
    summary TEXT,          -- 摘要
    action_items_json TEXT,-- AI 提取的待办 JSON
    fetched_at TEXT DEFAULT (datetime('now','localtime')),
    created_at TEXT DEFAULT (datetime('now','localtime'))
);
```

---

## 六、API（3 个接口）

| Method | Path | 说明 |
|--------|------|------|
| `GET` | `/api/meetings` | 会议列表（`?project_id=&platform=&from=&to=&search=`） |
| `POST` | `/api/meetings` | 手动登记会议（platform 默认 manual） |
| `GET` | `/api/meetings/:id` | 单条会议详情（含决议项 action_items） |
| `PUT` | `/api/meetings/:id` | 更新会议（纪要正文 / 状态 / 时间 / minutes_url） |
| `POST` | `/api/meetings/fetch` | 触发拉取 tmeet CLI（腾讯会议）→ 去重入库 |
| `GET` | `/api/meetings/:id/minutes` | 获取 AI 智能纪要（缓存优先；全时会议返回链接） |
| `POST` | `/api/meetings/:id/action-items` | 添加决议项 |
| `PUT` | `/api/meetings/:id/action-items/:aid` | 更新决议项（含完成态） |
| `POST` | `/api/meetings/:id/action-items/:aid/convert` | 决议项一键转为 M2 待办 |
| `GET` / `PUT` | `/api/meeting-config` | 查看 / 更新会议平台配置（预留，当前 tmeet 走本地凭证） |

---

## 七、待确认问题

| # | 问题 |
|---|------|
| Q1 | `tmeet meeting list-ended` 输出格式？（JSON/文本） |
| Q2 | `tmeet record smart-minutes` 纪要格式？（Markdown/JSON） |
| Q3 | 拉取时间范围如何控制？默认返回最近多少条？ |
| Q4 | 纪要缓存策略：按需拉取还是拉列表时批量拉？ |
| Q5 | 路由：独立 `/meetings` 还是挂项目下 `/projects/:id/meetings`？ |
