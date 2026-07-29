# M9 — 库存管理模块详细 PRD

> **关联顶层 PRD**: `docs/PRD.md` v2.0  
> **开发优先级**: ⑨（M1 项目进度模块之后可并行）  
> **依赖**: M1 项目进度模块（库存按 Forge 项目隔离）、用户认证（多用户 owner_id 隔离）  
> **实现状态**: ✅ 已完成（2026-07-24，提交 `7879242`）

---

## 一、模块核心定位

打通曙光 **PLM（3DEXPERIENCE / ENOVIA）研发库房** 与 Forge 的库存数据链路，让硬件项目经理在 Forge 内一键查看 **「对应项目 + 对应库存」** 的物料库存明细，无需登录 PLM 或手动导出。

- 数据源：PLM 研发库房库存接口 `sgDevelopmentWarehouse.jsp`（PLM 内网，需用户 Cookie 鉴权）；
- 数据形态：只读拉取 + 本地缓存（单向同步，PLM 为唯一权威源，Forge 不回写 PLM）；
- 隔离模型：沿用全局多用户规范，**每用户独立配置 Cookie 与项目关联**，库存数据按 `owner_id + project_id` 严格隔离。

---

## 二、与 PLM 的对接方式（技术背景）

PLM 无公开 API Token，采用 **浏览器 Cookie 代理** 模式（与 M3 故障管理对接 Mantis 同范式）：

| 项 | 说明 |
|---|---|
| 认证机制 | 曙光 CAS SSO，登录后下发 `JSESSIONID` + `afs` 两个 Cookie |
| 鉴权方式 | 每个 HTTP 请求携带完整 Cookie；并附加 CSRF 双重头（见下） |
| CSRF 头 | 先从 `emxUIConstantsJavaScriptInclude.jsp` 提取 `CSRF_TOKEN_NAME`/`CSRF_TOKEN_VALUE`；请求头发 `csrfTokenName: ENO_CSRF_TOKEN` + `ENO_CSRF_TOKEN: <值>` |
| 项目列表 | `emxIndentedTable.jsp`（取 `timeStamp`）→ `emxFreezePaneGetData.jsp`（POST，返回 XML 表格）→ 解析出 `{oid, code, name}` |
| 库存明细 | `SugonCentral/tableUI/tablefilter/sgDevelopmentWarehouse.jsp?objectId=<项目OID>&treeLabel=<仓库>`（返回 HTML 内含 `var str = '[{...}]'` JSON） |
| 超时/重试 | axios 30s 超时；内网自签证书跳过 TLS 校验（`rejectUnauthorized:false`） |

> Cookie 含 `httpOnly` 字段，JS 无法读取，必须由用户在浏览器 DevTools → Network 中手动复制整段 Cookie 字符串粘贴到 Forge。Cookie 退出登录或隔天后失效，届时重新获取即可。

---

## 三、用户操作流程（权威交互）

1. **设置 Cookie**：库存管理页右上角「⚙ PLM 设置」→ 粘贴 PLM Cookie（含 JSESSIONID 与 afs）→ 保存连接；
2. **自动拉项目 + 自动关联**：保存后后端自动拉取 PLM 项目列表，按 **Forge 项目名 ↔ PLM 项目代号/名称模糊匹配**，写入关联（OID + 名称 + 代号）；
3. **手动关联/改关联**：在设置卡片的项目关联区，每 Forge 项目下拉选择对应 PLM 项目（含「不关联」选项），可覆盖自动匹配；
4. **选 Forge 项目看库存**：主页顶部「项目」下拉 → 自动读取该项目已同步的库存；若已关联则显示 PLM 项目代号/名称 Chip，并提供「同步库存」按钮；
5. **同步库存**：点「同步库存」→ 后端按关联 OID 拉取 PLM 研发库房库存（仓库 `tree_label` 不强制：先无参请求，空则自动回退默认仓库「青海」），写入本地并刷新表格；
6. **浏览/搜索/排序**：表格展示序号、物料号、物料组、物料描述、库存数量、参考单价；支持关键字模糊搜索与列头点击升降序。

---

## 四、连接配置（PLM 设置卡片）

1. **字段**：
   - PLM 服务器地址（默认 `https://plm.sugon.com/3dspace`）；
   - Cookie（密文输入框，可「显示/隐藏」切换；必填，否则禁止保存）；
   - 项目关联区（按 Forge 项目逐行，下拉选 PLM 项目）；
2. **获取指引**：内置「？获取方法」弹窗，说明 DevTools 复制 Cookie 步骤 + httpOnly 风险提示 + 过期提示；
3. **保存**：写回 `plm_connection`（`server_url` + `cookie` + `project_links` JSON 数组）；`project_links` 按 `forge_id` 去重合并，新覆盖旧，不破坏其他项目的关联；
4. **每用户独立**：配置与关联均绑定 `owner_id`，A 用户看不到 B 用户的 Cookie 与项目映射。

---

## 五、项目关联规则

| 场景 | 行为 |
|---|---|
| 已有手动关联 | 直接采用，标记 `auto:false` |
| 无关联 | `GET /plm/link` 触发自动匹配：按名称双向包含匹配，命中即写回并标记 `auto:true` |
| 自动未命中 | 返回 `linked:false, reason:no_match`，前端提示「未关联，请到设置关联」 |
| 手动改关联 | 仅更新该项目，合并不覆盖其他项目 |
| 仓库探测 | 同步时不强制 `tree_label`，先无参拉取，空则回退「青海」并写回 |

---

## 六、库存同步（后端）

1. 端点 `POST /api/plm/sync`，入参 `{ project_id }`（`tree_label`/`lgort` 为可选，不强求）；
2. 校验 `project_id` 归属（防越权）；
3. 解析 OID：优先用已存关联 `plm_oid`，否则自动解析并写回；
4. 调用 `PLMAdapter.fetchWarehouse(oid, treeLabel)` 拉取库存 JSON 数组；
5. **Upsert** 写入 `plm_inventory`，唯一键 `(owner_id, project_id, matnr, lgort)`：已存在的同物料同库位更新字段，不存在则新增，实现增量同步；
6. 同步结果回写 `plm_connection.last_sync_at` / `last_sync_status`（success / 错误码）；
7. 返回 `{ synced_count, total_rows }`。

---

## 七、库存明细展示（主页表格）

### 列定义（从左到右）

| 列 | 字段 | 说明 |
|---|---|---|
| 序号 | — | 行序（从 1 自增，不持久化） |
| 物料号 | `matnr` | **纯数字物料号自动去除前导 0 填充**（如 `00000000000300234` → `300234`）；非纯数字保留原样 |
| 物料组 | `wgbez` | 物料组描述（附 `matkl` 代码用于搜索） |
| 物料描述 | `maktx` | 单行截断 + 省略号 |
| 库存数量 | `labst` | 千分位格式化，右对齐 |
| 参考单价 | `stprs` | `¥` + 两位小数，右对齐 |

> 不展示：总件数、总金额、工厂（werks）、库位号（lgort）等明细列（按用户精简要求）。

### 搜索与排序

1. 搜索框实时模糊过滤，范围：物料号 / 物料描述 / 物料组（含 `matkl`）；
2. 五列均可点击列头升降序（`TableSortLabel` 箭头指示），点击切换方向；
3. 空数据友好提示：「暂无库存数据，请先关联项目并点同步库存」/「无匹配结果」。

---

## 八、权限与数据隔离

1. 全部接口在 Express 中间件读取 `req.userId`（登录态）；
2. `plm_connection`、`plm_inventory` 均含 `owner_id` 列，已纳入全局 `OWNER_TABLES` 启动 ALTER 清单；
3. 所有读写（连接、项目列表、关联、同步、库存查询）均带 `owner_id` 过滤或归属校验，确保 **用户仅能看/改自己的数据与关联**；
4. 项目归属校验：访问 `project_id` 前先查 `projects WHERE id=? AND owner_id=?`，越权返回 403。

---

## 九、后端 API 端点

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/plm/connection` | 读取当前用户 PLM 连接配置 |
| PUT | `/api/plm/connection` | 更新配置（server_url + cookie + project_links，合并去重） |
| GET | `/api/plm/projects` | 拉取 PLM 项目列表（鉴权失败返回 `needsConfig:true`） |
| GET | `/api/plm/link?project_id=` | 读取/自动关联某 Forge 项目 |
| POST | `/api/plm/sync` | 同步某项目库存到本地（自动探测仓库） |
| GET | `/api/plm/inventory?project_id=&lgort=` | 读取本地库存（可按库位过滤，返回行 + 总库存 + 总价值） |

错误码映射（`plm-resolve.plmError`）：`auth_failed→401`、`no_match→422`、`forbidden→403`、`timeout→504`、`network→502`、`plm_error→502`。

---

## 十、前端组件结构

| 文件 | 职责 |
|---|---|
| `client/src/pages/InventoryPage.jsx` | 库存主页：项目选择 + 关联状态 + 同步 + 搜索 + 排序表格 |
| `client/src/components/inventory/PLMConnectionCard.jsx` | PLM 设置卡片：Cookie 录入 + 项目关联 + 获取指引 |
| `client/src/api/client.js`（`api.plm`） | 6 个端点封装 |
| `client/src/components/layout/Sidebar.jsx` | 导航「库存管理」（`/inventory`，内联仓库图标） |
| `client/src/App.jsx` | `/inventory` 路由注册 |

---

## 十一、数据库表结构

```sql
-- 每用户 PLM 连接配置（含项目关联映射）
CREATE TABLE plm_connection (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL DEFAULT 0,
    server_url TEXT DEFAULT 'https://plm.sugon.com/3dspace',
    cookie TEXT DEFAULT '',
    project_links TEXT DEFAULT '[]',   -- JSON 数组：[{forge_id, forge_name, plm_oid, plm_code, plm_name}]
    last_sync_at TEXT,
    last_sync_status TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 从 PLM 研发库房拉取的库存明细（按 owner + 项目 + 物料 + 库位隔离）
CREATE TABLE plm_inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL DEFAULT 0,
    project_id INTEGER NOT NULL,
    matnr TEXT DEFAULT '',        -- 物料号
    maktx TEXT DEFAULT '',        -- 物料描述
    labst INTEGER DEFAULT 0,      -- 非限制使用库存（件）
    werks TEXT DEFAULT '',        -- 工厂
    lgort TEXT DEFAULT '',        -- 库存地点（库位号）
    lgobe TEXT DEFAULT '',        -- 库存地点描述
    stprs REAL DEFAULT 0,         -- 研发参考单价（元）
    matkl TEXT DEFAULT '',        -- 物料组代码
    wgbez TEXT DEFAULT '',        -- 物料组描述
    synced_at TEXT,
    UNIQUE(owner_id, project_id, matnr, lgort)
);
```

---

## 十二、全局开发约束

1. 沿用 Vite 8 兼容规范：禁用 `@mui/icons-material`（已用内联 Unicode/自定义图标替代）；
2. 所有网络异常统一映射为中文错误提示，前端友好展示；
3. 同步为幂等 upsert，重复同步不重复插入、不丢数据；
4. 数据修改/同步均做归属校验，杜绝越权访问；
5. 前后端分离：前端 `dev` 走 Vite 5173，生产由 PM2 `forge` 单进程托管静态产物于 `http://localhost:3000`。

---

## 十三、已知边界与后续可扩展

1. **Cookie 需人工维护**：无 SSO/Token，过期后需重新复制；后续可考虑 SNC/OAuth 自动续期（依赖 PLM 侧能力）；
2. **仓库选择收窄**：当前 UI 已精简去仓库字段，同步默认自动探测「青海」仓库；如需多仓库并存，可恢复 `tree_label` 手动选择；
3. **单向只读**：Forge 不回写 PLM，无法在 Forge 直接改 PLM 库存；
4. **可扩展方向**：库存与 M4 物料管理联动（按物料号匹配，呈现「系统库存 vs 需求/采购」差异）、库存变更订阅（PLM 侧 Webhook，若开放）。
