# M4 — 物料管理模块详细 PRD

> **关联顶层 PRD**: `docs/PRD.md` v2.0  
> **开发优先级**: ④  
> **依赖**: M1 项目进度模块  
> **实现状态**: ✅ 已完成（2026-07-17）

---

## 一、模块核心定位

实现硬件项目物料全生命周期管理，支持 **Excel 批量导入 + 手动单行添加 + OA 采购申请一键导入** 三种模式数据录入，覆盖物料全字段编辑、状态流转、批量操作、导入导出、搜索过滤全流程，所有操作实时持久化存储。

---

## 二、表格基础规范

1. **固定列顺序**（从左至右）：☑ 复选框、序号、物料号、厂家、物料型号、物料状态、数量、采购时间、采购周期、预计交期、备注；
2. **全表所有列**均支持升序 / 降序排序（含物料状态列），点击列头切换排序方向，▲/▼ 可视化标识；
3. **所有列支持手动拖拽调整列宽**，拖拽把手在列头右侧（hover 高亮），列宽持久化至 localStorage；
4. **行底色标记**：右键 → 7 色预设（浅蓝/绿/黄/红/紫/灰），清除底色恢复默认，localStorage 持久化；
5. **表头单行均匀显示**：`whiteSpace: nowrap` + 统一 `fontSize: 0.8rem`。

---

## 三、Excel 批量导入

1. 入口：工具栏「📥 导入 Excel」按钮，仅支持 `.xlsx` / `.xls`；
2. **列名智能识别映射**：

| Excel 列名（兼容值） | 系统字段 |
|---|---|
| 序号 / seq / no | seq（忽略，后端重排） |
| 物料编号 / 料号 / 编号 / part_no | part_number |
| 厂家 / 供应商 / 品牌 / manufacturer | manufacturer |
| 型号配置 / 物料描述 / 型号 / 规格 / model | model |
| 物料状态 / 状态 / status | material_status |
| 数量 / 总数量 / quantity / qty | quantity |
| 单套用量 / 单套数量 | quantity_per_set |
| 套数 / 总套数 | set_count |
| 采购时间 / 采购日期 | purchase_date |
| 采购周期 / 周期 | lead_time |
| 预计交期 / 交期 | expected_delivery |
| 备注 / 说明 / notes | notes |

3. 预览确认：解析后弹窗展示前 50 行 + 未匹配列提示 + 数据异常定位；
4. 批量写入：自动分配连续序号，与现有表格无缝衔接；
5. 异常处理：解析失败/列名无匹配/格式错误时精准定位错误行。

---

## 四、手动添加

1. 入口：工具栏「＋ 添加一行」按钮，表格末尾插入新行；
2. 默认 `material_status` = 「默认」；
3. 新行插入后自动聚焦物料号列，支持连续快速添加。

---

## 五、物料状态列

1. **五种状态**，统一深色字体 + 彩色背景 + border 描边：

| 状态 | 文字颜色 | 背景色 | border | 说明 |
|---|---|---|---|---|
| 默认 | #8c8c8c | #f5f5f5 | #d9d9d9 | 新物料初始状态 |
| 已入库 | #003a70 | #d6e4ff | #91caff | 已到货入库 |
| 已下单 | #237804 | #d9f7be | #95de64 | 已下采购单 |
| 待决策 | #ad6800 | #fff7e6 | #ffd591 | 待评审确认 |
| 高风险 | #a8071a | #fff1f0 | #ffa39e | 延期/断供风险 |

2. 交互：点击彩色 Chip → Dropdown 菜单（5 选项均带色块预览，黑色字体）→ 选中立即更新无需保存。

---

## 六、全表格内联编辑

1. 所有可编辑单元格点击进入编辑态（高亮）；
2. 失焦/回车自动保存，Esc 取消恢复原值；
3. Tab 横向跳转、Shift+Tab 回跳，全键盘导航；
4. 字段适配：文本→TextField、数字→number 输入框、日期→DatePicker（中文月份、快捷今日）；
5. **预计交期自动计算**：采购时间 + 采购周期 → 自动推算 `expected_delivery`（前端 handleSave + 后端 normalize 双保险）。

---

## 七、行选择与批量操作

1. 首列 checkbox，支持单行/全选/反选；
2. 选中任意行后顶部蓝色 Alert 批量工具栏：批量修改状态、批量删除、导出选中；
3. 高风险操作二次确认弹窗。

---

## 八、撤销导入

1. 每次 Excel 批量导入成功后工具栏临时显示「↩ 撤销导入」按钮；
2. 5 分钟倒计时，页面刷新后仍可用；
3. 二次导入覆盖上一次快照，仅支持撤销最近一次。

---

## 九、导出 Excel

1. 入口：「↓ 导出」按钮，导出全量/选中量；
2. 包含全字段列，保留状态颜色标识（exceljs）。

---

## 十、搜索过滤

1. 搜索框实时模糊过滤，范围覆盖：物料号/厂家/型号/状态/备注；
2. 无匹配时友好空状态提示。

---

## 十一、右键菜单

1. 右键任意行弹出上下文菜单，支持：
   - 修改厂家/物料状态/数量/采购时间/采购周期/预计交期/备注
   - 表格底色（7 色）
   - 删除
2. 多选行后右键 → 批量修改/删除全部选中行；
3. 状态字段直接展示彩色选项按钮，无需手工输入。

---

## 十二、OA 采购申请一键导入

1. **提取策略**：遍历 OA 页面 DOM 的 `<table>` → 列头智能匹配 → 每行提取物料数据；
2. **字段映射**：物料编号→part_number, 厂家→manufacturer, 型号配置/物料描述→model, 数量→quantity, 单价→_price, 金额→_amount；
3. **表单字段**：申请日期→purchase_date（label→input_field→input.value），内部立项号→order_number（同上）；
4. **状态**：OA 导入默认「已下单」（已提采购申请）；
5. **项目匹配**：按 order_number 查项目表，命中→导入对应项目，未命中→入 PM「项目管理部日常工作」项目；
6. **三种使用方式**：
   - Chrome 扩展：`chrome-extension/`（点击图标注入脚本，推荐）；
   - 书签浮窗：拖 `scripts/oa-bookmarklet.txt` 到书签栏；
   - Console 脚本：`scripts/oa-import-bookmarklet.js`。
7. **后端端点**：`POST /api/materials/oa-import`（跨域 CORS，浏览器直接提交）。

---

## 十三、全局开发约束

1. 所有操作完成后页面固定当前滚动位置；
2. 序号列新增/删除后自动全局重排，保证无断档无重复；
3. 所有数据修改/导入做合法性校验，异常场景友好提示；
4. **Vite 8 兼容禁止项**：
   - 禁止使用 `@mui/icons-material`（CJS exports.default 解析异常→React #130），已全量替换为 Unicode；
   - `@mui/x-date-pickers` 子路径需 `vite.config.js` alias 守护。

---

## 十四、数据库表结构

```sql
CREATE TABLE materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL DEFAULT 0,
    part_number TEXT DEFAULT '',
    manufacturer TEXT DEFAULT '',
    model TEXT DEFAULT '',
    material_status TEXT DEFAULT '已下单',
    quantity REAL DEFAULT 0,
    purchase_date TEXT,
    lead_time INTEGER,
    expected_delivery TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE material_import_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    ids_json TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now','localtime'))
);
```
