import * as XLSX from "xlsx";
import { mapScheduleMatrix, mapForgeTemplate } from "./scheduleMapping";

// 解析本地 Excel 文件为排期任务
// mode:
//  - "excel"（默认）：通用导入，模糊识别表头，自动区分阶段/节点/普通任务
//  - "forge-template"：识别 Forge 导出的带公式 Excel，剥离 └ 缩进、按任务类型列精确还原层级
export async function parseScheduleExcel(file, mode = "excel") {
  const buf = await file.arrayBuffer();
  let wb;
  try {
    wb = XLSX.read(buf, { type: "array" });
  } catch (e) {
    throw new Error("文件解析失败：请确认是有效的 .xlsx / .xls 文件");
  }
  if (!wb.SheetNames.length) throw new Error("文件为空，未找到工作表");
  const ws = wb.Sheets[wb.SheetNames[0]];
  // raw: true → 返回原始值（数字=日期序列号、字符串=文本），避免 locale 格式化导致日期乱序
  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true });
  if (!matrix.length) throw new Error("文件无数据");

  if (mode === "forge-template") {
    const result = mapForgeTemplate(matrix);
    if (!result.isForgeTemplate) {
      throw new Error(result.warnings?.[0] || "该文件不是 Forge 导出的排期模板");
    }
    if (!result.tasks.length) {
      throw new Error("模板未包含任何任务行");
    }
    return { tasks: result.tasks, unmatched: result.unmatched, warnings: result.warnings };
  }

  const { tasks, unmatched, warnings } = mapScheduleMatrix(matrix);
  if (!tasks.length) {
    throw new Error(
      `未识别到任何任务行。文件表头为：[${unmatched.join("、") || "空"}]，请至少包含「任务」列。`
    );
  }
  return { tasks, unmatched, warnings };
}
