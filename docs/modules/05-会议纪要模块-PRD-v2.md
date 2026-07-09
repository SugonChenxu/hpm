# M5 — 会议纪要模块 PRD（简化版 v2.0）

> **基于**: 顶层 PRD v2.0 + 旧版 M5 PRD（过于复杂）  
> **性质**: 极简化 MVP，聚焦「拉取腾讯会议 → 查看 AI 纪要」唯一核心链路  
> **技术**: tmeet CLI（child_process 调用）→ SQLite 存储 → 前端展示

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

| 功能 | 描述 |
|------|------|
| **手动拉取会议** | 前端点按钮 → 后端调 `tmeet meeting list-ended` → 去重入库 → 返回列表 |
| **会议列表展示** | 表格：会议标题、开始时间、时长、参会人数、会议号；按时间倒序；支持标题搜索 |
| **查看 AI 纪要** | 点击会议 → 调 `tmeet record smart-minutes` → 前端 Markdown 渲染展示 |
| **登录检查** | 调 tmeet 前检查 `tmeet auth status`，未登录提示用户 |

### P1（可做，第一版不做）

- 转写全文查看（折叠面板）
- 参会人详情弹出
- 手动关联项目

### P2（明确不做）

- ❌ 定时同步、决议追踪、手动创建会议、全时会议、纪要编辑、多平台配置

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
| `GET` | `/api/meetings` | 会议列表（`?search=`） |
| `POST` | `/api/meetings/fetch` | 触发拉取 tmeet CLI → 去重入库 |
| `GET` | `/api/meetings/:id/minutes` | 获取纪要（缓存优先） |

---

## 七、待确认问题

| # | 问题 |
|---|------|
| Q1 | `tmeet meeting list-ended` 输出格式？（JSON/文本） |
| Q2 | `tmeet record smart-minutes` 纪要格式？（Markdown/JSON） |
| Q3 | 拉取时间范围如何控制？默认返回最近多少条？ |
| Q4 | 纪要缓存策略：按需拉取还是拉列表时批量拉？ |
| Q5 | 路由：独立 `/meetings` 还是挂项目下 `/projects/:id/meetings`？ |
