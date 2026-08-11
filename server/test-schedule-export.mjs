// 验证 scheduleExport.js 4 项导出需求：
// 1) 甘特图 sheet（月单位）2) 无完成情况列 3) 顶层任务同色底纹+加粗 4) 阶段任务加粗
import ExcelJS from "exceljs";
import { buildScheduleWorkbook } from "./src/utils/scheduleExport.js";

// 构造任务树（含阶段/叶子/子阶段/顶层普通任务）
const T = [
  { id: 1, parent_id: null, task_order: 1, name: "阶段一：方案设计", task_type: "阶段任务", depth: 0, planned_start: "2026-01-05", planned_end: "2026-03-31", duration_days: 86, predecessor_ids: "[]" },
  { id: 2, parent_id: 1, task_order: 1, name: "需求调研", task_type: "普通任务", depth: 1, planned_start: "2026-01-05", planned_end: "2026-01-30", duration_days: 26, predecessor_ids: "[]" },
  { id: 3, parent_id: 1, task_order: 2, name: "方案评审", task_type: "节点任务", depth: 1, planned_start: "2026-02-02", planned_end: "2026-02-02", duration_days: 1, predecessor_ids: "[2]" },
  { id: 4, parent_id: 1, task_order: 3, name: "子阶段：详细设计", task_type: "阶段任务", depth: 1, planned_start: "2026-02-09", planned_end: "2026-03-31", duration_days: 51, predecessor_ids: "[]" },
  { id: 5, parent_id: 4, task_order: 1, name: "原理图设计", task_type: "普通任务", depth: 2, planned_start: "2026-02-09", planned_end: "2026-03-06", duration_days: 26, predecessor_ids: "[]" },
  { id: 6, parent_id: 4, task_order: 2, name: "PCB Layout", task_type: "普通任务", depth: 2, planned_start: "2026-03-09", planned_end: "2026-03-31", duration_days: 23, predecessor_ids: "[5]" },
  { id: 7, parent_id: null, task_order: 2, name: "结构打样跟进", task_type: "普通任务", depth: 0, planned_start: "2026-04-01", planned_end: "2026-05-15", duration_days: 45, predecessor_ids: "[4]" },
  { id: 8, parent_id: null, task_order: 3, name: "阶段二：验证", task_type: "阶段任务", depth: 0, planned_start: "2026-05-18", planned_end: "2026-06-30", duration_days: 44, predecessor_ids: "[]" },
  { id: 9, parent_id: 8, task_order: 1, name: "样机测试", task_type: "普通任务", depth: 1, planned_start: "2026-05-18", planned_end: "2026-06-12", duration_days: 26, predecessor_ids: "[]" },
  { id: 10, parent_id: 8, task_order: 2, name: "认证预检", task_type: "普通任务", depth: 1, planned_start: "2026-06-15", planned_end: "2026-06-30", duration_days: 16, predecessor_ids: "[9]" },
];

const workbook = await buildScheduleWorkbook(T, { name: "测试项目", code: "P-TEST" });
const buf = await workbook.xlsx.writeBuffer();

// 读回验证
const wb = new ExcelJS.Workbook();
await wb.xlsx.load(buf);

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
  ok ? pass++ : fail++;
};

// 1) 两个 sheet + 甘特图名
check("workbook 含 2 个 sheet", wb.worksheets.length === 2, `实际 ${wb.worksheets.length} 个`);
const s1 = wb.getWorksheet("项目排期表");
const s2 = wb.getWorksheet("甘特图（月）");
check("sheet2 名为 甘特图（月）", !!s2);
check("sheet 顺序：排期表在前", s1 && wb.worksheets[0].name === "项目排期表");
check("sheet 顺序：甘特图在后", s2 && wb.worksheets[1].name === "甘特图（月）");

// 2) 排期表无「完成情况」列
const headers = [];
s1.getRow(1).eachCell((c) => headers.push(c.value));
check("无「完成情况」列", !headers.includes("完成情况"), `表头: ${headers.join("|")}`);
check("仍保留「任务类型」列", headers.includes("任务类型"));
check("仍保留「前置任务」列", headers.includes("前置任务"));

// 3) 顶层任务（depth 0）同色底纹 + 加粗
// 行序同 tasks：顶层 = 任务1(行2), 7(行8), 8(行9)
const topFills = new Set();
[2, 8, 9].forEach((r) => {
  const cell = s1.getCell(r, 1); // A 列（序号）
  if (cell.fill && cell.fill.fgColor) topFills.add(cell.fill.fgColor.argb);
});
check("顶层任务均带底纹", topFills.size === 1 && [...topFills][0] === "FFFFF3E0", `颜色: ${[...topFills]}`);
check("顶层任务文字加粗", s1.getCell(2, 2).font.bold === true && s1.getCell(8, 2).font.bold === true);

// 4) 阶段任务加粗（行 2 阶段一、行 5 子阶段、行 9 阶段二）
check("阶段任务(行2)加粗", s1.getCell(2, 2).font.bold === true);
check("子阶段(行5)加粗", s1.getCell(5, 2).font.bold === true);
check("阶段任务(行9)加粗", s1.getCell(9, 2).font.bold === true);
// 叶子任务不加粗（行3 需求调研）
check("叶子任务不加粗", s1.getCell(3, 2).font.bold !== true);

// 甘特图验证
const gHeaders = [];
s2.getRow(1).eachCell((c) => gHeaders.push(c.value));
const monthCols = gHeaders.filter((h) => typeof h === "string" && /^\d{4}-\d{2}$/.test(h));
check("甘特图表头含月份轴", monthCols.length >= 6, `共 ${monthCols.length} 个月: ${monthCols[0]}..${monthCols[monthCols.length - 1]}`);
check("甘特图月份从 2026-01 起", monthCols[0] === "2026-01");
check("甘特图月份到 2026-06 止", monthCols[monthCols.length - 1] === "2026-06");
// 阶段任务(行2 阶段一: 1月~3月)色块 = 深蓝
const phaseFill = s2.getCell(2, 6).fill;
check("阶段任务色块深蓝", phaseFill && phaseFill.fgColor && phaseFill.fgColor.argb === "FF1976D2", phaseFill && phaseFill.fgColor ? phaseFill.fgColor.argb : "无填充");
// 叶子任务(行3 需求调研: 1月)色块 = 浅蓝
const leafFill = s2.getCell(3, 6).fill;
check("叶子任务色块浅蓝", leafFill && leafFill.fgColor && leafFill.fgColor.argb === "FF90CAF9", leafFill && leafFill.fgColor ? leafFill.fgColor.argb : "无填充");
// 阶段任务行加粗（甘特图 sheet）
check("甘特图阶段行加粗", s2.getRow(2).getCell(2).font.bold === true);
// 顶层普通任务(行8 结构打样: 4月~5月)应有色块（浅蓝）
let topLeaf = false;
for (let c = 6; c <= s2.columnCount; c++) {
  const f = s2.getCell(8, c).fill;
  if (f && f.fgColor && f.fgColor.argb === "FF90CAF9") { topLeaf = true; break; }
}
check("顶层普通任务有色块", topLeaf);

console.log(`\n===== ${pass} PASS / ${fail} FAIL =====`);
process.exit(fail ? 1 : 0);
