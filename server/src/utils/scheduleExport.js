import ExcelJS from "exceljs";

/**
 * 构建「项目排期表」Excel 工作簿（含日期联动公式）。
 *
 * 设计要点（与 Forge 后端计算规则保持一致）：
 *  1. 工期按「不含首尾的天数」计（工期 = 结束 - 开始），因此 完成时间 = 开始时间 + 工期。
 *  2. 有前置依赖的叶子任务：开始时间 = MAX(各前置任务完成时间) + 1（多重依赖取最晚）。
 *  3. 阶段任务（汇总行）：开始时间 = MIN(其叶子子孙的开始时间)，
 *     完成时间 = MAX(其叶子子孙的完成时间)。
 *  4. 所有日期以真实 Excel 日期序列号写入，并写入缓存结果；同时设置
 *     fullCalcOnLoad，确保用 Excel/WPS 打开时重新计算，公式联动生效。
 *  5. 额外导出「任务类型」列（阶段任务/普通任务/节点任务），使导出的 Excel
 *     可被「模板导入」精确还原层级与里程碑，实现反灌。
 *
 * @param {Array} tasks 已附带 completion_status / depth 的任务树（扁平、按展示顺序）
 * @param {Object} project 项目对象（用于可能的扩展）
 * @returns {Promise<ExcelJS.Workbook>}
 */
export async function buildScheduleWorkbook(tasks, project) {
  const workbook = new ExcelJS.Workbook();
  // 打开文件时强制整表重算，保证公式结果最新
  workbook.calcProperties = { fullCalcOnLoad: true };

  const sheet = workbook.addWorksheet("项目排期表");

  // 列布局（含「任务类型」列，便于反灌时精确还原阶段/节点；不含完成情况列）
  const COL = {
    order: 1,
    name: 2,
    type: 3,
    start: 4,
    end: 5,
    duration: 6,
    pred: 7,
    notes: 8,
  };
  const colL = (n) => String.fromCharCode(64 + n); // 1->A ... 8->H
  const startCol = colL(COL.start); // D
  const endCol = colL(COL.end); // E
  const durCol = colL(COL.duration); // F

  sheet.columns = [
    { header: "序号", key: "order", width: 8 },
    { header: "任务名称", key: "name", width: 30 },
    { header: "任务类型", key: "type", width: 10 },
    { header: "开始时间", key: "start", width: 14 },
    { header: "完成时间", key: "end", width: 14 },
    { header: "工期", key: "duration", width: 8 },
    { header: "前置任务", key: "predecessors", width: 20 },
    { header: "备注", key: "notes", width: 20 },
  ];

  // task id -> Excel 行号（数据自第 2 行起）
  const taskRowMap = new Map();
  tasks.forEach((t, i) => taskRowMap.set(t.id, i + 2));

  // parent_id -> 子任务列表（用于阶段任务聚合子孙）
  const childrenMap = new Map();
  tasks.forEach((t) => {
    if (t.parent_id != null) {
      if (!childrenMap.has(t.parent_id)) childrenMap.set(t.parent_id, []);
      childrenMap.get(t.parent_id).push(t);
    }
  });

  // 收集某阶段任务的全部「叶子子孙」行号（递归穿透子阶段，不含阶段自身）
  function collectLeafRows(phaseId) {
    const rows = [];
    const visited = new Set();
    const stack = [phaseId];
    while (stack.length) {
      const cur = stack.pop();
      const kids = childrenMap.get(cur) || [];
      for (const k of kids) {
        if (k.task_type !== "阶段任务") {
          const rn = taskRowMap.get(k.id);
          if (rn) rows.push(rn);
        } else if (!visited.has(k.id)) {
          visited.add(k.id);
          stack.push(k.id);
        }
      }
    }
    return rows;
  }

  // "YYYY-MM-DD" -> Excel 1900 日期序列号
  const toSerial = (s) => {
    if (!s || typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const [y, m, d] = s.split("-").map(Number);
    return Math.round(Date.UTC(y, m - 1, d) / 86400000) + 25569;
  };
  // "YYYY-MM-DD" -> JS Date（UTC 午夜，避免本地时区漂移）
  const dateToValue = (s) => {
    const ser = toSerial(s);
    if (ser == null) return null;
    const [y, m, d] = s.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  };

  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    const rowNum = i + 2;

    let predNames = "";
    let predIds = [];
    try {
      predIds = JSON.parse(t.predecessor_ids || "[]");
      predNames = predIds
        .map((pid) => tasks.find((tt) => tt.id === pid))
        .filter(Boolean)
        .map((p) => p.name)
        .join("、");
    } catch {
      predNames = "";
    }

    const durationVal = t.duration_days || 1;
    const indent = "  ".repeat(t.depth || 0);
    // 先剥离名字中可能已存在的「└ 」/前导空格（避免历史数据或重复导出时前缀累积），
    // 再按规范拼接待导出层级前缀，保证导出幂等、反灌后名称干净。
    const cleanSrcName = String(t.name).replace(/^(\s*)(└\s)?/, "");
    const displayName = indent + (t.depth > 0 ? "└ " : "") + cleanSrcName;
    const typeVal = t.task_type || "普通任务";

    const rowValues = [
      t.task_order,
      displayName,
      typeVal,
      null, // 开始时间（下方填充）
      null, // 完成时间（下方填充）
      durationVal,
      predNames,
      t.notes || "",
    ];
    sheet.addRow(rowValues);

    const startCell = sheet.getCell(rowNum, COL.start);
    const endCell = sheet.getCell(rowNum, COL.end);
    startCell.numFmt = "yyyy-mm-dd";
    endCell.numFmt = "yyyy-mm-dd";

    const isPhase = t.task_type === "阶段任务";
    const startSerial = toSerial(t.planned_start);
    const endSerial = toSerial(t.planned_end);

    if (isPhase) {
      // 阶段任务：开始 = MIN(叶子子孙开始)，完成 = MAX(叶子子孙完成)
      const leafRows = collectLeafRows(t.id);
      if (leafRows.length > 0) {
        const leafTasks = leafRows.map((r) => tasks[r - 2]).filter(Boolean);
        const cRefs = leafRows.map((r) => `${startCol}${r}`).join(",");
        const dRefs = leafRows.map((r) => `${endCol}${r}`).join(",");
        const minStart = Math.min(
          ...leafTasks.map((lt) => toSerial(lt.planned_start)).filter((x) => x != null)
        );
        const maxEnd = Math.max(
          ...leafTasks.map((lt) => toSerial(lt.planned_end)).filter((x) => x != null)
        );
        startCell.value = {
          formula: `=MIN(${cRefs})`,
          result: isFinite(minStart) ? minStart : undefined,
        };
        endCell.value = {
          formula: `=MAX(${dRefs})`,
          result: isFinite(maxEnd) ? maxEnd : undefined,
        };
      } else if (startSerial != null) {
        // 兜底：阶段无子孙时退化为静态日期
        startCell.value = dateToValue(t.planned_start);
        endCell.value = dateToValue(t.planned_end);
      }
    } else {
      // 叶子任务（普通任务 / 节点任务）
      if (predIds.length > 0) {
        // 开始时间 = MAX(各前置任务完成时间) + 1（多重依赖取最晚结束项的次日）
        const dRefs = predIds
          .map((pid) => taskRowMap.get(pid))
          .filter(Boolean)
          .map((r) => `${endCol}${r}`)
          .join(",");
        if (dRefs) {
          startCell.value = {
            formula: `=MAX(${dRefs})+1`,
            result: startSerial != null ? startSerial : undefined,
          };
        } else if (startSerial != null) {
          startCell.value = dateToValue(t.planned_start);
        }
      } else if (startSerial != null) {
        startCell.value = dateToValue(t.planned_start);
      }

      // 完成时间 = 开始时间 + 工期（不含首尾，与 Forge 一致）
      if (startSerial != null) {
        endCell.value = {
          formula: `=${startCol}${rowNum}+${durCol}${rowNum}`,
          result: endSerial != null ? endSerial : undefined,
        };
      } else if (endSerial != null) {
        endCell.value = dateToValue(t.planned_end);
      }
    }
  }

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE3F2FD" },
  };
  headerRow.alignment = { horizontal: "center", vertical: "middle" };

  for (let i = 1; i <= tasks.length + 1; i++) {
    const row = sheet.getRow(i);
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });
  }

  // ===== 行级强调样式 =====
  // 3) 最高级别任务（depth===0，同级别顶层任务）统一同色底纹 + 文字加粗
  // 4) 阶段任务全部字体加粗（含子阶段）
  const TOP_FILL = "FFFFF3E0"; // 浅橙：顶层任务同色底纹
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    const rowNum = i + 2;
    const isTop = (t.depth || 0) === 0;
    const isPhase = t.task_type === "阶段任务";
    if (!isTop && !isPhase) continue;
    const row = sheet.getRow(rowNum);
    row.font = { bold: true };
    if (isTop) {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOP_FILL } };
      });
    }
  }

  // ===== Sheet 2：甘特图（时间轴单位：月）=====
  buildGanttSheet(workbook, tasks, childrenMap);

  return workbook;
}

/**
 * 构建「甘特图」工作表（参考「曙光天阔 N50 Pro Schedule V12」模板风格）：
 * - 双层表头：行1 月份序号(2026-07) + 行2 日期范围(7/1-7/31)，浅灰底纹加粗居中
 * - 每任务一行，时间轴按月展开，任务覆盖的自然月以色块填充：
 *   阶段任务 主题深蓝(#4472C4) / 叶子任务 浅蓝(#B4C7E7) / 节点任务(里程碑) 灰色标记(#A6A6A6)
 * - 任务名称全部加粗（同模板 System test/ME/EE 等行）
 * - 冻结 A/B 列与前 2 行表头（C3），滚动时任务名与表头始终可见
 * - 不设单元格边框（同模板：色块直接铺，靠行高/深浅分层）
 * 阶段任务的起止取其后代叶子任务的最小/最大日期（递归穿透子阶段）。
 */
function buildGanttSheet(workbook, tasks, childrenMap) {
  const gantt = workbook.addWorksheet("甘特图（月）");
  const PHASE_BAR = "FF4472C4"; // 阶段任务：主题深蓝
  const LEAF_BAR = "FFB4C7E7"; // 叶子任务：浅蓝
  const MILE_BAR = "FFA6A6A6"; // 节点任务（里程碑）：灰色标记
  const HEAD_FILL = "FFF2F2F2"; // 表头浅灰底（同模板日期行）

  const parseDate = (s) => {
    if (!s || typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const [y, m, d] = s.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  };
  const monthOf = (d) => d.getUTCFullYear() * 12 + d.getUTCMonth();
  const monthLabel = (m) =>
    `${Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}`; // 2026-07
  const monthRangeLabel = (m) => {
    const y = Math.floor(m / 12);
    const mo = (m % 12) + 1;
    const days = new Date(Date.UTC(y, mo, 0)).getUTCDate(); // 当月天数
    return `${mo}/1-${mo}/${days}`; // 7/1-7/31（同模板 m/d 日期风格）
  };

  // 递归收集阶段任务的全部叶子子孙（不含阶段自身）
  const collectLeafTasks = (phaseId) => {
    const out = [];
    const visited = new Set();
    const stack = [phaseId];
    while (stack.length) {
      const cur = stack.pop();
      const kids = childrenMap.get(cur) || [];
      for (const k of kids) {
        if (k.task_type !== "阶段任务") out.push(k);
        else if (!visited.has(k.id)) {
          visited.add(k.id);
          stack.push(k.id);
        }
      }
    }
    return out;
  };

  // 任务的有效起止（阶段任务聚合叶子，叶子取自身日期；无日期返回 null）
  const effRange = (t) => {
    if (t.task_type === "阶段任务") {
      const leaves = collectLeafTasks(t.id);
      const starts = leaves.map((l) => parseDate(l.planned_start)).filter(Boolean);
      const ends = leaves.map((l) => parseDate(l.planned_end)).filter(Boolean);
      if (!starts.length && !ends.length) return null;
      const start = new Date(Math.min(...starts.map((d) => d.getTime())));
      const end = new Date(Math.max(...ends.map((d) => d.getTime())));
      if (end < start) return { start: end, end: start };
      return { start, end };
    }
    const s = parseDate(t.planned_start);
    if (!s) return null;
    const e = parseDate(t.planned_end) || s;
    return { start: s, end: e };
  };

  const ranges = tasks.map((t) => effRange(t));
  let minM = Infinity;
  let maxM = -Infinity;
  ranges.forEach((r) => {
    if (!r) return;
    minM = Math.min(minM, monthOf(r.start));
    maxM = Math.max(maxM, monthOf(r.end));
  });
  if (!isFinite(minM)) {
    minM = maxM = monthOf(new Date()); // 全部无日期时兜底为当前月
  }
  const monthCount = maxM - minM + 1;

  // 列布局：A 序号 / B 任务名称 / C.. 逐月（同模板：左侧名称列 + 时间轴列）
  const prefixCols = 2; // A..B
  gantt.getCell(1, 1).value = "序号";
  gantt.getCell(1, 2).value = "任务名称";
  for (let m = 0; m < monthCount; m++) {
    gantt.getCell(1, prefixCols + 1 + m).value = monthLabel(minM + m); // 行1：月份
    gantt.getCell(2, prefixCols + 1 + m).value = monthRangeLabel(minM + m); // 行2：日期范围
  }
  gantt.getColumn(1).width = 6;
  gantt.getColumn(2).width = 30;
  for (let m = 0; m < monthCount; m++) gantt.getColumn(prefixCols + 1 + m).width = 9;

  // 表头 2 行：浅灰底 + 加粗 + 居中
  for (let r = 1; r <= 2; r++) {
    const row = gantt.getRow(r);
    row.height = 18;
    row.font = { bold: true };
    row.alignment = { horizontal: "center", vertical: "middle" };
    for (let c = 1; c <= prefixCols + monthCount; c++) {
      const cell = gantt.getCell(r, c);
      if (cell.value === undefined || cell.value === null) cell.value = ""; // 占位
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEAD_FILL } };
    }
  }

  // 冻结 A/B 列 + 前 2 行表头（同模板 freeze C6 → 此处 C3）
  gantt.views = [{ state: "frozen", xSplit: 2, ySplit: 2, topLeftCell: "C3" }];

  const barFor = (t) => {
    if (t.task_type === "阶段任务") return PHASE_BAR;
    if (t.task_type === "节点任务") return MILE_BAR;
    return LEAF_BAR;
  };

  tasks.forEach((t, i) => {
    const r = ranges[i];
    const rowNum = i + 3; // 表头 2 行 → 数据自第 3 行起
    const indent = "  ".repeat(t.depth || 0);
    const cleanSrcName = String(t.name).replace(/^(\s*)(└\s)?/, "");
    const displayName = indent + (t.depth > 0 ? "└ " : "") + cleanSrcName;
    gantt.getCell(rowNum, 1).value = t.task_order;
    gantt.getCell(rowNum, 2).value = displayName;
    gantt.getRow(rowNum).height = 22;
    // 任务名称全部加粗（同模板：System test / ME / EE / THM 均为粗体）
    gantt.getCell(rowNum, 1).font = { bold: true };
    gantt.getCell(rowNum, 2).font = { bold: true };

    if (!r) return;
    const sM = monthOf(r.start);
    const eM = monthOf(r.end);
    for (let m = 0; m < monthCount; m++) {
      const curM = minM + m;
      if (curM < sM || curM > eM) continue;
      const cell = gantt.getCell(rowNum, prefixCols + 1 + m);
      cell.value = ""; // 占位：无值但有样式的单元格可能不写入文件
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: barFor(t) } };
    }
  });
}

export default buildScheduleWorkbook;
