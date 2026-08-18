# M11 — 快速排期模块详细 PRD

> **关联顶层 PRD**: `docs/PRD.md` v2.0  
> **开发优先级**: ⑪（独立轻量工具模块，服务于会议/汇报场景）  
> **依赖**: 用户认证（多用户 `owner_id` 隔离）；不绑定具体项目  
> **实现状态**: ✅ 已完成（2026-08-18）

---

## 一、模块核心定位

会议中快速搭建**多轨道项目排期模拟**的轻量甘特工具：以「轨道 + 进度条 + 关键节点」表达时间计划，支持拖拽微调、参照线标注、节点吸附，并可一键导出 PPT 用于汇报演示。定位为「快速搭、直观看、可拖改」，不追求计划管理的颗粒度（任务分解/前置联动等由 M1 项目进度模块承担）。

- **交互主导**：几乎所有时间元素（进度条两端、条体、节点、参照线）均可鼠标拖拽调整；
- **可视化**：季度+月两级时间轴、白/黑斜纹进度条、6 种节点符号、贯穿轨道的参照线；
- **可交付**：导出 `.pptx`，所有元素为 PPT 原生形状，可继续编辑与拖动；
- **隔离模型**：全部表带 `owner_id`，仅本人可见可改。

---

## 二、信息架构

- **顶部工具栏**：排期标题（可编辑）+ 起止日期（日历选择）+「＋新增参照线」「＋新增轨道」「导出 PPT」；
- **时间轴**：季度（红底）+ 月份（浅红底）两级表头，不足 6 个月自动扩展；
- **主体**：多轨道甘特区——每行 = 左侧标签列（名称/色块/删除/拖拽排序）+ 右侧甘特区（月份背景格 + 箭头直线 + 进度条 + 节点 + 贯穿参照线）；
- **底部栏**：操作提示 + 「共 X 个轨道」统计。

---

## 三、排期管理

1. **创建排期**：顶部「＋ 创建排期」→ 弹窗输入标题 + 起止日期；时间轴按季度+月渲染，跨度不足 6 个月自动向后扩展；
2. **编辑标题**：点击标题进入行内编辑，回车/失焦保存；
3. **调整时间段**：点击「开始/结束」日期字段弹日历，修改后立即保存并整体重排时间轴；
4. **列表加载**：进入页面自动加载最近更新的排期（单排期工作模式）。

---

## 四、轨道管理

1. **新增轨道**：「＋ 新增轨道」→ `prompt` 输入名称 → 创建轨道并**自动生成一条贯穿整个排期的箭头直线**（颜色取轨道色）；
2. **重命名 / 改色**：标签列点击名称行内编辑；点击色块弹 8 色预设调色板；轨道改色会**联动同步该轨道所有箭头直线颜色**；
3. **删除轨道**：标签列「✕」二次确认后删除（级联删除其进度条与节点）；
4. **排序**：标签列整行可拖拽（HTML5 DnD）重排，拖拽后逐个持久化 `sort_order`；
5. **底纹**：标签列带 `label_color` 浅色半透明底纹，便于区分。

---

## 五、进度条

1. **新增入口**：在**轨道甘特区右键**弹出菜单 →「＋ 新增进度条」→ 弹编辑面板（名称/起止/颜色/阴影），保存后生成矩形进度条；
2. **矩形进度条**（`style='bar'`）：
   - 底边贴轨道箭头线（条体 19~31px 区间，箭头线视觉线 31px）；
   - 纯色填充 + 斜纹阴影（阴影样式可编辑：**白色斜纹 / 黑色斜纹 / 纯色**）+ 白色文字标注（加粗居中）；
   - 文字超宽自动省略；
3. **箭头直线**（`style='arrow'`）：轨道主体线（2px），左端圆点 + 右端箭头；
4. **拖拽交互**：
   - 两端把手（14px 热区 + 白色竖条标记）左右拖拽分别调整起止时间；
   - 条体整条拖拽平移（保持工期不变）；
   - 拖拽范围受排期起止限制；
5. **双击编辑**：名称 / 起止 / 颜色 / 样式（矩形↔直线）/ 阴影（白/黑/纯色）；
6. **删除**：编辑面板「删除」按钮；
7. **性能约束**：拖拽中仅做本地乐观更新（不请求后端），松手（mouseup）一次性保存最终值，避免视觉回滞。

---

## 六、关键节点

1. **新增入口**：轨道甘特区**右键菜单** →「＋ 新增节点」→ 弹编辑面板（名称/日期/符号/颜色/文字颜色）；
2. **符号**：圆 / 方块 / 菱形 / 三角 / 五角星 / 旗帜（6 种），SVG 绘制，默认 18×18；
3. **文字标注**：符号下方显示节点名称（颜色可单独配置，默认黑色）；
4. **拖拽**：仅**符号本体（18×18）**可拖拽改日期，文字区域不拦截（容器 `pointerEvents:none`），避免遮挡相邻元素；
5. **层级**：节点永远显示在最上层（`zIndex: 4`），盖过进度条与箭头线；
6. **双击编辑 / 删除**：同新增面板，可改名称/日期/符号/颜色，或删除。

---

## 七、参照线（竖虚线）

1. **新增入口**：顶部「＋ 新增参照线」→ 默认创建在排期中间日期，贯穿所有轨道；
2. **视觉**：垂直虚线（2px dashed）+ 顶部圆形手柄 + 可选标题标注；圆圈与虚线 **SVG 同轴居中**（`cx=6`，容器 `translateX(-50%)` 对齐参照线对称轴）；
3. **拖拽移动**：拖动虚线或手柄左右移动改日期；**拖动范围限制在排期起止时间内**（像素 clamp 到 `dateToPixels(min/maxDate)`）；
4. **节点吸附**：拖拽时实时比对所有轨道关键节点的纵向对称轴位置，**10px 内自动吸附对齐**到该节点日期，吸附时手柄与虚线变橙色高亮；
5. **双击编辑**：名称 / 日期 / 颜色；可删除。

---

## 八、导出 PPT（.pptx）

1. **入口**：「导出 PPT」→ 浏览器下载 `.pptx`（无排期时按钮禁用）；
2. **元素映射**（全部为 PPT 原生形状，可自由拖动/缩放）：

| 前端元素 | PPT 元素 |
|---|---|
| 箭头直线 | 直线 + 右端箭头（`endArrowType`） |
| 矩形进度条 | 纯色矩形 + 45° 白色斜纹 + 居中白字 |
| 关键节点 | 椭圆/矩形/菱形/三角/五角星 + 文字 |
| 参照线 | 垂直虚线（`dashType: "dash"`）+ 标题 |
| 时间轴 | 季度（红底）+ 月份（浅红底）+ **白灰相间格子底板** |

3. **自动成组**（`<p:grpSp>`）：节点符号+文字、进度条+文字+斜纹、时间轴（季度+月份+格子底板）分别组合，打开 PPT 后**点击即整体拖动**；
4. **版式**：16:9（13.33×7.5in）；整体圆角毛玻璃边框 + 轨道名浅色底纹 + 底部统计（共 X 轨道·Y 进度条·Z 节点）；每页最多 11 条轨道，超出自动分页并每页重复标题与时间轴；
5. **实现要点**：pptxgenjs 4.x 不支持组合，生成后 post-process（jszip 解包 → 按形状添加顺序将相关 `<p:sp>` 包进 `<p:grpSp>` → 重打包）；**子形状保持绝对坐标**（`chOff` 仅记录子坐标系原点），避免组合后元素错位。

---

## 九、权限与数据隔离

1. 全部接口经 `requireAuth` 中间件注入 `req.userId`；
2. `quick_schedules` / `quick_schedule_tracks` / `quick_schedule_bars` / `quick_schedule_milestones` / `quick_schedule_vlines` 均含 `owner_id`，纳入全局 `OWNER_TABLES` 启动迁移清单；
3. 所有读写（列表 / 详情 / 更新 / 删除 / 导出）均带 `owner_id` 过滤，用户仅能操作自己的数据；无越权接口。

---

## 十、后端 API 端点

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/quick-schedules` | 排期列表（按更新时间倒序） |
| POST | `/api/quick-schedules` | 创建排期（标题 + 起止） |
| GET | `/api/quick-schedules/:id` | 详情（tracks + bars + milestones + vlines 组装树） |
| PUT | `/api/quick-schedules/:id` | 更新标题 / 起止日期 |
| DELETE | `/api/quick-schedules/:id` | 删除排期（级联子表） |
| POST | `/api/quick-schedules/:id/tracks` | 新增轨道（自动插入贯穿箭头直线） |
| PUT | `/api/quick-schedules/:id/tracks/:trackId` | 更新轨道（标题/颜色/排序，联动箭头线颜色） |
| DELETE | `/api/quick-schedules/:id/tracks/:trackId` | 删除轨道（级联） |
| POST | `/api/quick-schedules/:id/bars` | 新增进度条（style / shadow） |
| PUT | `/api/quick-schedules/:id/bars/:barId` | 更新进度条（起止/颜色/样式/阴影） |
| DELETE | `/api/quick-schedules/:id/bars/:barId` | 删除进度条 |
| POST | `/api/quick-schedules/:id/milestones` | 新增关键节点 |
| PUT | `/api/quick-schedules/:id/milestones/:milestoneId` | 更新关键节点 |
| DELETE | `/api/quick-schedules/:id/milestones/:milestoneId` | 删除关键节点 |
| POST | `/api/quick-schedules/:id/vlines` | 新增参照线 |
| PUT | `/api/quick-schedules/:id/vlines/:vlineId` | 更新参照线（日期/标题/颜色） |
| DELETE | `/api/quick-schedules/:id/vlines/:vlineId` | 删除参照线 |
| GET | `/api/quick-schedules/:id/export/pptx` | 导出 PPT 文件下载 |

---

## 十一、前端组件结构

| 文件/组件 | 职责 |
|---|---|
| `client/src/pages/QuickSchedulePage.jsx` | 排期主页面：数据加载、拖拽编排、右键菜单、对话框编排、导出下载 |
| `TimelineHeader` | 季度 + 月两级时间轴（自适应月宽，ResizeObserver） |
| `ArrowBar` | 箭头直线：两端拖拽起止、整条平移 |
| `RectBar` | 矩形进度条：阴影样式（白/黑/纯色）、两端把手、整条平移 |
| `DraggableMilestone` | 关键节点：符号拖拽（仅符号区域） |
| `DraggableVline` | 参照线：贯穿轨道、拖拽 + 节点吸附、SVG 同轴 |
| `EditBarDialog` | 进度条编辑/新增面板（含样式、阴影选择） |
| `EditMilestoneDialog` | 节点编辑/新增面板 |
| `EditVlineDialog` | 参照线编辑面板 |
| `client/src/api/client.js`（`api.quickSchedules`） | 全部端点封装（含 tracks/bars/milestones/vlines 子资源） |

---

## 十二、数据库表结构

```sql
-- 排期
CREATE TABLE quick_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL DEFAULT 0,
    title TEXT NOT NULL DEFAULT '未命名排期',
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 轨道
CREATE TABLE quick_schedule_tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schedule_id INTEGER NOT NULL REFERENCES quick_schedules(id) ON DELETE CASCADE,
    owner_id INTEGER NOT NULL DEFAULT 0,
    title TEXT NOT NULL DEFAULT '进度条',
    sort_order INTEGER NOT NULL DEFAULT 0,
    label_color TEXT DEFAULT '#1565C0',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 进度条（含箭头直线）
CREATE TABLE quick_schedule_bars (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schedule_id INTEGER NOT NULL REFERENCES quick_schedules(id) ON DELETE CASCADE,
    track_id INTEGER NOT NULL REFERENCES quick_schedule_tracks(id) ON DELETE CASCADE,
    owner_id INTEGER NOT NULL DEFAULT 0,
    title TEXT NOT NULL DEFAULT '',
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    color TEXT DEFAULT '#1565C0',
    style TEXT DEFAULT 'bar',        -- 'bar' 矩形进度条 / 'arrow' 箭头直线
    shadow TEXT DEFAULT 'white',     -- 'white' 白斜纹 / 'black' 黑斜纹 / 'none' 纯色
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 关键节点
CREATE TABLE quick_schedule_milestones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schedule_id INTEGER NOT NULL REFERENCES quick_schedules(id) ON DELETE CASCADE,
    track_id INTEGER NOT NULL REFERENCES quick_schedule_tracks(id) ON DELETE CASCADE,
    bar_id INTEGER REFERENCES quick_schedule_bars(id) ON DELETE SET NULL,
    owner_id INTEGER NOT NULL DEFAULT 0,
    title TEXT NOT NULL DEFAULT '',
    date TEXT NOT NULL,
    symbol TEXT DEFAULT 'circle',    -- circle/square/diamond/triangle/star/flag
    color TEXT DEFAULT '#D32F2F',
    text_color TEXT DEFAULT '#000000',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 参照线
CREATE TABLE quick_schedule_vlines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schedule_id INTEGER NOT NULL REFERENCES quick_schedules(id) ON DELETE CASCADE,
    owner_id INTEGER NOT NULL DEFAULT 0,
    title TEXT NOT NULL DEFAULT '',
    date TEXT NOT NULL,
    color TEXT DEFAULT '#D32F2F',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
);
```

---

## 十三、全局开发约束

1. 沿用 Vite 8 兼容规范：禁用 `@mui/icons-material`（图标用 Unicode/SVG 内联）；
2. **拖拽性能**：`mousemove` 期间不请求后端，仅本地乐观更新，松手一次性保存；
3. **坐标基准**：参照线等跨容器绝对定位元素需叠加 `LABEL_WIDTH`（160px）偏移对齐甘特内容区（历史踩坑点）；
4. **PPT 导出**：pptxgenjs + jszip post-process 实现 `<p:grpSp>` 成组；子形状必须保持绝对坐标；
5. 时间轴月份不足 6 个月自动扩展；月份过多时月标签降级为纯数字显示；
6. 所有异常统一中文提示，前端友好展示。

---

## 十四、已知边界与后续可扩展

1. **Excel 导出未做**：当前仅 PPT；后续可按「日期列 + 单元格填色」+ 条件格式联动日期实现 Excel 甘特；
2. **单排期工作模式**：当前页面仅展示最近一个排期；后续可扩展排期列表切换 / 多版本管理；
3. **吸附对象单一**：参照线吸附仅对关键节点；后续可扩展吸附进度条端点 / 其他参照线；
4. **PPT 斜纹近似**：PPT 无原生图案填充，斜纹用 45° 半透明细条叠加近似，不百分百复刻前端；
5. **无项目关联**：排期为独立工具数据；后续可挂接到具体项目（如 M1 项目计划）双向引用；
6. **无协作/分享**：单用户私有数据；后续按多用户推广形态评估只读分享链接。
