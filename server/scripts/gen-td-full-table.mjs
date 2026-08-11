// 生成 Forge 项目排期「完整表」（Forge 导出格式：序号/任务名称/任务类型/开始时间/完成时间/工期/前置任务/备注）
// 保留公式关系：完成时间 = 开始+工期-1；阶段任务 开始=MIN(子孙开始)/完成=MAX(子孙完成)；有前置叶子 开始=MAX(前置完成)+1
// 用法: node server/scripts/gen-td-full-table.mjs <projectId> > 输出.json
// 输出: { sheet_id(占位由调用方填), values: [ {row,col,value_type,number_value|string_value|formula} ] }
import db from "../src/db.js";

const projectId = Number(process.argv[2] || 0);
if (!projectId) { console.error("usage: node gen-td-full-table.mjs <projectId>"); process.exit(1); }

const proj = db.prepare("SELECT id, name, code FROM projects WHERE id = ?").get(projectId);
if (!proj) { console.error("project not found"); process.exit(1); }

const all = db.prepare("SELECT * FROM schedule_tasks WHERE project_id = ?").all(projectId);

// 树序排序（父→子→兄弟，与导出一致）
const childrenMap = new Map();
for (const t of all) {
  const pid = t.parent_id || 0;
  if (!childrenMap.has(pid)) childrenMap.set(pid, []);
  childrenMap.get(pid).push(t);
}
for (const [, ch] of childrenMap) ch.sort((a, b) => a.task_order - b.task_order);
const tasks = [];
(function traverse(pid, depth) {
  for (const c of childrenMap.get(pid) || []) { tasks.push({ ...c, depth }); traverse(c.id, depth + 1); }
})(0, 0);

const toSerial = (d) => {
  if (!d || typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const [y, m, dd] = d.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, dd) / 86400000) + 25569;
};
const colLetter = (c) => "ABCDEFGH"[c] || "?";
const excelRow = (r0) => r0 + 1; // 0-based 行 → Excel 1-based 行号

// id -> 任务
const byId = new Map(tasks.map((t) => [t.id, t]));
// id -> 表内数据行号（0-based，表头占第 0 行，数据从第 1 行起）
const rowOf = new Map(tasks.map((t, i) => [t.id, i + 1]));

// 递归收集阶段任务的全部叶子子孙（非阶段任务）
function collectLeafTasks(phaseId) {
  const out = [];
  const stack = [phaseId];
  while (stack.length) {
    const cur = stack.pop();
    const kids = childrenMap.get(cur) || [];
    for (const k of kids) {
      if (k.task_type !== "阶段任务") out.push(k);
      else stack.push(k.id);
    }
  }
  return out;
}

const values = [];
const put = (row, col, v) => {
  if (v === null || v === undefined) return;
  values.push({ row, col, ...v });
};
const NUM = (n) => ({ value_type: "NUMBER", number_value: n });
const STR = (s) => ({ value_type: "STRING", string_value: String(s) });
const FML = (f) => ({ value_type: "FORMULA", formula: f });

// 表头（Forge 导出格式 8 列）
const HEADERS = ["序号", "任务名称", "任务类型", "开始时间", "完成时间", "工期", "前置任务", "备注"];
HEADERS.forEach((h, c) => put(0, c, STR(h)));

// 数据行
tasks.forEach((t, i) => {
  const r = i + 1; // 0-based 表内行
  const xr = excelRow(r); // Excel 行号（公式引用用）
  const indent = "  ".repeat(t.depth || 0);
  const cleanName = String(t.name || "").replace(/^(\s*)(└\s)?/, "");
  const displayName = indent + (t.depth > 0 ? "└ " : "") + cleanName;
  const isPhase = t.task_type === "阶段任务";

  let preds = [];
  try { preds = JSON.parse(t.predecessor_ids || "[]"); } catch { preds = []; }
  const predRows = preds.map((pid) => rowOf.get(pid)).filter((x) => x != null);

  put(r, 0, NUM(t.task_order));
  put(r, 1, STR(displayName));
  put(r, 2, STR(t.task_type || "普通任务"));
  put(r, 5, NUM(Number(t.duration_days) || 1));
  put(r, 6, STR(
    preds.map((pid) => byId.get(pid)?.name || "").filter(Boolean).join("、")
  ));
  put(r, 7, STR(t.notes || ""));

  const startSerial = toSerial(t.planned_start);
  const endSerial = toSerial(t.planned_end);

  if (isPhase) {
    // 阶段：开始 = MIN(子孙叶子开始)，完成 = MAX(子孙叶子完成)
    const leaves = collectLeafTasks(t.id);
    const leafRows = leaves.map((l) => rowOf.get(l.id)).filter((x) => x != null);
    if (leafRows.length > 0) {
      const sRefs = leafRows.map((lr) => `D${excelRow(lr)}`).join(",");
      const eRefs = leafRows.map((lr) => `E${excelRow(lr)}`).join(",");
      put(r, 3, FML(`=MIN(${sRefs})`));
      put(r, 4, FML(`=MAX(${eRefs})`));
    } else {
      // 无子孙兜底：静态日期
      if (startSerial != null) put(r, 3, NUM(startSerial));
      if (endSerial != null) put(r, 4, NUM(endSerial));
    }
  } else {
    // 叶子任务
    if (predRows.length > 0) {
      // 开始 = MAX(各前置完成)+1（有前置）
      const eRefs = predRows.map((pr) => `E${excelRow(pr)}`).join(",");
      put(r, 3, FML(`=MAX(${eRefs})+1`));
    } else if (startSerial != null) {
      put(r, 3, NUM(startSerial));
    }
    // 完成 = 开始 + 工期 - 1
    put(r, 4, FML(`=D${xr}+F${xr}-1`));
  }
});

console.log(JSON.stringify({
  project: proj,
  taskCount: tasks.length,
  values,
}));
