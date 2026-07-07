# M3 — 故障管理模块详细 PRD

> **关联顶层 PRD**: `docs/PRD.md` v2.0  
> **开发优先级**: ③  
> **依赖**: M1 项目进度模块；**外部系统**: Mantis Bug Tracker  
> **核心定位**: 对接拉取 Mantis 系统故障全量数据 + 本地缺陷登记 + DI 值自动计算输出至 M1 门禁判定

---

## 一、模块职责

双数据源融合：**Mantis 故障数据（拉取）** + **HPM 本地缺陷（录入）**。以项目/阶段维度统一展示全量故障，按曙光 DI 值公式自动计算阶段缺陷指数，为 M1 模块的门禁判定提供量化依据。

---

## 二、功能清单

### 2.1 Mantis 数据拉取

| 功能 | 描述 |
|------|------|
| **连接配置** | 配置 Mantis 服务器地址、API Token、项目映射关系（Mantis Project ID ↔ HPM Project ID） |
| **全量拉取** | 按 Mantis Project ID 拉取全量 Issue 列表（含编号/严重度/状态/标题/描述/创建时间/最后更新/处理人） |
| **增量同步** | 定时任务（可配置间隔，默认 30min）拉取近期更新的 Issue |
| **同步状态** | 每个 Issue 显示同步时间戳和同步状态（已同步/待同步/同步失败） |
| **手动触发** | 「立即同步」按钮，强制拉取最新数据 |

### 2.2 Mantis 数据映射

| Mantis 字段 | HPM 映射字段 |
|------------|-------------|
| Issue ID | mantis_id |
| Severity (block/crash/major/minor/feature/tweak/text/trivial) | severity (Critical/Major/Minor/Trivial) |
| Status (new/feedback/acknowledged/confirmed/assigned/resolved/closed) | status (新建/处理中/已解决/已关闭) |
| Summary | title |
| Description | description |
| Handler | assignee |
| Date Submitted | created_at |
| Last Updated | mantis_updated_at |

### 2.3 本地缺陷管理

| 功能 | 描述 |
|------|------|
| **本地创建缺陷** | 在 HPM 中直接登记缺陷——编号(自动生成 HPM-XXX)、标题(必填)、严重度(Critical/Major/Minor/Trivial)、描述、关联项目(必选)、关联阶段(可选)、关联需求(可选)、DI 权重 |
| **缺陷详情** | 查看/编辑 全部字段；显示同步状态标签（本地 / 已同步至 Mantis / 同步失败） |
| **状态流转** | 新建 → 处理中 → 已解决 → 已关闭；本地缺陷与 Mantis 缺陷共用同一状态机 |
| **推送到 Mantis** | 本地创建的缺陷可「推送至 Mantis」——调用 Mantis API 创建 Issue，成功后回填 mantis_id |

### 2.4 DI 值计算

| 功能 | 描述 |
|------|------|
| **DI 权重定义** | 按曙光标准：Critical=10, Major=3, Minor=1, Trivial=0.1（可配置） |
| **阶段 DI 统计** | 按项目→阶段维度统计未关闭缺陷的 DI 累计值 |
| **DI 趋势图** | 折线图展示 DI 值随时间变化（可对比 DI 阈值线），按周粒度 |
| **转段判定输出** | 输出 `current_di` 至 M1 的 `gates` 表——当项目经理触发门禁检查时，自动比对 current_di vs di_threshold |
| **DI 仪表板** | 项目级 DI 汇总——当前 DI 总值、按阶段分布、按严重度分布（饼图） |

### 2.5 缺陷列表与筛选

| 功能 | 描述 |
|------|------|
| **列表视图** | 表格：编号/严重度色标/标题/状态/阶段/来源(Mantis标签/本地标签)/创建时间 |
| **筛选** | 按项目/阶段/严重度/状态/来源/关键词搜索 |
| **排序** | 按创建时间/严重度/状态/DI 权重排序 |
| **缺陷看板** | 可选看板视图——按状态分列（新建/处理中/已解决/已关闭），拖拽流转（仅限本地缺陷） |

---

## 三、数据模型

### 3.1 `issues`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | — |
| project_id | INTEGER FK | 关联项目 |
| phase_id | INTEGER FK | 关联阶段（可选） |
| requirement_id | INTEGER FK | 关联需求（可选） |
| code | TEXT | 唯一编号（Mantis-xxxxx 或 HPM-xxx） |
| mantis_id | INTEGER | Mantis Issue ID（NULL=本地缺陷） |
| source | TEXT | mantis / local |
| title | TEXT | 标题 |
| description | TEXT | 描述 |
| severity | TEXT | Critical / Major / Minor / Trivial |
| status | TEXT | 新建/处理中/已解决/已关闭 |
| assignee | TEXT | 处理人 |
| di_weight | REAL | DI 权重值（按严重度映射） |
| mantis_updated_at | TEXT | Mantis 最后更新时间 |
| synced_at | TEXT | HPM 侧同步时间 |
| created_at | TEXT | — |
| updated_at | TEXT | — |

### 3.2 `mantis_connection`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | — |
| server_url | TEXT | Mantis 服务器地址 |
| api_token | TEXT | API Token（加密存储） |
| project_mapping | TEXT | JSON: {mantis_project_id → hpm_project_id} |
| sync_interval_min | INTEGER | 同步间隔，默认 30 |
| is_active | INTEGER | 0/1 |

---

## 四、接口

| Method | Path | 说明 |
|--------|------|------|
| GET | /api/issues | 缺陷列表（?project_id=&phase_id=&severity=&status=&source=&search=） |
| POST | /api/issues | 创建本地缺陷 |
| GET | /api/issues/:id | 缺陷详情 |
| PUT | /api/issues/:id | 更新缺陷 |
| POST | /api/issues/:id/push-to-mantis | 推送至 Mantis |
| GET | /api/issues/di-summary | DI 汇总（?project_id=&phase_id=） |
| POST | /api/mantis/sync | 手动触发全量同步 |
| GET | /api/mantis/sync-status | 查看最近同步状态（时间/数量/失败数） |
| GET | /api/mantis/connection | 查看 Mantis 连接配置 |
| PUT | /api/mantis/connection | 更新 Mantis 连接配置 |

---

## 五、架构注意事项

- **Adapter 模式**: `MantisAdapter` 封装所有 Mantis API 调用——`fetchIssues()`, `createIssue()`, `updateIssue()`，方便后续替换或扩展其他缺陷系统对接
- **同步频率控制**: 增量同步默认 30min，全量同步需手动触发（避免 API 限流）
- **冲突处理**: 本地编辑与 Mantis 侧更新冲突时，以 Mantis 侧为准（覆盖模式），本地变更记录到 conflict_log
- **DI 计算缓存**: 每 5min 重新计算一次阶段 DI，写入 gates.current_di
