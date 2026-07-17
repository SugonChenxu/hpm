import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { statusStyle } from "./materialStatus";

// ===== 列名智能识别映射（兼容中英文常见列名） =====
const FIELD_ALIASES = [
  ["material_status", ["物料状态", "状态", "status", "materialstatus"]],
  ["manufacturer", ["厂家", "供应商", "品牌", "manufacturer"]],
  ["model", ["物料型号", "型号", "规格", "model"]],
  ["part_number", ["物料号", "料号", "编号", "partnumber", "part_no", "partno"]],
  ["quantity", ["数量", "总数量", "quantity", "qty"]],
  ["quantity_per_set", ["单套用量", "单套数量", "quantityperset"]],
  ["set_count", ["套数", "总套数", "setcount"]],
  ["purchase_date", ["采购时间", "采购日期", "purchasedate", "purchase_date"]],
  ["lead_time", ["采购周期", "周期", "leadtime", "lead_time"]],
  [
    "expected_delivery",
    ["预计交期", "交期", "expecteddelivery", "expected_delivery", "planneddelivery", "delivery"],
  ],
  ["notes", ["备注", "说明", "notes"]],
  ["seq_ignore", ["序号", "seq", "no"]], // 序号由后端重新分配，忽略但允许存在
];

function norm(s) {
  return String(s == null ? "" : s).trim().toLowerCase().replace(/\s+/g, "");
}

function buildFieldMap(headers) {
  const map = {}; // systemField -> headerColIndex
  const unmatched = [];
  headers.forEach((h, i) => {
    const hn = norm(h);
    if (!hn) return;
    let found = null;
    for (const [field, aliases] of FIELD_ALIASES) {
      if (aliases.map(norm).includes(hn)) {
        found = field;
        break;
      }
    }
    if (found && found !== "seq_ignore") map[found] = i;
    else if (!found) unmatched.push(h);
  });
  return { map, unmatched };
}

function toNum(v) {
  if (v === null || v === undefined || v === "") return { value: 0, ok: true };
  const n = Number(String(v).replace(/[, ]/g, ""));
  if (!Number.isFinite(n)) return { value: 0, ok: false };
  return { value: n, ok: true };
}

function toDateStr(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") {
    // Excel 序列号（1900 日期系统）
    if (v > 20000 && v < 80000) {
      const d = new Date((v - 25569) * 86400 * 1000);
      return d.toISOString().slice(0, 10);
    }
    return String(v);
  }
  const s = String(v).trim();
  const m = s.match(/(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/);
  if (m) {
    const y = m[1];
    const mo = m[2].padStart(2, "0");
    const d = m[3].padStart(2, "0");
    return `${y}-${mo}-${d}`;
  }
  return s.slice(0, 10) || s;
}

/**
 * 解析 Excel 文件为物料数据
 * @returns {Promise<{items:Array, preview:Array, errors:Array, matched:string[], unmatched:string[]}>}
 */
export async function parseMaterialExcel(file) {
  const buf = await file.arrayBuffer();
  let wb;
  try {
    wb = XLSX.read(buf, { type: "array" });
  } catch (e) {
    throw new Error("文件解析失败：请确认是有效的 .xlsx / .xls 文件");
  }
  if (!wb.SheetNames.length) throw new Error("文件为空，未找到工作表");
  const ws = wb.Sheets[wb.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
  if (!matrix.length) throw new Error("文件无数据");

  const headers = matrix[0].map((h) => (h == null ? "" : String(h)));
  const { map, unmatched } = buildFieldMap(headers);
  if (!Object.keys(map).length) {
    throw new Error(
      `未识别到任何有效列。文件表头为：[${headers.filter(Boolean).join("、")}]，请检查列名是否与物料字段匹配。`
    );
  }

  const items = [];
  const errors = [];
  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row || row.every((c) => c === "" || c == null)) continue; // 跳过空行
    const raw = {};
    for (const [field, col] of Object.entries(map)) {
      raw[field] = row[col];
    }
    const item = {
      part_number: raw.part_number != null ? String(raw.part_number) : "",
      manufacturer: raw.manufacturer != null ? String(raw.manufacturer) : "",
      model: raw.model != null ? String(raw.model) : "",
      material_status: raw.material_status || "默认",
      notes: raw.notes != null ? String(raw.notes) : "",
      purchase_date: toDateStr(raw.purchase_date),
      expected_delivery: toDateStr(raw.expected_delivery),
    };
    // 数值字段校验
    const numFields = ["quantity", "quantity_per_set", "set_count", "lead_time"];
    numFields.forEach((f) => {
      const res = toNum(raw[f]);
      item[f] = res.value;
      if (!res.ok) {
        errors.push({ row: r + 1, field: f, message: `「${f}」值「${raw[f]}」不是有效数字` });
      }
    });
    // 物料号缺失提示（非阻断）
    if (!item.part_number) {
      errors.push({ row: r + 1, field: "part_number", message: "物料号缺失" });
    }
    items.push(item);
  }

  return {
    items,
    preview: items.slice(0, 50),
    errors,
    matched: Object.keys(map),
    unmatched,
  };
}

function hexToArgb(hex) {
  const h = hex.replace("#", "");
  return "FF" + h.toUpperCase();
}

/**
 * 导出物料清单为 .xlsx（保留状态颜色）
 */
export async function exportMaterialsExcel(rows, fileName = "物料清单.xlsx") {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("物料清单");
  const headers = ["序号", "物料号", "厂家", "物料型号", "物料状态", "数量", "采购时间", "采购周期", "预计交期", "备注"];
  ws.columns = headers.map((h) => ({ header: h, width: 16 }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { vertical: "middle", horizontal: "center" };

  rows.forEach((r, i) => {
    const row = ws.addRow([
      i + 1,
      r.part_number || "",
      r.manufacturer || "",
      r.model || "",
      r.material_status || "默认",
      r.quantity != null ? r.quantity : "",
      r.purchase_date || "",
      r.lead_time != null ? r.lead_time : "",
      r.expected_delivery || "",
      r.notes || "",
    ]);
    const st = statusStyle(r.material_status);
    const cell = row.getCell(5);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: hexToArgb(st.bg) } };
    cell.font = { color: { argb: hexToArgb(st.color) }, bold: true };
    cell.alignment = { horizontal: "center" };
  });

  const buf = await wb.xlsx.writeBuffer();
  saveAs(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    fileName
  );
}
