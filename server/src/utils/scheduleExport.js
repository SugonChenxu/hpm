import ExcelJS from "exceljs";

/**
 * 构建「项目排期表」Excel 工作簿（含日期联动公式）。
 *
 * 设计要点（与 Forge 后端计算规则保持一致）：
 *  1. 工期按「含首尾的日历天数」计，因此 完成时间 = 开始时间 + 工期 - 1。
 *  2. 有前置依赖的叶子任务：开始时间 = MAX(各前置任务完成时间) + 1（多重依赖取最晚）。
 *  3. 阶段任务（汇总行）：开始时间 = MIN(其叶子子孙的开始时间)，
 *     完成时间 = MAX(其叶子子孙的完成时间)。
 *  4. 所有日期以真实 Excel 日期序列号写入，并写入缓存结果；同时设置
 *     fullCalcOnLoad，确保用 Excel/WPS 打开时重新计算，公式联动生效。
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
  sheet.columns = [
    { header: "序号", key: "order", width: 8 },
    { header: "任务名称", key: "name", width: 30 },
    { header: "开始时间", key: "start", width: 14 },
    { header: "完成时间", key: "end", width: 14 },
    { header: "工期", key: "duration", width: 8 },
    { header: "完成情况", key: "status", width: 12 },
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
    const displayName = indent + (t.depth > 0 ? "└ " : "") + t.name;

    const rowValues = [
      t.task_order,
      displayName,
      null, // 开始时间（下方填充）
      null, // 完成时间（下方填充）
      durationVal,
      t.completion_status || "未开始",
      predNames,
      t.notes || "",
    ];
    sheet.addRow(rowValues);

    const startCell = sheet.getCell(rowNum, 3);
    const endCell = sheet.getCell(rowNum, 4);
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
        const cRefs = leafRows.map((r) => `C${r}`).join(",");
        const dRefs = leafRows.map((r) => `D${r}`).join(",");
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
          .map((r) => `D${r}`)
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

      // 完成时间 = 开始时间 + 工期 - 1（含首尾日历天数，与 Forge 一致）
      if (startSerial != null) {
        endCell.value = {
          formula: `=C${rowNum}+E${rowNum}-1`,
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

  return workbook;
}

export default buildScheduleWorkbook;
