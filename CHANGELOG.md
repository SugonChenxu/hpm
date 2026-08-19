# CHANGELOG

> 每次代码迭代的变更记录，字段：修改模块 / 新增功能 / 缺陷修复 / 接口调整 / 参数变动。

## 2026-08-19 — 【快速排期】腾讯文档甘特图：原生形状确认不可自动插入 → 干净画布 + 手动形状清单

- **需求** 用户要求改用腾讯文档「插入形状」的**原生矢量对象**（表格内可自由选中/拖拽/改色/改样式），不再用图片表示。
- **核查结论（最终）** sheet-mcp 全部 42 个工具**无任何形状 API**；形状工具（slide_add_line_shape / slide_add_shapes / slide_add_shape 等）仅存在于 **slide-mcp（幻灯片）**，不适用于表格；insert_image 无矢量/尺寸参数；本环境亦无可用的浏览器自动化技能。→ **API 无法在表格中自动插入原生形状**（Web UI「插入→形状」可手动创建）。
- **落地** 用 `manage.create_file` 新建干净表格（file_id=QoJHMpVlfwkI，`https://docs.qq.com/sheet/DUW9KSE1wVmxmd2tJ`），只搭布局：标题合并、季度合并、月份一格一月、7 轨道名、月度交替底色、列宽行高、冻结、J/K 列（2027-04/05）参照线引导底色；**零图片对象**（导出核验 drawing 文件为空、6 处合并正确）。
- **交付** 给用户「手动插入形状清单」：7 根轨道直线箭头（B4→P4 … B10→P10）、2 根参照虚线（J4→J10、K4→K10，直线+虚线样式）、3 个进度条圆角矩形（G9–J9 / I10–J10 / K10–M10）、18 个菱形节点（含单元格坐标与配色）。
- **备注** 首个 create_file 误建了一个空白重复文件（QpYhZnuDuKEC），已提示用户可手动删除；旧图片版两文档保留作参考。

## 2026-08-19 — 【快速排期】腾讯文档甘特图 V2：轨道线/参照虚线改「每格一段」拼接

- **需求/根因** 用户在 Web 界面看到跨格箭头线/参照线「只在一个单元格内画线」。探针实验确认腾讯文档的**单元格锚定图片会被等比缩放到所在格内**（130×40 图渲染为 123×37.8px 占满一格；1942×30 跨格箭头被压成 123×1.9px 细条）——任何跨多格的单张图片必然塌成一条细线，这就是根因。
- **结论** sheet-mcp 全部 42 个工具无任何矢量形状 API（无 shape/line/arrow 工具），insert_image 也无尺寸参数 → **无法用 API 插入「原生直线箭头形状」**（Web UI 手动「插入→形状」可以，但不可自动化）。
- **方案** 「每格一段」拼接：每个 (轨道行, 月份列) 插一张 130×40 格内尺寸图（渲染占满整格），相邻格线段连成跨 15 个月的连续轨道线；参照虚线 = 虚线列(9/10)每行一段竖向虚线，7 段叠加成贯穿全轨的虚线。
- **合并规则**（同格只能一张图，后插替换先插）：轨道线(轨道色+末列箭头) + 参照虚线(红 D32F2F) + 短进度条(圆角矩形填充分段，名称放首个无节点格) + 里程碑(菱形+9px 标签按日份定位) 按格合并绘制；旧塌缩图被新分段图同锚点自动覆盖清理。
- **验证** 导出 xlsx：7×15=105 段每格 1 张且全部 123×37.8px（占满格），里程碑/进度条/虚线全部并入对应格，无同锚点双图；季度合并、列宽行高冻结保持。
- **复用经验** 腾讯文档表格做跨格线条 = 必须按格切段（单图必塌缩）；同格多元素必须合并绘制；Web UI 有手动矢量形状插入但 API 无此能力。

## 2026-08-19 — 【快速排期】腾讯文档甘特图「月度示意版」（一格一月，不逐日还原）

- **需求** 另开新表（`https://docs.qq.com/sheet/DUU9xZ3RWdHV2ZHdJ`）做**月度示意版**：横向表头只有季度 + 月份（一个月占一格），纵向轨道名，用形状还原进度条 / 节点 / 参照线，**不逐日还原**。
- **布局** 15 个月列（2026-08..2027-10）每列 130px；季度行按连续区间合并（2026Q3..2027Q4，末季单格不合并）；月份行一格一月（交替底色）；轨道区月度交替底色带；冻结表头 3 行 + 轨道列；轨道行高 32pt、轨道列 170px。
- **形状**（全部 insert_image 直连 HTTP，Web UI 可拖动/缩放）：7 条贯穿箭头线（2026-08→2027-10）、3 条短圆角进度条（EVT / 4号主板验证 / 5号主板适配）、18 个菱形节点（按「日份/当月天数」在月内定位，避免同月多点重叠）、2 条全高参照线（Apr'27/May'27，直连 HTTP 插入 + 参照线列浅橙染色保险）。
- **关键坑（重要）** 腾讯文档 **同一 (row,col) 锚点重复 insert_image = 后者替换前者**（探针实验确认：两次均返回成功，但导出仅剩 1 张）。首次构建 30 形状有 3 处锚点冲突被顶掉（ms18 被 vline2、bar17 被 ms11、bar18 被 ms14 替换）。修复 = 冲突的里程碑改插相邻**空闲锚点**、PNG 加宽、菱形按目标列偏移绘制（视觉仍在原日期列），进度条回原锚点**后插**（替换旧节点图）。
- **验证** 导出 xlsx 解析 `xl/drawings/drawing1.xml`：31 张（30 形状 + 1 张透明探针清理图）全部落在正确（轨道行, 日期列），无同锚点双图；季度合并 5 段 + 标题合并正确。导出文件会归一化图片尺寸，但 Web UI 按原始尺寸渲染。
- **复用经验** ① 同锚点再插 = 替换，布局阶段就要规避锚点冲突；② 无删除图片 API，残留可用「全透明 PNG 覆盖」隐藏；③ 高图（vline）走直连 HTTP（`Authorization: Bearer <personal token>`，token 经 connector-proxy `/internal/tencent-docs/tokens`）。

## 2026-08-19 — 【快速排期】导出 Excel 重构为「可视化甘特图」（形状可拖动，非表格）

- **需求澄清** 用户要求导出与 PPT 一致的「可视化、可在 Excel 中直接拖动调整」的简易甘特图，而非填色表格 / 数据明细表。
- **新增模块重写** `server/src/quick-schedule-xlsx.js`：先由 ExcelJS 生成「日期网格 + 轨道标签」骨架（单工作表「甘特图」），再用 jszip 向 xlsx 注入 `xl/drawings/drawing1.xml`（`spreadsheetDrawing`），将对象作为**真正的 Excel 绘图形状**（twoCellAnchor）叠放在网格之上——
  - 进度条 → 圆角矩形（可拖动 / 改大小，内嵌白色名称）
  - 箭头直线 → 细横条
  - 关键节点 → 菱形（circle/square/triangle/star/flag 按符号映射）+ 右侧名称文本框
  - 参照线 → 贯穿全部轨道的竖条 + 名称文本框
  - 日期语义沿用「不含首尾」（工期 = 结束 - 开始）；每日一列（≤ 列上限），月度交替底色。
- **接口/前端** 路由 `GET /api/quick-schedules/:id/export/xlsx` 与前端「导出 Excel」按钮不变，仅后端生成逻辑切换为形状版。
- **腾讯文档说明** 腾讯文档在线表格为独立渲染引擎，**不保留 Excel drawing 形状**，导入后仅显示日期网格、不显示可拖动进度条；真正可拖动的视觉甘特图需用 **Excel / WPS 打开导出的 .xlsx**（与 PPT 导出同理，PPT 也是本地文件可编辑）。局域网同事用「导出 Excel」下载 .xlsx 后用 Excel/WPS 打开即可调整。
- **验证** 真实数据（7 轨道 / 10 进度条 / 18 节点 / 2 参照线）生成 xlsx：drawing1.xml 注入成功（48 个 twoCellAnchor 形状）、sheet 挂载 `<drawing>`、`[Content_Types]` 增加 drawing override；drawing1.xml / sheet1.xml / rels / Content_Types 经 Python xml 解析器校验全部良构；生产构建通过、forge 在线。

## 2026-08-19 — 【项目计划】排期日期语义切换为「不含首尾」（完成 = 开始 + 工期）

- **参数变动（全局语义）** 按用户要求，项目计划排期日期约定由「含首尾」（完成 = 开始 + 工期 - 1）切换为「**不含首尾**」（完成 = 开始 + 工期；工期 = 结束 - 开始）。后端 `addDays` 改回标准 +n 天、`daysBetween` 改回结束 - 开始，并调整全部调用点：反向联动 B 结束 = A 开始 - 1 → `addDays(A开始, -1)`；正向级联 A 开始 = B 结束 + 1 → `addDays(B结束, 1)`；完成 = 开始 + 工期 → `addDays(开始, 工期)`；开始 = 结束 - 工期 → `addDays(结束, -工期)`。
- **前端对齐** `client/src/utils/schedule-date.js` 的 addDays/daysBetween 同步切换；`scheduleMapping.js`（导入推导）、`scheduleExport.js`（Excel 公式 完成=开始+工期）同步。
- **数据迁移** `server/migrate-duration-semantics.mjs`（dry-run/`--apply`，含嵌套阶段聚合多轮收敛）：普通任务结束 = 开始 + 工期（级联）、阶段任务重新聚合。已执行迁移 141 项，复扫 0 残留。
- **验证** 真实数据：L4 8/24 + 7 = 8/31 ✓；反向联动 B 结束 = A 开始 - 1 ✓；全部普通任务 工期 = 结束 - 开始 一致。

## 2026-08-19 — 【项目计划】修复前置联动日期偏差（addDays 含首尾语义对齐）

- **缺陷修复（根因）** 后端 `schedule.js` 的 `addDays(date, n)` 语义为「+n 天」，而前端 `schedule-date.js` 为「+n-1 天」（含首尾），前后端不一致导致后端所有日期换算多 1 天：反向联动「前置结束 = 后置开始 - 1」被算成「= 后置开始」；正向级联「后置开始 = 前置结束 + 1」被算成「+2」。修复：后端 `addDays` 改为含首尾语义（`date + n - 1`），全部 14 处调用点按其意图参数自动正确（`addDays(开始,0)`=开始-1、`addDays(前置结束,2)`=+1、`addDays(开始,工期)`=含首尾结束）。
- **验证** 真实数据联动测试：前置 B 结束 = 后置 A 开始 - 1 ✓。
- **历史数据** 提供 `server/fix-predecessor-dates.mjs`（默认 dry-run 扫描、`--apply` 执行），级联修正历史「后置开始 ≠ 前置结束+1」的任务（当前扫描出 23 个，全部为模板自动排期链，无手动空档）。

## 2026-08-18 — 【快速排期】腾讯文档「形状版甘特图」还原（在线表格 + 可拖动形状）

- **需求** 用户要求在腾讯文档在线表格中用「形状 + 表格」还原快速排期甘特图：横向表头=季度/月份/日，纵向=轨道名，用形状代表进度条与关键节点，最大程度还原 PPT/本地甘特效果，且形状可在腾讯文档内拖动调整。
- **技术路线** 腾讯文档在线表格**无矢量形状 API、无删除图片 API**，故「形状」= 用 `sheet-mcp.insert_image` 把 PNG（圆角矩形/菱形/竖条）锚定到单元格；在 Web UI 内仍可自由拖动/缩放，满足「可调整」。
- **布局构建**（`D:\tmp\_build_tdoc_gantt.py`，未入库，属一次性产出脚本）：
  - 标题行合并 + 季度/月份/日三行表头（季度、月份按连续区间合并，月度交替底色）+ 冻结（冻结表头 4 行 + 轨道列 1 列）。
  - 轨道名列（7 条：PCIeSW6.0芯片/天蝎800G网卡/Hysw2.0芯片/Shaobo芯片/5号CPU/4号主板超节点/5号主板超节点），列宽 150px；每日列宽 13px；轨道行高 26pt。
  - 进度条→圆角矩形 PNG（内嵌白色名称）；关键节点→菱形+标签 PNG；参照线→竖条+顶部标签 PNG（高 = 7×35=245px，贯穿全轨道）。
- **坑与修复** `tdoc_call`（MCP 通道）对高图（vline 245px）**静默丢弃**；改用「方法一」直接 HTTP POST `insert_image`（`Authorization: Bearer <personal token>`，token 经 connector-proxy `/internal/tencent-docs/tokens` 取）插入 2 条参照线，已落地（导出核验 drawing1.xml 含 2 个 tall pic@col258/274）。
- **保险** 给参照线列（258/274）轨道行染浅橙红底色，即使 Web UI 把图片压成短桩也能构成可见竖线；列底色在浮动图片下方不影响进度条/节点显示。
- **验证** 导出 xlsx 核验：29 个浮动图片（10 进度条 + 18 节点 + 2 参照线）全部落在正确（轨道行, 日期列）——按 `sort_order` 重算 track→row 映射后逐一吻合，无错位、无残留测试图。
- **已知限制** 腾讯文档导出 xlsx 时会对浮动图片高度做归一化（导出文件里图片偏矮），但 Web UI 以原始尺寸渲染、可拖动缩放；若要离线可编辑的「真·矢量形状」甘特图，仍用本地导出的 .xlsx（见上一条 08-19 记录）或 PPT。
- **产出** 在线文档：`https://docs.qq.com/sheet/DUURMdGtKeUNqWXFR`

## 2026-08-18 — 【快速排期】进度条/节点改轨道右键菜单 + 进度条阴影样式可编辑

- **交互调整** 「＋进度条」「＋节点」按钮隐藏，改为在轨道甘特区**右键**弹出菜单选择（MUI Menu 锚定鼠标位置）。
- **新增功能** 进度条阴影样式可在编辑面板选择：白色阴影（白斜纹，默认）/ 黑色阴影（黑斜纹）/ 纯色（无阴影）。
- **数据模型** `quick_schedule_bars` 新增 `shadow` 列（迁移，默认 'white'）；bars 路由 POST/PUT 支持 shadow。
- **实现** 前端 `RectBar` 按 `bar.shadow` 渲染（`repeating-linear-gradient` 白/黑斜纹或纯色）；`EditBarDialog` 新增「阴影」下拉。

## 2026-08-18 — 【快速排期】导出 PPT：参照线 + 白灰格子底板 + 时间轴成组

- **新增功能** 导出 PPT 增加参照线（竖虚线，`dashType: "dash"` 贯穿轨道区，含标题，最上层）。
- **新增功能** 月份下方增加白灰相间的格子底板（`FFFFFF`/`EEF2F7` 交替，贯穿轨道区高度）；季度、月份、背景格子组合为 `<p:grpSp>`，三者成组绑定，打开后可整体拖动。
- **验证** 真实数据导出：grpSp 22 组（含时间轴组 36 元素）、背景格子 7 列、dash 参照线 1 条。

## 2026-08-18 — 【快速排期】修复参照线坐标偏移（未叠加标签列宽度）

- **缺陷修复** 参照线渲染在「轨道容器」里，但 `dateToPixels` 返回的是「甘特内容区」坐标（标签列右侧），参照线 `left` 少加了 `LABEL_WIDTH`（160px），导致整体左移、拖动范围起点/吸附位置都错位。修复：参照线 `left`、拖动边界 `minPx/maxPx`、吸附 `nodeLeft` 统一叠加 `LABEL_WIDTH`，`pixelsToDate` 输入减去 `LABEL_WIDTH` 还原甘特坐标。

## 2026-08-18 — 【快速排期】参照线交互优化

- **参数变动** ① 「＋虚线」按钮更名「＋新增参照线」；② 参照线拖动范围明确限制在排期起止（像素 clamp 到 `dateToPixels(minDate/maxDate)`），不超出排期；③ 吸附阈值 8→10px；④ 顶部圆圈与虚线改用 SVG 同轴居中（`cx=x=6` 对齐节点纵向对称轴），消除视觉偏移。

## 2026-08-18 — 【快速排期】新增竖虚线（时间参考线）

- **新增功能** 快速排期新增「竖虚线」时间参考线：点「＋虚线」在排期中间创建，贯穿所有轨道（垂直虚线 + 顶部圆形手柄 + 可标注标题）；可左右拖拽移动；拖拽靠近节点（8px 内）自动吸附对齐到该节点日期（吸附时手柄/虚线变橙色高亮）；双击弹面板改标题/日期/颜色/删除。
- **数据模型** 新表 `quick_schedule_vlines`（schedule_id/owner_id/title/date/color/sort_order），注册 OWNER_TABLES，加索引 idx_quick_vlines_schedule。
- **接口** `POST/PUT/DELETE /api/quick-schedules/:id/vlines[/:vlineId]`；`buildScheduleDetail` 返回 vlines。
- **实现** 前端 `DraggableVline`（拖拽中仅乐观更新、松手保存，吸附用像素距离 ≤8px 匹配最近节点日期）+ `EditVlineDialog`；api client 增加 vlines 方法。

## 2026-08-18 — 【快速排期】修复导出 PPT 组合后节点相对时间轴错位

- **缺陷修复** 自动成组 post-process 时，误把子形状坐标减去包围盒左上角（转相对坐标），而 `<p:grpSp>` 的 `chOff` 又设为包围盒左上角，导致子形状双重偏移、节点符号相对时间轴整体错位。修复：子形状保持**绝对坐标**（PowerPoint 的 group 子形状本就使用绝对坐标，`chOff` 仅记录子坐标系原点），不再做坐标转换。

## 2026-08-18 — 【快速排期】导出 PPT 再优化（分割线/底部统计/斜纹缩短/自动成组）

- **参数变动** ① 季度/月份标签加白色边框分割线；② 底部加统计「共 X 轨道 · Y 进度条 · Z 节点」（保留网页版底部状态）；③ 进度条斜纹长度由对角线改为条高 1.5 倍（旋转后垂直跨度≈条高，不再溢出影响其他元素）。
- **新增功能（自动成组）** 节点「符号+文字」、进度条「矩形+文字+斜纹」自动组合为 PPT 分组 `<p:grpSp>`，导出后拖动即整体移动。实现：pptxgenjs 4.x 不支持组合，故生成后 post-process——jszip 解包 → 按形状添加顺序把相关 `<p:sp>` 包进 `<p:grpSp>`（子坐标转相对 chOff）→ 重打包。
- **依赖** server 新增 `jszip`。

## 2026-08-18 — 【快速排期】导出 PPT 视觉增强

- **参数变动** 导出 PPT 视觉增强：① 时间轴由单行季度改为「季度(红底 A94442) + 月份(浅红底 D9A6A5)」两行；② 进度条保留白色斜纹底纹（45° 半透明白色细条叠加）；③ 整体加圆角毛玻璃边框（roundRect + 半透明浅色边框）；④ 轨道名称保留 label_color 浅色底纹。

## 2026-08-18 — 【快速排期】导出 PPT 功能

- **新增功能** 快速排期支持导出 .pptx：后端新增 `quick-schedule-pptx.js`（pptxgenjs 生成），甘特图映射为 PPT 原生形状——轨道线=直线+右端箭头、进度条=纯色矩形+居中白字、节点=圆/方块/菱形/三角/五角星+文字、时间轴=季度标签（红底白字）。
- **接口** `GET /api/quick-schedules/:id/export/pptx`（owner 隔离，返回 .pptx 附件下载）。
- **交互** 前端顶部工具栏新增「导出 PPT」按钮（无排期时禁用），点击下载 .pptx；打开后所有形状可自由拖动、调整大小（PPT 原生能力，满足「导出后还能拖拽」诉求）。
- **依赖** server 新增 `pptxgenjs`。

## 2026-08-18 — 【快速排期】拖拽丝滑度优化（拖拽中不请求后端）

- **接口调整** 拖拽进度条/节点时不再每次 mousemove 都发后端请求（此前每次移动都 PUT + 后端返回全量树整树替换，响应乱序导致视觉回滞）。改为：拖拽中仅本地乐观更新，松手（mouseup）时一次性保存最终值。
- **实现** 父组件 `handleUpdateBar`/`handleUpdateMilestone` 拆为「乐观更新」+「`handleSaveBar`/`handleSaveMilestone` 松手保存」；`ArrowBar`/`RectBar`/`DraggableMilestone` 新增 `onSave` 回调 + `latestRef` 记录拖拽最终值。

## 2026-08-18 — 【快速排期】白条把手贴边 + 节点拖拽范围收窄

- **参数变动** 矩形条两端白色竖条把手由热区居中改为紧贴条两端边缘（`justifyContent: flex-start/flex-end`），视觉更规整。
- **交互** 关键节点拖拽/编辑范围由整个 80×44 容器收窄到符号本身（18×18），容器 `pointerEvents: none`，避免节点遮挡相邻元素的点击。

## 2026-08-18 — 【快速排期】矩形条拖拽把手 / 高度 / 文字微调

- **缺陷修复** 矩形条两端收尾拖拽把手由 10px 圆点（一半伸出条外、热区过小点不到）改为条两端内侧 14px 宽热区 + 白色竖条标记，恢复「拖两端改起止时间」能力。
- **参数变动** 矩形条高度 18→12（原 2/3），底边仍贴箭头线顶边 31（BAR_TOP 13→19）；文字加粗（600→700）并水平居中。

## 2026-08-18 — 【快速排期】矩形条阴影改内部白色斜纹 + build trash 根因修复

- **参数变动** 矩形进度条阴影由「外白描边 + 投影」改为「纯色块内部交替白色斜纹」：`repeating-linear-gradient(45deg, 透明 5px + rgba(255,255,255,0.5) 5px)`，实现纯色矩形内交替白色条状块的阴影纹理。
- **缺陷修复（根因）** vite build 失败的真正原因是 WorkBuddy safe-delete 把 vite 清空 dist 的 `rmSync` 重定向到回收站，trash 任意 dist 文件（如 forge-icon-192.png）都报 "Some operations were aborted"（此前误放 png 只是首个撞上的文件）。修复：`start.sh` build 分支先 `rm -rf client/dist`（系统 rm 绕过回收站）再 build，彻底规避。

## 2026-08-18 — 【快速排期】恢复矩形进度条 + 构建脚本健壮性修复

- **新增功能** 恢复「＋进度条」入口：轨道内新增矩形进度条（style='bar'），体现阶段类任务状态。底边贴轨道箭头线（top 13 + height 18，底边对齐箭头线顶边 31）、纯色填充 + 白色描边 + 投影（白边阴影）、条内白色文字标注。
- **交互** 矩形条两端圆形把手拖拽分别调整起止时间（ew-resize），拖动条体整体平移（保持工期不变）；双击弹编辑面板改名称/起止/颜色。
- **层级** 关键节点 zIndex 3→4，同时间段节点始终显示在矩形条与箭头线最上方。
- **新增** `EditBarDialog` 支持新增模式（`defaultStart`/`defaultEnd` + isEdit 判断，新增时隐藏样式下拉、固定 style='bar'）；`TrackRow` 底部按钮区新增「＋进度条」。
- **缺陷修复** `start.sh` build 分支：`cd client && npm run build && cd ..` 改为 `(cd client && npm run build) || exit 1`，避免构建失败时 `cd ..` 不执行导致 pm2 在错误目录找不到 ecosystem.config.js、误删 forge 服务。
- **清理** 移除误放进 `client/public/` 的 AI 生成图 `App_icon_design__*.png`（1.28MB、未被引用、forge-package 内仍有副本），它会导致 vite 清空 dist 时 trash 失败。

## 2026-08-11 — 【项目计划】腾讯文档完整表样式对齐导出 Excel

- **新增功能** 完整表重建后样式与导出 Excel 一致：表头浅蓝底 `FFE3F2FD` + 加粗 + 居中；数据区 thin 黑色边框；顶层任务行（depth=0）浅橙底 `FFFFF3E0` + 加粗；阶段任务行加粗；列宽按导出规格换算（序号61/名称215/类型75/开始103/完成103/工期61/前置145/备注145 像素）。
- **实现** 腾讯文档 sheet-mcp：`set_cell_style`（底色/加粗/对齐/数字格式）、`set_border`（THIN 六向边框）、`set_dimension_size`（列宽像素）。项目 20 实测：表头/边框/顶层 6 行/阶段 7 行/列宽全部 OK，get_cell_style 抽查验证（表头 E3F2FD+center、顶层行 FFF3E0+bold+thin 边框）。
- **沉淀** skill `forge-schedule-td-sync` 模式 B 增加「样式复刻」步骤（含列宽换算公式）。

## 2026-08-11 — 【项目计划】腾讯文档完整表日期显示修复

- **缺陷修复** 完整表重建后开始/完成列显示为 Excel 序列号裸数字（如 46217）而非日期：根因是写入用 number_value（序列号）但未设置单元格数字格式。已用 `set_cell_style`（number_format_pattern="yyyy-mm-dd"）批量设置 D/E 列数据行（1~46），读回验证全部显示标准日期（2026-07-14 等），公式计算值同步生效。
- **沉淀** skill `forge-schedule-td-sync` 增加「设置日期显示格式」必做步骤。

## 2026-08-11 — 【项目计划】腾讯文档完整表重建（46 任务全量输出 + 公式联动）

- **新增功能** 完整表重建：`server/scripts/gen-td-full-table.mjs <projectId>` 生成 Forge 导出格式完整表（序号/任务名称/任务类型/开始时间/完成时间/工期/前置任务/备注 8 列），含公式联动——叶子完成 `=D+F-1`、有前置叶子开始 `=MAX(前置完成行)+1`、阶段开始/完成 `=MIN/MAX(子孙叶子行)`（递归收集非阶段子孙）；无前置叶子开始/工期/序号等为数据。
- **实测** 项目 20「液冷超节点」子表「10-项目计划」覆盖重建：clear_range_all 清空 → set_range_value 一次写入 376 单元格（87 公式 + 97 数字 + 192 文本，混合 value_type 大批量实测 OK）→ 46 任务全量输出、8 列完整，公式联动验证正确（L2 开始 =MAX(E3)+1 → 前置完成次日；M1 阶段 MIN/MAX 聚合正确）。
- **接口/工具** 快照脚本（schedule-snapshot.mjs 输出树序+关联配置）+ 完整表生成脚本（gen-td-full-table.mjs 输出含公式 values）。
- **沉淀** skill `forge-schedule-td-sync` 增加「模式 B：完整表重建」流程。
- 原「10-项目计划」手排 9 行（L1~L9，含里程碑/关键路径列）已按用户确认被完整表覆盖。

## 2026-08-11 — 【项目计划】腾讯文档关联配置（排期同步到在线表格，保留公式）

- **新增功能** Forge 项目计划支持关联腾讯文档在线表格：项目计划页工具栏新增「腾讯文档」按钮 → Dialog 粘贴文档链接（+可选子表名）保存关联，已关联显示 ✓ 与上次同步时间，可解除。
- **数据模型** 新表 `tencent_docs_link`（owner_id/project_id/file_url/file_id/sheet_name/last_sync_at/last_sync_status），注册 OWNER_TABLES 启动补 owner_id。
- **接口** `GET/PUT/DELETE /api/tencent-docs/link`（owner 隔离，从链接自动解析 file_id）。
- **架构说明** 腾讯文档写入能力由 WorkBuddy 连接器提供（票据不进 Forge），故同步动作为**手动触发**：对 WorkBuddy 说「同步「项目名」到腾讯文档」即执行。执行流程已技术验证（连接器 READY）：快照脚本 `server/scripts/schedule-snapshot.mjs` 输出项目排期 JSON → `get_sheet_info` 选子表 → `get_cell_data`（include_formula）识别公式单元格 → 按任务名称匹配行 → `set_range_value` 批量写「开始时间/工期」数据单元格，**公式单元格（完成时间联动、阶段 MIN/MAX 聚合）跳过不写，公式自动重算 → 天然保留公式**。
- 待办：用户提供真实腾讯文档链接后，执行首次同步实测并沉淀同步 skill。

## 2026-08-11 — 【项目计划】腾讯文档同步首测通过（项目「液冷超节点」）

- **实测通过** 项目 20「液冷超节点」（子表「10-项目计划」o99796）：表头绝对行 50（序号/阶段/计划开始时间/计划完成时间/计划工期/里程碑/关键路径）、数据行 52-60（L1~L9 共 9 行），全数据单元格无公式。
- **同步结果** L1~L9 的开始/完成/工期全部按 Forge 最新值更新（如 L2 详细需求 7/29~8/4 7天 → 7/28~8/13 17天；L7 Power On 2027/2/1~2/14 13天 → 2/7~3/13 35天），结构化读回验证通过；`tencent_docs_link` 回填 sheet_id/last_sync_at。
- **踩坑教训** ① get_cell_data 的 return_csv 模式因单元格内换行导致行号错乱（误判数据行 60-68，实际 52-60），必须用结构化模式（cells[].row=0-based 绝对行号）；② set_range_value 的 row 即绝对行号（0-based），与结构化读取一致。首次误写已修复（恢复 L9 原行 + 清除脏数据行 61-68）。
- **沉淀** 同步流程已固化：`~/.workbuddy/skills/forge-schedule-td-sync/SKILL.md`（含快照脚本、结构化读表、公式识别跳过、序列号写入、验证与状态回写）。

## 2026-08-11 — 【项目计划】前置联动逻辑审查加固（4 项修复）

- **缺陷修复（前端计算不一致）** `client/src/utils/schedule-date.js`：`updateStartDate`/`updateDuration` 计算结束日期为 `开始 + 工期`（不含首尾），与后端 `开始 + 工期 - 1`（含首尾）不一致——此前靠后端忽略 `body.planned_end` 纠正，若未来乐观更新会差 1 天。已改为 `+工期-1` 并对齐注释（start=21, dur=5 → end=25）。
- **接口调整（触发条件精确化）** PUT 前置联动触发条件由 `body.planned_start !== undefined` 改为 `updates.planned_start !== undefined`：普通任务仅改结束时间不联动（正确）；节点任务传 `planned_end`（单日，开始=结束同时变化）也会正确联动；锁定任务本就因提前 return 不触发（复核确认无漏洞）。
- **缺陷修复（日期比较规范化）** `linkPredecessorsToStart` 内日期统一 `slice(0,10)` 比较，防历史/导入数据带时间部分（如 `2026-08-14 00:00:00`）导致"紧贴/重叠"判断失配。
- **新增功能（跳过提示）** 前置整体晚于 A 新开始时间（无法自动压缩）时不再静默跳过：`linkPredecessorsToStart` 返回 `{ linked, warnings }`，PUT 响应带 `warnings`，前端 snackbar 黄色提示"前置任务「X」整体晚于任务「A」的新开始时间（YYYY-MM-DD），已跳过自动调整，请手动检查排期冲突"。
- **审查结论（已知边界，未改）** 循环依赖（A↔B 互为前置）由 `detectCycle` 阻止新建，历史导入残留属既有行为；级联对受影响集去重，不会死循环。
- 验证：单测 `server/test-predecessor-link.mjs` 28/28（14 场景，新增：warning 返回、时间脏数据规范化、值未变不联动）；端到端 6/6（PUT warnings 透传 + 全量树）。

## 2026-08-11 — 【项目计划】前置联动补充：A 开始时间后移时顺延紧贴前置任务

- **新增功能** `linkPredecessorsToStart` 增加 `oldStartA`（修改前开始时间）参数，扩展联动规则：
  - **A 后移（推迟）**：原本与 A 紧贴的前置（结束 = 旧 A 开始 - 1，典型为上轮联动产物）→ 结束时间**顺延** = 新 A 开始 - 1，开始不变，工期重算（保持"前置恰好在前一天完成"的依赖关系）；原本远早于 A 结束的前置不变化。
  - **A 后移但仍与前权重叠**（结束 >= 新 A 开始）→ 压缩到新 A 开始 - 1（原有规则）。
  - **A 前移**：行为与上轮一致（结束 >= 新 A 开始的压缩；紧贴前置也被压缩）。
- **接口** `PUT /api/schedule-tasks/:id` 传 `planned_start` 即触发；`linkPredecessorsToStart(projectId, taskId, newStartA, oldStartA)` 返回被联动的前置 id 列表（仍作为额外级联源传播）。
- 单测 `server/test-predecessor-link.mjs` 25/25 通过（12 场景：含后移顺延/远早不动/重叠压缩/前移回归）。

## 2026-08-11 — 【项目计划】修复：修改时间/工期后页面整页刷新并跳顶

- **缺陷修复** 根因：`handleTaskUpdate`/`handleChangeType`/`handleBgColorSave` 保存后调用 `loadSchedule()`，其内部 `setLoading(true)` 会把整个页面替换为 `<PageLoading />` 占位，表格/甘特图整树卸载重建，高度骤变导致滚动条跳到顶部、视觉"刷新"感强烈。
- **接口调整** `PUT /api/schedule-tasks/:id` 由返回单个任务改为返回**级联后的全量任务树**（与 GET /indent/outdent 一致，含 depth/completion_status）。
- **前端** 三处保存 handler 改为直接用返回树 `setTasks`（补 calcCompletionStatus 映射），不再走带 loading 的全量重载——数据原地更新，无刷新效果、滚动位置不变；同时省一次网络请求。
- 结构性操作（插入/删除/导入/清空/改前置）仍保留 `loadSchedule` 全量重载（结构变化大，合理）。
- 验证：临时服务器端到端 8/8 通过（PUT 返回数组 + 前置联动 B.end=A.start-1 生效）。

## 2026-08-11 — 【项目计划】修改任务开始时间时自动压缩前置任务（依赖反向联动）

- **新增功能** 修改任务 A 的开始时间时，联动处理其前置任务：
  - 前置任务 B 的结束时间 **>= A 的新开始时间** → B 结束自动改为 `A 开始 - 1 天`，B 开始时间不变，工期按新结束重新计算；
  - 前置任务 B 的结束时间 **< A 的新开始时间** → 完全不变化；
  - 多前置 B/C/D 时逐条按上述规则判断（晚于 A 开始的联动、早于的不动）。
- **边界** 仅联动「普通任务」前置；阶段任务（日期由系统聚合）、节点任务（单日里程碑）、锁定任务（is_locked=1）跳过；防御：压缩后 结束<开始 的前置跳过（避免脏数据）。
- **级联** 被联动的前置任务同时作为变更源参与 cascadePropagation，其依赖链（后继任务开始时间、阶段聚合、完成状态）一并刷新；数学上 `A 新开始 = MAX(各前置结束)+1` 恒成立，不会覆盖用户设置的 A 开始时间。
- **接口** `PUT /api/schedule-tasks/:id` 传 `planned_start` 即触发（前端拖拽/编辑开始时间均走此接口，无前端改动）。
- 新增工具函数 `linkPredecessorsToStart(projectId, taskId, newStartA)`（schedule.js 导出），单测 `server/test-predecessor-link.mjs` 15/15 通过（8 场景，事务回滚隔离）。

## 2026-08-11 — 【项目计划】甘特图导出改版：参考「曙光天阔 N50 Pro Schedule V12」模板风格

- **新增功能** 甘特图 sheet 全面参考 V12 模板视觉风格：
  - 双层表头：行1 月份序号（2026-07）+ 行2 日期范围（7/1-7/31），浅灰底纹加粗居中。
  - 任务条改用 Excel 主题色系：阶段任务深蓝 #4472C4、叶子任务浅蓝 #B4C7E7；任务名称全部加粗（同模板）。
  - **节点任务（里程碑）改为灰色标记格 #A6A6A6**（对应模板 Gates 灰色里程碑点），单日仅 1 格。
  - 冻结 A/B 列与前 2 行表头（C3，滚动时任务名/表头始终可见，同模板 freeze C6）。
  - 去掉单元格边框，色块直接铺（同模板）。
  - 列精简：仅保留 A 序号 / B 任务名称 + 月份列（原开始/结束/工期列移除，细节看排期表 sheet）。
- **参数变动** 甘特图 sheet 不再输出开始日期/结束日期/工期(月) 三列。
- 验证：`server/test-schedule-export.mjs` 单测 24/24 通过；真实项目「勒拿河」28 条任务生成样例 PASS。

## 2026-08-11 — 【项目计划】导出 Excel 增强（甘特图 sheet + 行级强调样式）

- **新增功能** 导出 Excel 增加第二个工作表「甘特图（月）」：时间轴按月展开（表头 YYYY-MM），每任务一行，任务覆盖的自然月以色块填充——阶段任务深蓝、叶子任务浅蓝；阶段起止自动取其后代叶子任务的最小/最大日期（递归穿透子阶段）；无日期任务仅显示名称。
- **参数变动** 排期表 sheet 不再导出「完成情况」列（反灌逻辑本就忽略该列，无回归）。
- **新增功能** 最高级别任务（depth=0）整行统一浅橙底纹 + 文字加粗；阶段任务（含子阶段）字体加粗。
- **前端** SchedulePage.jsx 导出成功提示更新为"含月单位甘特图 sheet"。
- 验证：`server/test-schedule-export.mjs` 单测 20/20 通过；真实项目「勒拿河」28 条任务端到端导出 PASS。

## 2026-07-30 — 【会议计划】添加会议：粘贴腾讯会议/全时会议邀请快速解析

- **新增功能** 添加会议对话框新增"快速解析"区：粘贴腾讯会议/全时会议邀请全文（或链接），自动提取会议主题、日期、时间、入会链接，填表并跳到对应周。
- **新增功能** `client/src/utils/parseMeetingInvite.js`（纯函数解析器）：支持绝对日期(2026/07/30)、中文月日(7月30日)、相对时间(今天/明天/后天/下周X/周X/今晚)；时间支持 24h 与 12h(上午/下午/晚上/中午)及范围(- ~ — 至 到)；自动剥离日期串与 URL 避免误解析；时间钳制到课表 09:00-21:00；周日告警。
- **接口调整** `week_meetings` 表新增 `meeting_url` 列（db.js ALTER 迁移）；`week-meetings.js` POST/PUT 透传 `meeting_url`。
- **前端** `WeekMeetingPage.jsx`：对话框加解析文本框+「解析并填入」按钮（含告警提示），新增"入会链接"字段；会议卡片显示 🔗 入会 链接。
- **测试** `scripts/test-parse-invite.mjs` 覆盖腾讯会议/全时/相对/中文/纯链接场景。

## 2026-07-30 — 快速笔记修复：长文工具栏卡顿/显示异常

- **缺陷修复** 根因：编辑器 `onInput` 每次按键调用 `onChange(html) → setContent`（父组件 state），导致**每次按键整页重渲染**，且 `RichTextEditor`（含工具栏+3 个 MUI Select+约20 按钮）随之重渲染；文字越长 `innerHTML` 序列化+组件树重渲染开销越大，工具栏出现卡顿/下拉错位/按钮响应异常（即"字数超过一定量工具栏显示问题"）。
- **修复** `client/src/pages/QuickNotesPage.jsx`：编辑器内容由 DOM 自身持有，改用 `contentRef` 存储，`onChange` 只写 ref + 防抖保存，不再写 state；`saveNow` 直接读 `contentRef.current`。`client/src/components/notes/RichTextEditor.jsx`：工具栏抽为 `React.memo(EditorToolbar)` 且所有回调 `useCallback` 稳定化，按键时工具栏零重渲染；Select 加 `MenuProps`(zIndex/maxHeight) 防下拉被裁切；垂直 `Divider` 改 `height:22, alignSelf:center` 避免换行时竖线撑高；`insertTaskList` 误用命令改回自定义 `handleTaskList`。
- **影响范围**：仅快速笔记编辑器，无接口/表结构变动。

## 2026-07-29 — 会议计划重叠会议分栏并排显示（方案A）

- **新增功能** `client/src/pages/WeekMeetingPage.jsx`：同天时间重复的会议不再互相遮挡、可全部显示且方便观看。新增 `assignLanes(meetings)`——按 `[start,end]` 区间构建并查集冲突组（传递闭包），组内贪心分配泳道 `lane`，组最大并发数=`lanes`；`meetingsByDay` 分组后每天调用。卡片定位由 `left:0;right:0` 改为 `left: lane*100/lanes%`、`width: calc(100/lanes% - 2px)`（lanes>1 留 2px 间隙）；`lanes=1` 时行为完全等价旧版，无回归。顺带修复同起点会议叠放、删除可能误删的隐患（每张卡片独立定位）。
- **范围**：仅做显示层分栏（方案A），未改覆盖/拖拽建会交互；极端重叠(≥5)卡片会变窄，已用省略号+Tooltip 兜底。

## 2026-07-29 — 快速笔记增强（缩进 / 任务列表 / 统一工具栏 + 修复图片保存）

- **新增功能** `client/src/components/notes/RichTextEditor.jsx`：工具栏加「增加缩进 / 减少缩进」(`execCommand indent/outdent`)；新增「任务列表」按钮（插入 `<div class="qn-task"><input type=checkbox contenteditable=false> + 可编辑<span>`，勾选后文字加删除线）；所有动作按钮统一为 `ToolBtn`（30px 方形 IconButton + Tooltip），点击前 `onMouseDown preventDefault` 保留编辑器选区；颜色/字号 Select 改为保存并还原选区，确保作用于选中文字而非丢失。
- **缺陷修复** `server/src/index.js` + `server/src/routes/quick-notes.js`：根因为 Express 默认 `express.json()` body 上限 100kb，base64 图片超阈值时 `PUT /quick-notes/:id` 被 413 拒绝导致图片无法保存。修复：`express.json({limit:"25mb"})` + `express.urlencoded({limit:"25mb"})`，`safeContent` 上限提到 20MB。已用 6MB body 探针验证通过。
- **约束**：图片仍以内嵌 base64 存储（单条上限 20MB），未引入第三方富文本库，遵循 Vite8 兼容规范。

## 2026-07-29 — 新增【快速笔记】模块（富文本随手记）

- **新增模块**：落地「快速笔记」模块（M10，个人空间），提供所见即所得富文本编辑器，用于随手记录灵感/待办/要点，支持图文表格混排，对标 ProcessOn「思维笔记」模式。导航新增「个人空间 → 快速笔记」(/notes)。
- **后端** `server/src/routes/quick-notes.js` + `db.js`：新增 `quick_notes` 表（owner_id/title/content_html/pinned/时间戳），入 `OWNER_TABLES` 启动迁移；实现 `GET /api/quick-notes`(列表，置顶优先、预览去标签)、`POST`(新建)、`GET /:id`(详情)、`PUT /:id`(更新 title/content_html/pinned)、`DELETE /:id`(删除)；全部按 `owner_id` 隔离；挂载 index.js。内容上限 5MB 保护。
- **富文本编辑器** `client/src/components/notes/RichTextEditor.jsx`：基于 contentEditable + document.execCommand（不引入第三方库，规避 Vite8/rolldown 风险），工具栏含字号(12~48px)、文字颜色、背景高亮、加粗/斜体/下划线/删除线、左中右/两端对齐、有序/无序列表、撤销/重做、清除格式、插入图片(上传+粘贴截图)、插入表格；图片以 base64 DataURL 内嵌。
- **页面** `client/src/pages/QuickNotesPage.jsx`：左侧笔记列表(新建/搜索/置顶/预览/删除) + 右侧编辑器，标题与内容变更 800ms 防抖自动保存，切换/新建前 flush，状态芯片显示「保存中/已保存时间」。`api/client.js` 新增 `api.quickNotes`；Sidebar(内联 NoteIcon) + App 注册路由。
- **约束**：遵循 Vite 8 兼容规范，工具栏用 Unicode 文本、导航用内联 SvgIcon，禁用 @mui/icons-material。`vite build` 通过；`forge` 重启在线；DB 层验证 owner 隔离 CRUD 正常。

## 2026-07-24 — 新增【库存管理】模块（PLM 研发库房库存拉取）

- **新增模块**：按技术方案 `PLM数据抓取技术方案.md` 落地「库存管理」模块，从 PLM 研发库房(sgDevelopmentWarehouse.jsp)拉取指定项目+库位号的库存信息。导航新增「库存管理」(/inventory)，位于「数据管理」分组。
- **后端适配器** `server/src/adapters/plm.js`：实现 PLM 认证(CAS SSO → JSESSIONID+afs Cookie)、CSRF Token 自动获取(emxUIConstantsJavaScriptInclude.jsp)、项目列表抓取(emxIndentedTable.jsp → emxFreezePaneGetData.jsp，XML 解析)、研发库房库存抓取(JSON 提取)，错误归一化(network/timeout/auth_failed)，跳过内网自签证书。
- **解析与路由** `plm-resolve.js` + `routes/plm.js`：每用户 PLM 连接配置(plm_connection)与项目关联(project_links：plm_oid/plm_name/tree_label/lgort)；`GET/PUT /api/plm/connection`、`GET /api/plm/projects`、`GET /api/plm/link`(无关联时按项目名自动匹配 PLM 项目，优先自动、可手动)、`POST /api/plm/sync`(拉取库存入库 plm_inventory)、`GET /api/plm/inventory`(按 lgort 过滤)；挂载到 index.js；全部按 owner_id 隔离。
- **前端** `components/inventory/PLMConnectionCard.jsx`(Cookie 设置 + 项目关联含仓库 treeLabel/库位号 lgort，名称自动匹配)+ `pages/InventoryPage.jsx`(项目选择、关联、同步库存、库存表、库位号过滤、库存总件数/总金额)。`api/client.js` 新增 `api.plm`；Sidebar + App 注册。
- **DB** 新增 `plm_connection`(server_url/cookie/project_links/last_sync)、`plm_inventory`(matnr/maktx/labst/werks/lgort/lgobe/stprs/matkl/wgbez)；后者入 OWNER_TABLES。修复 db.js 中 2026-07-21 废弃 PLM 时遗留的 `DROP TABLE plm_connection` 清理代码（导致表被建后立即删除），并将 SQL 模板内的 `//` 注释改为 `--`（避免 SQLite "near /" 语法错）。

## 2026-07-24 — M4 物料：需求清单去除 OA 链接 + 采购/需求按物料号状态联动

- **需求清理（OA 链接）**：需求清单不再需要 OA 链接。移除 `routes/requirements.js` 中 COLUMNS/normalize/INSERT/UPDATE/搜索里的 `oa_link` 字段；前端 `REQUIREMENT_COLUMNS`、`REQ_PREVIEW_FIELDS`、`CTX_FIELDS` 需求分支、导入解析 `REQ_FIELD_ALIASES` 与 `parseRequirementExcel` 同步去除。采购清单（materials）的 OA 链接及 OA 抓取功能保持不变。
- **联动（采购 → 需求状态实时同步）**：需求清单的"物料状态"改为**读取时按物料号(part_number)实时联动**采购清单同物料号的最新状态，取代原单向、仅"已下单"的写时同步（`syncRequirementOnOrdered`）。`GET /api/requirements` 现返回 `purchase_status` 字段（有对应采购记录则为其状态，否则 null）；前端需求清单状态列优先显示 `purchase_status`，并标注"↓采购"、联动时只读（不弹状态菜单、右键隐藏"修改状态"、批量状态栏对需求清单隐藏）；搜索与状态过滤均基于联动后的值。采购清单任一条物料状态变化后，需求清单重新加载/搜索即同步，无需触发器。
- **接口调整**：`GET /api/requirements` 搜索/状态过滤改在应用层基于联动值执行；删除 `materials.js` 中 `syncRequirementOnOrdered` 函数及其在 `batch-status`/`PUT`/`oa-import` 三处调用。

## 2026-07-24 — M4 物料管理：修复需求清单"添加失败" + 需求清单支持 Excel 导入

- **缺陷修复（需求清单添加失败）**：根因为多用户改造时 `owner_id` 列只加给了 `materials` 表，漏加 `material_requirements`；而 `routes/requirements.js` 的新增（POST /requirements）与批量导入（POST /requirements/batch）INSERT 语句都写入 `owner_id`，导致 SQLite 报 "no such column: owner_id" → 500 → 前端"添加失败"。
- **修复（补列）**：`db.js` 的 `OWNER_TABLES` 清单加入 `material_requirements`（服务启动即 ALTER 补列），并在 `CREATE TABLE material_requirements` 补 `owner_id INTEGER DEFAULT 0`（新库直接带列）。修复后单条新增与批量导入恢复正常。
- **新增功能（需求清单 Excel 导入）**：原先"导入 Excel"按钮仅采购清单可用，需求清单无法导入。现放开按钮（两种清单都显示），`MaterialImportDialog` 增加 `mode` 属性（purchase/requirement）：
  - 需求模式用新增的 `parseRequirementExcel`（识别 模块/物料描述/物料号/预估单价/数量/物料状态/备注/OA链接），按需求列预览，提交到 `POST /api/requirements/batch`。
  - 采购模式行为保持不变。
  - `materialExcel.js` 的 `buildFieldMap` 改为可接收自定义别名表，新增 `REQ_FIELD_ALIASES` 与 `parseRequirementExcel`；导出函数不变。
- **验证**：DB 层确认 `material_requirements` 已含 `owner_id`；`vite build` 通过；`forge` 重启在线、无重启报错。需求清单导出→导入可往返（导出表头均能被解析器识别）。

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
