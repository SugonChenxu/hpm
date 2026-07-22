# CHANGELOG

> 每次代码迭代的变更记录，字段：修改模块 / 新增功能 / 缺陷修复 / 接口调整 / 参数变动。

## 2026-07-22 — M1 项目概览故障概览实时化（统一源 + 刷新）

- **缺陷修复（两套 DI 分歧）**：原「项目概览」卡片的 DI / 故障数 / 解决率 / 分类饼图**绕过本地库、直读 Mantis 实时接口**（`fetchSummary` 取 Mantis「Defect Index」趋势末点），与 M3 故障管理（读本地 `issues` 表 `SUM(di_weight)`）使用两套数据源，导致"M3 改了 DI、概览不跟随"且两端数字对不上。
- **重构数据源（统一源 D）**：`GET /api/projects/:id/faults` 改为**头条 DI / 故障数 / 解决率 / 未解决分类**全部从本地 `issues` 表聚合（与 M3 `di-summary` 同口径：`di=SUM(di_weight) WHERE status NOT IN('已关闭')`、`total=COUNT`、`resolved=status='已解决'`、`rate=比例`；分类按 `category` 以 `/` 拆分统计未解决），彻底消除两套 DI 分歧。DI 趋势图仍走 Mantis 时序接口（与 M3 趋势同源，无"两套趋势"问题）。
- **缺陷修复（300s 缓存致滞后）**：原接口把整个故障概览写入 `sync_cache`（`dashboard_faults`，TTL 300s），缓存期内直接返回旧值、不重算。现**移除该整包缓存**，头条指标每次实时计算；仅 Mantis DI 趋势保留短缓存（`dashboard_trend`，TTL 300s），未关联 Mantis 时仍返回本地 DI。
- **新增功能（同步即失效 A）**：`POST /api/mantis/sync` 成功 upsert 后，按 Mantis hex id 删除 `dashboard_trend` 趋势缓存（原清理只按 Forge id，清不到以 hex id 为键的趋势缓存），使概览下次请求立即重算趋势。
- **新增功能（仪表板刷新 B）**：项目概览页新增「刷新故障概览」按钮 + 每 60s 定时刷新（仅重拉 faults，不重载整页），并显示"故障概览更新于 HH:MM:SS"。`ProjectCard` 改为只要 `summary` 存在即渲染故障概览块（未关联 Mantis 时也展示本地缺陷，仅趋势图不可用）。

## 2026-07-22 — M1 模板导入（Forge 导出 Excel 反灌）

- **新增功能（模板导入按钮）**：排期页工具栏新增独立的「模板导入」按钮（区别于「导入 Excel」），仅识别 Forge 导出的带公式 Excel，实现"导出 → Excel 编辑 → 回灌"闭环。非 Forge 模板会被拒绝并提示改用「导入 Excel」。
- **新增功能（替换式反灌）**：`POST /api/projects/:id/schedule/import-template` 先清空该项目当前排期、再整体写入解析结果（覆盖语义），导入前弹确认框防误操。
- **导出格式调整（支撑反灌）**：导出表头新增「任务类型」列（阶段任务 / 普通任务 / 节点任务），使反灌能精确还原层级与里程碑；完成情况列保留仅作 Excel 内参考（Forge 按日期自动推导，反灌时忽略）。
- **解析逻辑（server/client 同步）**：`scheduleMapping.js` 新增 `detectForgeTemplate(headers, sampleNames)` 与 `mapForgeTemplate(matrix)`：
  - 剥离导出时写入的「└ 」前缀与前导空格，还原干净任务名与缩进层级（depth）。
  - 依据「任务类型」列（缺失时按层级推断父子）精确标记阶段/节点。
  - 读取公式缓存值（SheetJS `raw:true` 返回日期序列号或 Date），跨时区稳定；日期经 `deriveDates` 与后端规则一致地互推。
  - 前置任务以名称呈现、由 `insertScheduleTasks` 按名解析为 ID（与导出时写名称一致）。
- **导出幂等修复**：导出时先剥离名字中已存在的「└ 」/前导空格再加规范前缀，避免历史带前缀数据（如项目 9）重复导出时前缀累积。
- **验证**：用真实库内两类项目回放——① 扁平带前缀项目（48 任务）② 多级树项目（46 任务 / 最大深度 3），导出→SheetJS 解析→`mapForgeTemplate` 还原，名称/类型/层级/日期/工期/依赖全部一致，导出幂等。
- **前端**：`scheduleExcel.js` 支持 `mode` 参数（excel/forge-template）；`api.schedule.importTemplate` 新增；SchedulePage 增加模板导入按钮、确认弹窗与独立隐藏文件输入。

## 2026-07-22 — M1 导出增强：Excel 内日期联动公式（完成/开始时间自动计算）

- **新增功能（完成时间公式）**：导出的排期表「完成时间」列写入公式 `=开始单元格+工期单元格-1`。工期按"含首尾的日历天数"计（与 Forge 后端 `addDays(start, dur-1)` 规则一致），故完成 = 开始 + 工期 − 1；编辑工期即可自动重算完成时间。
- **新增功能（依赖驱动的开始时间公式）**：存在前置依赖的叶子任务，「开始时间」写入 `=MAX(各前置任务完成时间单元格)+1`——多重依赖时取所有前置中最晚结束项的次日开始（与后端 `级联传播` 规则一致）。编辑任一前置的完成时间，后置任务的开始/完成时间自动联动重算。
- **新增功能（阶段任务汇总公式）**：阶段任务（汇总行）的开始/完成时间分别写入 `=MIN(其全部叶子子孙的开始单元格)` / `=MAX(其全部叶子子孙的完成单元格)`，递归穿透子阶段，使汇总行随叶子任务变化自动更新。
- **实现细节**：
  - 所有日期以真实 Excel 日期序列号（1900 日期系统）写入，并设置 `numFmt=yyyy-mm-dd`，确保公式可正确做日期算术、显示正常。
  - 公式单元格同时写入缓存结果（取自当前库内已算好的日期），并设置 `workbook.calcProperties.fullCalcOnLoad=true`，用 Excel/WPS 打开即整表重算，所见即最新联动值。
  - 工程化重构：导出逻辑独立为 `server/src/utils/scheduleExport.js` 的 `buildScheduleWorkbook(tasks, project)`，路由 `GET /api/projects/:id/schedule/export` 改为调用该工具，便于单测与复用。
- **验证**：以真实库内 48 任务项目回读校验——38 条叶子完成公式、36 条依赖开始公式、10 条阶段汇总公式全部命中，日期序列号无时区漂移。
- **前端**：导出 snackbar 提示文案改为"已导出 Excel（开始/完成时间已写入联动公式）"。

## 2026-07-22 — M1 精简：移除腾讯文档导入功能

- **移除功能**：删除前端"腾讯文档导入"按钮及相关 UI（Dialog、handleTencentImport、CloudIcon、tencentUrl/tencentError state）。
- **接口清理**：删除后端 `POST /api/projects/:id/schedule/import-from-url` 端点及 `cellValueToStr` 辅助函数；前端 API client 同步移除 `importFromUrl`。
- **原因**：腾讯文档浏览页链接返回 HTML 而非 Excel，内部 protobuf 格式逆向成本高（行列映射未攻克），下载链接实际就是 xlsx 直链，与"导入 Excel"走同一套逻辑——保留半残功能反而困惑用户。
- **保留**：`import ExcelJS` 静态导入移除（仅用于已删的 `cellValueToStr`），导出端点仍使用动态 import。

## 2026-07-21（补4）— M1 导入兼容：任务列含日期序列号时的自动列偏移修正

- **缺陷背景**：部分 Excel 模板（如勒拿河 T610H59L 开发计划）表头虽含「任务」列，但数据行中该列的实际值为 Excel 序列号（开始日期），任务名称实际写在「小阶段」列中——导致映射后任务名变成数字、日期列整体左移串行。
- **缺陷修复**：
  - 多分组模式下检测「任务」列值：若为纯数字且 >20000（判断为日期序列号），标记 `colShifted` 并回退任务名到最后一个分组列的值（如「小阶段」）。
  - 列偏移时同步调整日期/工期读取：`planned_start` 从原 name 列取、`planned_end` 从原 start 列取、`duration_days` 从原 end 列取。
- **验证**：勒拿河文件 13 行数据 → 28 条任务，所有任务名正确、日期对齐、工期准确。马泉河等正常文件不受影响（colShifted 不触发）。
- **同步**：server + client `scheduleMapping.js` 完全一致。

## 2026-07-21（补3）— M1 导入增强：表头行自动检索 + 多格式日期解析

- **新增功能（表头自动检索）**：`findHeaderRow()` 扫描矩阵前 15 行，按表头关键字（任务/开始/完成/工期/类型/备注…）打分，自动定位最可能为表头的行。不再假设表头固定为首行——兼容标题行、空行、元数据行在表头上方的各种 Excel 模板。
  - 核心词（任务/开始/完成）额外加 0.5 分；得分 ≥2 认为可靠，<2 给出置信度警告。
  - `mapScheduleMatrix` 从检测到的表头行取列名、从下一行开始解析数据。年推断循环同步适配。
- **缺陷修复（日期格式乱序）**：`toDateStr` 增强为支持 6 种日期格式：
  - `YYYY/MM/DD` / `YYYY-MM-DD`（原有）
  - `YYYY年MM月DD日`（新增，常见中文模板）
  - `MM/DD/YYYY` / `DD/MM/YYYY`（新增，英文 Excel 常见；>12 的数为日进行推断）
  - Excel 序列号（原有，改用 UTC 方法避免时区偏移 ±1 天）
  - Date 对象（强化：优先 UTC；异常时回退本地方法）
  - 纯数字串（>20000 视为 Excel 序列号兜底）
- **前端 xlsx 解析**：`scheduleExcel.js` 改为 `raw: true`（返回原始值），日期以序列号形式进入 `toDateStr`，彻底避免 Excel 本地化格式导致的年月日错序。
- **同步**：server + client `scheduleMapping.js` 保持完全一致。

## 2026-07-21 — M1 导入缺陷修复：腾讯文档浏览链接拦截 + 多级分组（大阶段/小阶段/任务）+ 中文无年日期推断

- **缺陷背景**：用户粘贴腾讯文档「浏览页链接」（`docs.qq.com/sheet/...`）导入失败。根因有二：① 浏览链接 `fetch` 返回的是 68KB 网页 HTML（非 Excel），后端按 xlsx 解析必崩；② 用户文档为「大阶段/小阶段/任务」三级结构 + 中文「X月X日」无年日期，旧映射器只支持单阶段列 + 不认无年日期。
- **缺陷修复（浏览链接拦截）**：`POST /api/projects/:id/schedule/import-from-url` 新增内容类型校验——`fetch` 后读 `content-type` 并查响应体前 4 字节是否为 `PK\x03\x04`（xlsx zip 签名）；若命中文档浏览页（host 含 `docs.qq.com|doc.weixin.qq.com` 且非 Excel），返回 `400` 并给出清晰可执行指引（而非崩溃）：A. 下载为本地 Excel 用「导入 Excel」；B. 开启「允许下载」后复制下载链接粘贴到此。其它非 Excel 来源同样返回 400 说明。
- **新增功能（多级分组识别）**：`mapScheduleMatrix` / `buildFieldMap` 新增 `groupCols` 识别（命中 `大阶段/中阶段/小阶段/阶段/分组/group/phase/stage`），当分组列 ≥2 时进入「多级分组模式」——按 `lastGroups[]` 跟踪各级当前值，空白单元格默认沿用上一级（合并单元格/续行写法），仅当更高级本行变化时重置；为每级非空值合成「阶段任务」父节点，叶子任务 `indent = 最高组级别 + 1`，后端 `insertScheduleTasks` 用 indent 栈还原 `parent_id`。
- **新增功能（中文无年日期推断）**：`toDateStr` 新增 `X月X日 / X月X号` 正则；`mapScheduleMatrix` 收集所有仅月日单元格后按「首个日期月为起点月」推断年份（≥起点月→Y0，<起点月→Y0+1），跨年边界（如 12月→次年1月）正确切换，避免并行子阶段年份累加。
- **缺陷修复（阶段聚合错配）**：修正多分组在「顶级阶段切换 + 低级阶段空白续行」时父节点归属错误（如某节点被误挂为顶层、或 DVT 节点误入详设子树导致大阶段聚合终点算成 DVT 的 2026-07-21）。现 `详设` 仅聚合自身后代，终点 = 2026-04-09（含 PCBA生产+运输），`DVT` = 2026-04-21~2026-08-04，互不污染。
- **前端（导入对话框）**：`SchedulePage.jsx` 腾讯文档导入错误由 snackbar 改为对话框内联 `Alert` 展示；提示文案强调「粘贴下载链接（不是浏览页链接）」并给出两种获取方式；取消时清空错误态。
- **验证**：用用户真实文档《马泉河 R6257H0（双路机架）开发计划》（56 行、9 个大/小阶段）端到端校验——全部 56 条任务映射正确、0 未匹配表头、各阶段聚合时间与文档一致；临时 debug 日志与验证脚本已清理。

## 2026-07-21（补2）— M1 聚合缺陷修复：阶段任务自身 fallback 日期污染子孙聚合

- **缺陷背景**：导入阶段任务时 `insertScheduleTasks` 对 `null` 日期的兜底逻辑会将其设为当日（如 2026-07-21），而 `collectDescendantDates` 在递归时**先取子阶段自身日期、再比较孙子聚合**——子阶段的 fallback 今日日期（如 07-21）会覆盖孙子辈正确的聚合日期（如 04-09），导致大阶段终点错算。
- **缺陷修复**：`collectDescendantDates` 新增 `task_type !== "阶段任务"` 守卫——阶段任务的自身日期不纳入极值比较，**仅**从子孙聚合得出。
- **影响范围**：所有 GET 阶段聚合均受益（之前任何子阶段日期为 null 的场景都会触发此 bug，只是多数情况下子阶段有后代日期所以未暴露）。
- **验证**：项目 7（马泉河）真实数据导入 56 条，各阶段聚合全部正确——`详设` 2025-12-23~2026-04-09、`DVT` 2026-04-21~2026-08-04、`批量` 2026-08-05~2026-09-18、`发布` 2026-09-19~2026-09-26。

## 2026-07-21 — M1 项目计划：批量导入（本地 Excel / 腾讯文档）+ 一键清空；删除 PLM 功能

- **新增功能（导入）**：项目计划页工具栏新增「导入 Excel」「腾讯文档导入」入口。
  - 本地导入：前端 `xlsx` 解析 `.xlsx/.xls` → `mapScheduleMatrix` 模糊识别表头（任务/类型/开始/结束/工期/前置/备注/层级）→ 自动区分阶段/节点/普通任务（类型列优先，回退名称关键字）→ `POST /api/projects/:id/schedule/import` 批量追加。
  - **日期三字段互推**：`deriveDates` 对「开始时间 / 完成时间 / 工期」任意两者推导第三值（开始+完成→算工期；开始+工期→算完成；完成+工期→反推开始）；阶段任务时间由子任务聚合回推、节点任务固定单日；仅给工期时落库锚定到项目起始日。前端预览与后端落库共用同一逻辑，保持完全一致。
  - **模糊词条扩充**：表头别名覆盖更多中文常见写法——开始时间/开工日期/完成日期/截止时间/工期(天)/历时/紧前任务/任务类别/层级/备注说明 等，提升对各类 Excel 导出的容错。
  - 腾讯文档导入：`POST /api/projects/:id/schedule/import-from-url` 接收分享/下载链接，后端 `fetch` + `exceljs` 解析后复用同一映射逻辑（链接需设为可公开下载）。
  - 层级用 `indentLevel`/`parent_id` 栈还原，前置依赖按行号或任务名映射。
- **新增功能（清空）**：工具栏「清空计划」→ 确认弹窗 → `DELETE /api/projects/:id/schedule` 物理删除全部计划（owner 校验，不可恢复）。
- **精简**：移除 PLM 连接与只读探针功能（无业务价值，仅 P0 探针）——删除 `routes/plm.js`、`adapters/plm.js`、前端 `PlmConnectionDialog`、API `plm` 块、`db.js` 中 `plm_connection`/`plm_task_map` 两表（运行期 DROP 清理）。
- **文档**：`docs/modules/01-项目进度模块-PRD.md` 新增 2.6.11 文件导入、2.6.12 一键清空；归档删除 `docs/plm-schedule-sync-assessment.md`（功能已移除）。

## 2026-07-21（补）— M1 导入缺陷修复：真实模板表头 / 阶段列适配

- **缺陷修复（日期全空）**：用户模板表头为 `阶段 / 任务 / 计划开始时间 / 计划完成时间 / 工期（天）`，原精确匹配全部未命中（如 `计划开始时间`≠`开始时间`、`工期（天）`全角括号未匹配）→ 导入后时间全为 null。修复：
  - `norm()` 增加全角→半角归一（括号 `（）`→`()`、短横、全角空格）；新增「包含关键字」兜底（含「开始/完成/工期/阶段…」即匹配）。
  - `FIELD_ALIASES` 扩充 `计划开始时间/计划完成时间/计划开工/计划结束时间` 等大量中文写法，新增 `phase` 字段（认 `阶段` 列）。
- **新增功能（阶段列→阶段任务）**：`阶段` 列有值时自动合成一条「阶段任务」父节点，其下任务自动挂为子节点（缩进 1），后端 `recalcPhaseAggregation` 按 `parent_id` 聚合出阶段起止时间。直接用「项目计划模板.xlsx」验证：4 个阶段（计划/详细设计/研发测试/试制）正确识别，33 条任务日期全部正确。
- **缺陷修复（腾讯文档日期丢失）**：`import-from-url` 原 `cell.value` 处理遇 Date 类型单元格返回空串 → 日期丢失。新增 `cellValueToStr` 助手：Date 对象按本地时区转 `YYYY-MM-DD`，富文本/公式结果取文本。
- **验证**：单元映射 + 真实接口端到端（登录→导入→GET 阶段聚合）通过，临时数据零残留。

## 2026-07-21（补）— M4 易用性：物料管理页内置「？OA 导入说明（Chrome 扩展）」弹窗

- **新增功能**：`client/src/pages/MaterialListPage.jsx` 工具栏新增「？OA 导入说明」按钮，弹出 Dialog 图文说明 Chrome/Edge 扩展「Forge OA 物料导入」的安装（chrome://extensions → 开发者模式 → 加载已解压的扩展程序 / 拖入 .crx）、使用（OA 页点图标 → 提取 → 发送到 Forge → 按内部立项号归项目）、更新后需重载扩展、以及仅支持 Chromium 内核浏览器等关键提示。
- **约束遵守**：复用已导入的 `Dialog/Alert` 组件，未引入 `@mui/icons-material`；行内 code 片段用 `Box component="code"` 轻量样式。
- **说明**：OA 一键导入依赖 Chrome 扩展，仅 Chrome/Edge 可用；Firefox/Safari 不支持，弹窗已如实标注，引导同事改用 Chrome/Edge。

## 2026-07-21（补）— M3 易用性：Mantis 设置卡片内置「？如何获取 Cookie」弹窗

- **新增功能**：`client/src/components/issue/MantisConnectionCard.jsx` 在 Cookie 输入框 helperText 处新增可点击「？如何获取 Cookie」链接，点击弹出 Dialog，内嵌浏览器通用取 Cookie 指南（Edge/Firefox/Safari 均适用、DevTools Network 复制法、httpOnly 关键坑、cURL 备选、过期说明）。同事在界面内即可查看，无需另开文档。
- **配套文档**：新增 `docs/mantis-cookie-guide.md`（可转发给同事的完整版图文指南）。
- **约束遵守**：新增 UI 未引入 `@mui/icons-material`（Vite 8 兼容禁止项），关闭按钮用 Unicode `✕` 内联。

## 2026-07-21 — 缺陷修复：OA 浏览器插件导入物料「项目错配」

- **缺陷背景**：M8 多用户隔离改造（commit 767328c）给所有 `/api` 加了 `requireAuth`。`auth-middleware.js` 白名单漏掉了插件用来匹配项目的 `GET /api/projects`，导致插件匿名调用被 401 拦截 → 拿不到项目列表 → 所有 OA 物料被塞进写死的 project 20（液冷超节点），表现为「导入不好使」。
- **缺陷修复**
  - 后端 `POST /api/materials/oa-import`：新增按 `internal_code`（内部立项号）/ `order_number` 服务端解析目标项目，不再依赖插件调用受保护的 `/api/projects`；解析优先级 internal_code → project_id → 失败报错；响应返回 `project_id` / `project_name` 便于前端回显。
  - 插件 `chrome-extension/inject.js`：移除对 `/api/projects` 的调用，改为把已提取的「内部立项号」作为 `internal_code` 上报，由后端完成项目匹配；导入成功提示显示项目名称。
  - 重新打包 `chrome-extension.crx`（用 chrome-extension.pem）。
- **参数变动**：`oa-import` 请求体新增可选字段 `internal_code` / `order_number`（二选一，用于服务端解析项目）。

## 2026-07-21（补）— M8 权限模型升级：owner / admin / member 三级

- **新增功能**
  - 用户三级角色模型：owner（不可撼动的最高权限）/ admin（可管成员）/ member（仅改自己密码）
  - 用户管理页「分配角色」（仅 owner）：将用户设为管理员或成员
  - 侧边栏「用户管理」菜单按角色显示（仅 owner/admin 可见）
- **接口调整**
  - 新增 `PUT /api/users/:id/role`（仅 owner 可调用；禁改 owner 角色、禁设为 owner）
  - `GET/POST/PUT(:id/password)/DELETE /api/users` 套 `requireAdmin`；新增 `requireOwner` 中间件
  - `POST /api/auth/login` 与 `GET /api/auth/me` 返回 `role` 字段
- **缺陷修复**
  - 修正原「人人可管」越权设计：member 不再能进入用户管理页或重置他人密码；admin 不能碰其他 admin 与 owner
- **参数变动 / 约束**
  - `users` 表新增 `role` 列（`TEXT NOT NULL DEFAULT 'member'`）；`chenxu` 在 db 迁移时升为 owner（② bootstrap）
  - 权限矩阵：owner 不可被删/降级/重置密码；admin 不可删/重置其他 admin、不可改角色、不可碰 owner；任何人不可删自己
  - 前端 `api.users` 新增 `setRole`

## 2026-07-21 — 新增 M8 用户管理模块（网页加用户 / 改密码）

- **新增功能**
  - 用户管理页（`/users`，侧边栏入口）：用户列表、新增账号、重置他人密码、删除账号（禁删自己）
  - AppBar「修改密码」入口：改自己密码，需校验原密码，改后新密码可登录
  - 将「加用户 / 改密码」从命令行直连 SQLite 迁移为网页界面操作
- **接口调整**
  - 新增 `server/src/routes/users.js`，挂载 `app.use("/api/users", usersRouter)`（受 `requireAuth` 保护）
    - `GET /api/users` 列表 / `POST /api/users` 新增 / `POST /api/users/me/password` 改自己密码 / `PUT /api/users/:id/password` 重置他人 / `DELETE /api/users/:id` 删除
  - 前端 `api.users`（list/create/resetPassword/remove/changeOwnPassword）
- **缺陷修复**
  - 路由挂载点修正：初版误挂 `app.use("/api", usersRouter)` 导致 `/api/users` 返回 404（router 内 `get("/")` 实际匹配 `/api/`）→ 改为 `app.use("/api/users", usersRouter)`
- **参数变动 / 约束**
  - 密码 bcrypt 哈希（cost 10）；无角色权限（内网人人平等，任一登录用户均可管理账号）
  - 新增菜单/按钮图标均用内联 `SvgIcon`，遵循 Vite 8 禁用 `@mui/icons-material` 约束

## 2026-07-17 — 修复物料页白屏（React #130）+ 增量重构

- **缺陷修复**
  - 根因定位：Vite 8 (rolldown) 对 `@mui/icons-material` v5.18 CJS 的 `exports.default` 导出解析异常，所有 `import Icon from "@mui/icons-material/..."` 在运行时被解析为 module namespace object 而非 React 组件 → React #130 → 整页白屏
  - Vite 8 对 `@mui/x-date-pickers` v7 子路径（无 exports 字段）的目录解析也有类似风险 → 加 `vite.config.js` 的 `resolve.alias` 强制映射到具体 .js 文件
- **接口调整**
  - MaterialListPage.jsx：所有 `@mui/icons-material` 图标替换为 Unicode 字符（▲▼▾📥＋↓✕🔍↩），彻底绕过 Vite 8 兼容问题
  - 新增 `client/vite.config.js`：alias 映射三个 x-date-pickers 子路径至具体 .js 文件
- **新增功能**（增量重构验证通过）
  - 表格骨架（固定10列 + 序号 + 列头排序 ▲▼）
  - 内联编辑（文本/数字/日期 + 失焦保存 + Esc取消 + Tab导航）
  - 状态列彩色标签（5态色值）+ Dropdown 切换
  - 列宽拖拽 + localStorage 持久化
  - 批量操作（checkbox 行选择 + 批量改状态/删除 + 二次确认）
  - Excel 导入（复用 MaterialImportDialog + xlsx）+ 导出（exceljs）
  - 撤销导入（5分钟倒计时）+ 搜索过滤 + 空状态

## 2026-07-16 — 物料管理模块 M4 全量开发（Excel 导入 + 内联编辑 + 批量操作 + 撤销导入）

- **修改模块**
  - `server/src/db.js`：重建 `materials` 表为新规范字段（seq / part_number / manufacturer / model / material_status / quantity / quantity_per_set / set_count / purchase_date / lead_time / expected_delivery / notes），旧骨架表自动迁移；新增 `material_import_snapshots` 撤销快照表
  - `server/src/routes/materials.js`：按新字段重写 CRUD；`POST /batch` 批量写入 + 连续序号 + 记快照；`DELETE /batch` 批量删 + 重排；`PUT /batch-status` 批量改状态；`GET /import-snapshot` + `POST /import-undo` 撤销导入（5 分钟窗口）；增删后全局重排序号
  - `client/src/api/client.js`：materials 接口适配新字段与 batchImport / batchRemove / batchUpdateStatus / importSnapshot / importUndo
- **新增功能**
  - `MaterialListPage.jsx`：固定 10 列 + checkbox + 序号；列头排序（▲/▼）；列宽拖拽 + localStorage 持久化；全字段内联编辑（文本/数字/日期，失焦回车保存、Esc 取消、Tab 导航）；状态彩色标签 + Dropdown（5 态）；实时搜索过滤；空状态提示；滚动位置保持
  - `MaterialImportDialog.jsx`：xlsx 解析（.xls/.xlsx）、列名智能映射、前 50 行预览、错误精准定位、确认批量写入
  - `utils/materialExcel.js`：Excel 列名映射解析 + exceljs 导出（保留状态颜色）
  - `utils/materialStatus.js`：状态枚举与色值（默认/已入库/已下单/待决策/高风险）
  - 批量操作栏（选中后）：批量改状态 / 批量删除（二次确认）/ 批量导出选中；撤销导入按钮（5 分钟倒计时）
- **接口调整**
  - 移除旧 `GET /materials/overdue`、`GET /materials/stats`、`POST /materials/batch`（旧签名）接口
- **参数变动**
  - 物料状态枚举由 `待下单/已下单/在途/已到货/已逾期` 变更为 `默认/已入库/已下单/待决策/高风险`

## 2026-07-16 — 甘特图节点里程碑优化（菱形小巧化 + 贯穿虚线标尺）

- **修改模块**
  - `GanttRow.jsx`：节点菱形边长由 `barHeight+10`(32px) 缩至 `barHeight-6`(约16px)，旋转后对角线≈条形高度，与甘特图协调；外发光/描边同步收敛
  - `GanttChart.jsx`：`buildGanttModel` 新增计算每个节点任务中心线 x（`x+width/2`），以 `nodeLines` 返回；组件解构并传给 `GanttLinks`
  - `GanttLinks.jsx`：新增 `nodeLines` 属性，为每个节点绘制**贯穿全图的红色虚线标尺**（淡红 `#f87171`、`strokeDasharray="3 3"`、透明度0.55），顶部加小菱形标记；`hasContent` 计入节点线

- **新增功能**
  - 节点任务在甘特图上除行内红色菱形外，新增一条与「今天」线风格类似的竖向虚线标尺，便于跨行对齐里程碑日期

## 2026-07-15 — 项目计划「节点任务」逻辑重构（可改日期 + 甘特图红色菱形 + 可被依赖）

- **新增功能**
  - 甘特图节点任务渲染为**红色菱形里程碑**（`#EF4444` 填充 + `#B91C1C` 描边 + 外发光），着重显示，与其它任务长条区分
  - 前置依赖对话框中节点任务候选显示 `◆` 标记，明确其可作为前置依赖被其它任务依赖
  - 节点任务日期现在可在表格/甘特图中**手动编辑**（解除原「先普通后转节点才能定日期」的限制）

- **修改模块**
  - `server/src/routes/schedule.js`：`PUT /schedule-tasks/:id` 移除节点任务 400 拦截；类型切换为节点时折叠为单日里程碑（结束日=开始日），工期强制为 1 天且不可改；新增节点日期可改分支（忽略 duration_days 修改）；`generate` 不再强制节点 `is_locked=1`（解耦锁定与节点类型）
  - `client/src/components/schedule/ScheduleTable.jsx`：编辑守卫改为允许节点改 `planned_start/planned_end`，但禁止改 `duration_days`
  - `client/src/components/schedule/GanttRow.jsx`：节点任务分支渲染红色菱形
  - `client/src/components/schedule/PredecessorDialog.jsx`：节点候选 secondary 前加 `◆`

- **行为说明**：节点任务 = 单日里程碑，日期可手动设定；其它普通任务可将其设为前置，节点日期变动时下游任务按「节点结束日 +1」级联重算（沿用既有 `cascadePropagation` 逻辑，无需改动）。节点自身不随其前置任务变动而移动。

## 2026-07-15 — 会议纪要模块支持「全时会议」

- **新增功能**
  - 会议纪要模块引入全时会议（Quanshi）记录：新建会议时可选平台「全时会议」，粘贴 App 内分享链接（`aiminutes.quanshimeet.cn/summary/m/...`）自动解析会议 ID
  - 列表页新增「平台」筛选（全部/腾讯/全时/手动）与平台徽标列
  - 会议详情抽屉：全时会议显示「打开全时纪要」按钮（新标签页打开分享链接），并展示平台徽标
  - 纪要查看器支持 link 类型：全时会议显示「打开全时会议纪要」按钮
  - 新增「新建会议」对话框（CreateMeetingDialog），支持腾讯/全时/手动三种平台；之前仅有「拉取腾讯会议」入口，无手动创建 UI

- **修改模块**
  - `client/src/components/meeting/CreateMeetingDialog.jsx`（新增）：平台选择 + 全时链接自动解析
  - `client/src/pages/MeetingListPage.jsx`：新建按钮、平台筛选、平台徽标列、接入对话框
  - `client/src/components/meeting/MeetingDrawer.jsx`：平台徽标 + 打开全时纪要按钮
  - `client/src/components/meeting/SmartMinutesViewer.jsx`：link 类型渲染（全时分享链接按钮）
  - `server/src/routes/meetings.js`：POST/PUT 接受 minutes_url、external_id、meeting_code；GET /:id/minutes 对全时返回 `{source:"link",url}` 结构
  - `server/src/db.js`：meetings 表迁移新增 `minutes_url TEXT` 列

- **接口调整**：`POST /api/meetings` 新增可选字段 `minutes_url`/`external_id`/`meeting_code`；`GET /api/meetings/:id/minutes` 全时会议返回 link 类型数据

- **说明**：全时会议无开放 API，纪要页为登录态动态加载，无法自动抓取正文，故采用「存链接 + 跳转」方案，与用户在 App 内获取链接再打开的流程一致

## 2026-07-13 — 新建项目颜色自动轮换（不再固定紫色）

- **缺陷修复**
  - `CreateProjectDialog.jsx`：`existingCount` 无人传递默认为 0，导致每次新建项目固定取 `PALETTE[0]`（紫色 #8B5CF6）
  - 改为 `PALETTE[projects.length % PALETTE.length]`，从 `useProjectContext` 获取项目总数，按 10 色调色板轮换取色
  - 每个新项目颜色与上一个不同，循环 10 色后回到起点

- **修改模块**
  - `client/src/components/common/CreateProjectDialog.jsx`：第 37 行增加 `const { projects } = useProjectContext()`，第 87 行替换取色逻辑

## 2026-07-11 (17:50) — 品牌升级：HPM → Forge

- **品牌升级**
  - 应用名称 HPM → **Forge**（锻造），全量替换
  - AI 生成高级图标：深炭背景 + 金色锻造金属 "F" 字样（forge-icon-192/512.png）
  - 配色：background_color/theme_color → #1a1a2e（深炭黑）

- **修改文件**
  - `client/index.html`：title → Forge，icon/meta 更新
  - `client/public/manifest.json`：name → Forge, icons → forge-icon-*.png
  - `client/public/forge-icon-192.png / 512.png`（新增，替换旧 hpm-icon-*.png）
  - `ecosystem.config.js`：进程名 hpm → forge
  - `scripts/forge-launcher.vbs`（新增，替换 hpm-launcher.vbs）
  - `scripts/create-shortcut.bat`：快捷方式名 HPM.lnk → Forge.lnk
  - `scripts/build-and-start.bat` / `backup-db.bat` / `start.sh`：品牌文字替换
  - `.workbuddy/memory/MEMORY.md`：项目名称、PM2 进程名同步

## 2026-07-11 (17:36) — HPM 桌面封装：快捷方式 + PWA 可安装

- **新增功能**
  - 桌面快捷方式：双击 `scripts/create-shortcut.bat` 一键创建，指向静默启动器 VBS
  - PWA 安装：支持 Chrome「安装」为独立应用窗口（standalone 模式，无浏览器外壳）
  - Service Worker 基础离线缓存
  - AI 生成 HPM 应用图标（紫渐变 + 白色 HPM 字样，192/512px）

- **新增文件**
  - `scripts/hpm-launcher.vbs` — 静默启动器（无命令行窗口）
  - `scripts/create-shortcut.bat` — 桌面快捷方式生成
  - `client/public/manifest.json` / `sw.js` / `hpm-icon-192.png` / `hpm-icon-512.png` — PWA 资产

- **修改模块**
  - `client/index.html` — 添加 PWA meta 标签 + manifest 链接 + SW 注册

## 2026-07-11 (17:30) — 本地封装部署：单进程生产模式

- **架构变更**
  - 从双进程（Vite dev 5173 + Express API 3001）改为**单进程生产模式**（Express 3000 同时托管 API + 前端静态文件）
  - 生产模式下 Express 自动检测 `client/dist/` 目录并启用 `express.static` + SPA fallback
  - 前端 `vite.config.js` 无需改动（proxy 仅 dev 模式生效；production 下 API 同域请求）

- **修改模块**
  - `server/src/index.js`：新增 `path/fs` 导入；生产模式下托管 `../../client/dist` 静态文件；非 API 路由返回 `index.html`（SPA fallback）；PORT 从 3001 改为 process.env.PORT || 3000
  - `ecosystem.config.js`：精简为单进程 `hpm`（移除 `hpm-client`）；cwd 指向 `server/`；NODE_ENV=production, PORT=3000
  - `start.sh`：访问地址从 5173 改为 3000

- **新增脚本**
  - `scripts/build-and-start.bat`：Windows 一键编译启动（npm run build → pm2 start → 浏览器打开 localhost:3000）
  - `scripts/backup-db.bat`：数据库备份（复制 `server/data/hpm.db` → `backups/hpm-YYYYMMDD-HHMMSS.db`，保留最近 10 份）

- **验证**
  - `/api/health` 200、`/` 200、`/plans` 200（SPA fallback）、`/api/projects` 200
  - 单进程 PM2 PID 18128，内存 66MB，开机自启不变（`pm2 resurrect` 自动恢复）

- **重构**
  - 四种单位统一单行显示，彻底移除双行表头逻辑：
    - 日：`7/11` 格式（M/D）
    - 周：`26W28` 格式（YY + ISO周号）
    - 月：`26/7` 格式（YY/M）
    - 季度：`26Q3` 格式（YYQx）
  - 周号使用 `isoWeekYear()` 纠正跨年边界（如12月底已属下年ISO周）
  - 像素紧凑化：HEADER_HEIGHT 52→28px；单位像素 day=24 / week=32 / month=48 / quarter=64

- **修改模块**
  - `client/src/components/schedule/GanttChart.jsx`：段构建完全重写为单行 label；移除 `singleRow`/`displayHeaderHeight` 双行分支；网格线只保留粗线
  - `client/src/components/schedule/GanttTimeline.jsx`：精简为纯单行渲染（40行），移除双行/哑点/muted 等逻辑

- **参数变动**：无

## 2026-07-11 (17:00) — 甘特图增强：时间轴单位切换 + 阶段折叠 + 缩进 bug 修复

## 2026-07-11 — 项目计划页甘特图（只读，含 FS 依赖关系可视化）

- **新增功能**
  - 在【项目计划】页排期表下方新增只读甘特图，依据已有 `schedule_tasks` 排期自动生成时间轴（月+周双行刻度 + 竖向网格）与任务条形（按 depth 缩进、按状态/自定义色着色）
  - 自动解析 `predecessor_ids`（FS 完成→开始，lag=0）绘制依赖箭头折线，含重叠/反向时的绕行防穿越逻辑
  - 时间轴标注「今天」红色虚线；阶段任务加粗 + 深色描边区分层级
  - hover 条形显示 Tooltip（名称 / 起止 / 工期 / 状态）
  - 空态、单任务、无依赖、循环依赖防御、跨月长跨度等边界均安全处理，绝不抛错

- **修改模块**
  - `client/src/components/schedule/GanttChart.jsx`（新增）：主容器，纯展示组件，接收 `tasks` props，`useMemo` 计算时间轴范围 / 行模型 / id→rowIndex 映射 / 依赖连线 / 今天线，组合子组件
  - `client/src/components/schedule/GanttTimeline.jsx`（新增）：双行表头刻度 + 竖向网格，sticky 固定
  - `client/src/components/schedule/GanttRow.jsx`（新增）：左侧任务名列（depth 缩进、sticky）+ 右侧条形（着色 / Tooltip）
  - `client/src/components/schedule/GanttLinks.jsx`（新增）：绝对定位 SVG 依赖连线层（FS 箭头 + 今天线）
  - `client/src/pages/SchedulePage.jsx`（修改）：`<ScheduleTable>` 后插入 `<GanttChart tasks={tasks} />`，外层包 `overflowX:auto` 横向滚动容器

- **接口调整**
  - 无（复用 `api.schedule.list(projectId)`，组件内不发请求）

- **参数变动**
  - 零新增依赖，全部使用既有 `react` / `@mui/material` / `dayjs`；绘图常量集中在 `GanttChart.jsx`（DAY_WIDTH=24 等），不改数据模型

- **缺陷修复**
  - 无（纯增量功能）

## 2026-07-10 — 项目概览「当前阶段」毛玻璃框 + 下拉选择

- **新增功能**
  - 项目概览卡片新增「当前阶段」毛玻璃半透明框，显示在**项目代号右侧**
  - 支持点击下拉选择 6 个固定阶段，各阶段配色：预研阶段（紫）/ 详细设计（蓝）/ EVT（绿）/ DVT（黄）/ 批量试制（橙）/ 直通率爬坡（红）
  - 新建项目默认「预研阶段」；切换阶段即时持久化并刷新卡片

- **修改模块**
  - `server/src/db.js`：projects 表新增 `current_phase` 列（DEFAULT `'pre_research'`），并对历史项目回填
  - `server/src/routes/projects.js`：`GET /projects` 改 `SELECT p.*`（去除原“进行中阶段名”子查询）；`POST`/`PUT` 支持 `current_phase`
  - `client/src/components/kanban/ProjectCard.jsx`：毛玻璃框（backdrop-filter 毛玻璃 + 半透明底 + 彩色边框）+ 下拉菜单；移除原信息区「当前阶段」行
  - `client/src/pages/DashboardPage.jsx`：新增 `onPhaseChange` 回调，选择后回写并刷新

- **接口调整**
  - `POST /api/projects`：新增可选字段 `current_phase`（默认 `pre_research`）
  - `PUT /api/projects/:id`：新增可选字段 `current_phase`
  - `GET /api/projects`：返回对象新增 `current_phase` 字段

- **参数变动**
  - 前端阶段 key→label→color 映射固化为 `PROJECT_PHASES` / `PHASE_MAP` 常量，无外部参数变更

- **缺陷修复**
  - 无（纯增量功能）

## 2026-07-10 — 会议计划「输出物」逐条 item 化（对齐待办事项 subtask）

- **新增功能**
  - 输出物从「按星期单段文本」改为「逐条 item + 完成态 + 删除线」，体验对齐【待办事项】子任务
  - 每个星期格子内可**逐条添加**输出物（底部输入框，回车连续添加）
  - 每条输出物前有勾选框，**点击完成加删除线并置灰**；hover 显示删除按钮可移除
  - 增/改/删均持久化到后端数据库

- **修改模块**
  - `server/src/db.js`：新增 `meeting_outputs` 逐条表（id, week_key, weekday, title, is_done, sort_order, created_at, updated_at）；首次启动将旧 `week_meeting_outputs` 单 blob 表的非空 content 逐条迁入后 DROP（幂等）
  - `server/src/routes/week-meetings.js`：`GET /week-meetings` 改从 `meeting_outputs` 查询；移除旧批量 `PUT /week-meetings/outputs`，新增逐条 CRUD —— `POST /week-meetings/outputs`（新增，自动算 MAX(sort_order)+1）、`PUT /week-meetings/outputs/:id`（切 is_done/改标题，404 处理）、`DELETE /week-meetings/outputs/:id`（删除）
  - `client/src/api/client.js`：`saveOutputs` 替换为 `meetingOutputs: { add, update, remove }`
  - `client/src/pages/WeekMeetingPage.jsx`：移除 `InlineOutput` 单文本框；新增 `MeetingOutputList`（勾选框+line-through+hover 删除+底部回车连续添加）与 handleAddOutput/handleToggleOutput/handleDeleteOutput（乐观更新+异常回滚）

- **接口调整**
  - 新增 `POST /api/week-meetings/outputs`：body `{week_key, weekday, title}`
  - 新增 `PUT /api/week-meetings/outputs/:id`：body `{title?, is_done?}`
  - 新增 `DELETE /api/week-meetings/outputs/:id`
  - 移除 `PUT /api/week-meetings/outputs`（旧批量覆盖接口）
  - `GET /api/week-meetings` 的 `outputs` 由「单 blob 数组」变为「逐条 item 数组」

- **参数变动**
  - 无外部参数变更；数据模型由单 blob 升级为逐条结构化

- **缺陷修复**
  - 无（纯增量功能，原单 blob 方案不满足逐条管理需求故重构）

## 2026-07-11 — PLM 连接配置与只读探针（P0，为"项目计划→PLM排程"同步打基础）

- **新增功能**
  - 新增 PLM 适配器连接配置：可配置 `server_url` / `api_token`(CAS SSO Cookie) / `collab_space` / `tls_reject_unauthorized`(默认跳过内部 CA)
  - 新增「只读探针」：输入任意 PLM URL，后端携带 Cookie 请求并返回结构化结果（HTTP 状态 / Content-Type / body 长度 / 是否 JSON 及顶层 keys / body 前 2000 字符），用于探明排程读取接口
  - 前端「项目计划」页新增「PLM 连接/探针」入口，可保存连接配置并实时探测

- **修改模块**
  - `server/src/db.js`：新增 `plm_connection`（连接配置表）与 `plm_task_map`（任务映射表，预留给 P1/P2 增量同步，本次仅建表）
  - `server/src/adapters/plm.js`（新）：`PlmAdapter` 类，复用 mantis.js 模式；`_httpRequest` 用 `node:https` + `https.Agent` 默认跳过内部 CA；`probe` 支持相对路径拼接、结构化返回、401/403 友好提示
  - `server/src/routes/plm.js`（新）：`GET/PUT /api/plm/connection` + `POST /api/plm/probe`，统一错误映射（网络/TLS→502，参数/校验→400）
  - `server/src/index.js`：`app.use("/api", plmRouter)` 注册 PLM 路由
  - `client/src/api/client.js`：新增 `plm: { getConnection, saveConnection, probe }`
  - `client/src/components/plm/PlmConnectionDialog.jsx`（新）：连接配置表单 + 探针结果展示
  - `client/src/pages/SchedulePage.jsx`：头部加「PLM 连接/探针」按钮打开 Dialog

- **接口调整**
  - 新增 `GET /api/plm/connection`：返回当前 PLM 连接配置
  - 新增 `PUT /api/plm/connection`：保存/更新连接配置（校验 server_url 必填）
  - 新增 `POST /api/plm/probe`：body `{ url }`，返回 PLM 响应结构化结果

- **参数变动**
  - 无外部参数变更；Cookie 经接口写入数据库，前端无硬编码凭据

- **缺陷修复**
  - 无（纯增量 P0 框架，未实现实际同步逻辑）
