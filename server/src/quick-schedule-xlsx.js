/**
 * 快速排期 → XLSX 导出
 *
 * 将排期甘特图映射为 Excel 工作簿，包含两个工作表：
 *   1. 排期明细：轨道 / 进度条 / 关键节点 / 参照线 全量结构化数据（便于二次编辑、筛选、透视）
 *   2. 甘特图：日期轴 + 彩色进度条填充 + 节点标记 + 参照线高亮（可视化总览）
 *
 * 与网页版、PPT 版保持一致：
 *   - 日期语义为「不含首尾」：结束 = 开始 + 工期（daysBetween 不含首尾）
 *   - 进度条（bar）与箭头直线（arrow）区分着色；关键节点单列标记；参照线高亮其日期列
 */

import ExcelJS from "exceljs";

function parseDate(s) {
  const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y || 1970, (m || 1) - 1, d || 1));
}

function toStr(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysBetween(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}

function addDaysStr(s, n) {
  const d = parseDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toStr(d);
}

function stripHash(hex) {
  const h = String(hex || "").replace("#", "").trim();
  return /^[0-9A-Fa-f]{6}$/.test(h) ? h.toUpperCase() : "1565C0";
}

function argb(hex, alpha = "FF") {
  return alpha + stripHash(hex);
}

/** 向白色方向提亮 pct（0~1），用于箭头基线等弱着色 */
function lighten(hex, pct) {
  const h = stripHash(hex);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lr = Math.round(r + (255 - r) * pct);
  const lg = Math.round(g + (255 - g) * pct);
  const lb = Math.round(b + (255 - b) * pct);
  const pad = (v) => String(v).padStart(2, "0");
  return `${pad(lr)}${pad(lg)}${pad(lb)}`;
}

const SHADOW_LABEL = { black: "黑色斜纹", white: "白色斜纹", none: "纯色" };
const SYMBOL_LABEL = {
  circle: "圆点", star: "星星", triangle: "三角",
  square: "方块", diamond: "菱形", flag: "旗帜",
};

/**
 * 生成日期分桶（甘特图列）。
 * 总天数 ≤ 366 用「逐日」列；否则用「逐周（7 天）」列，避免列数爆炸。
 */
function buildBuckets(startDate, endDate) {
  const totalDays = daysBetween(startDate, endDate) + 1; // 不含首尾语义下的含首尾计数
  const daily = totalDays <= 366;
  const bucketDays = daily ? 1 : 7;
  const buckets = [];
  for (let d = 0; d < totalDays; d += bucketDays) {
    const bStart = addDaysStr(startDate, d);
    const bEnd = addDaysStr(startDate, Math.min(d + bucketDays - 1, totalDays - 1));
    buckets.push({ start: bStart, end: bEnd, month: Number(bStart.slice(5, 7)) });
  }
  return { buckets, daily };
}

function overlaps(barStart, barEnd, bStart, bEnd) {
  return barStart <= bEnd && barEnd >= bStart;
}

export async function buildScheduleXlsx(schedule) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Forge";
  wb.subject = "快速排期";
  wb.title = schedule.title || "快速排期";

  const start = schedule.start_date;
  const end = schedule.end_date;
  const totalDays = daysBetween(start, end) + 1;
  const tracks = schedule.tracks || [];
  const vlines = schedule.vlines || [];

  // 统计
  let barCount = 0;
  let arrowCount = 0;
  let msCount = 0;
  for (const t of tracks) {
    for (const b of t.bars || []) {
      if (b.style === "arrow") arrowCount++;
      else barCount++;
    }
    msCount += (t.milestones || []).length;
  }

  // ═══════════════════════════════════════════════
  // 工作表 1：排期明细
  // ═══════════════════════════════════════════════
  const detail = wb.addWorksheet("排期明细", { views: [{ state: "frozen", xSplit: 0, ySplit: 1 }] });
  detail.columns = [
    { header: "序号", key: "idx", width: 6 },
    { header: "轨道", key: "track", width: 18 },
    { header: "类型", key: "type", width: 12 },
    { header: "名称", key: "title", width: 28 },
    { header: "开始日期", key: "start", width: 13 },
    { header: "结束日期", key: "end", width: 13 },
    { header: "工期(天)", key: "dur", width: 10 },
    { header: "颜色", key: "color", width: 10 },
    { header: "备注", key: "note", width: 22 },
  ];
  detail.getRow(1).font = { bold: true, color: "FFFFFF" };
  detail.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb("1565C0") } };
  detail.getRow(1).alignment = { vertical: "middle", horizontal: "center" };

  let idx = 0;
  for (const t of tracks) {
    for (const b of t.bars || []) {
      idx++;
      const dur = b.style === "arrow" ? daysBetween(start, end) + 1 : daysBetween(b.start_date, b.end_date) + 1;
      const row = detail.addRow({
        idx,
        track: t.title,
        type: b.style === "arrow" ? "箭头直线" : "进度条",
        title: b.title || "",
        start: b.start_date,
        end: b.end_date,
        dur,
        color: b.color,
        note: b.style === "arrow" ? "" : `阴影:${SHADOW_LABEL[b.shadow] || "白色斜纹"}`,
      });
      if (b.color) {
        row.getCell("color").fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(b.color) } };
        row.getCell("color").font = { color: "FFFFFF", bold: true };
        row.getCell("color").alignment = { horizontal: "center" };
      }
    }
    for (const m of t.milestones || []) {
      idx++;
      const row = detail.addRow({
        idx,
        track: t.title,
        type: "关键节点",
        title: m.title || "",
        start: m.date,
        end: m.date,
        dur: 0,
        color: m.color,
        note: `符号:${SYMBOL_LABEL[m.symbol] || "圆点"}`,
      });
      if (m.color) {
        row.getCell("color").fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(m.color) } };
        row.getCell("color").font = { color: "FFFFFF", bold: true };
        row.getCell("color").alignment = { horizontal: "center" };
      }
    }
  }
  for (const v of vlines) {
    idx++;
    const row = detail.addRow({
      idx,
      track: "(参照线)",
      type: "参照线",
      title: v.title || "",
      start: v.date,
      end: v.date,
      dur: 0,
      color: v.color,
      note: "贯穿全部轨道的时间参考线",
    });
    if (v.color) {
      row.getCell("color").fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(v.color) } };
      row.getCell("color").font = { color: "FFFFFF", bold: true };
      row.getCell("color").alignment = { horizontal: "center" };
    }
  }
  // 无数据提示
  if (idx === 0) {
    const r = detail.addRow({ idx: "", track: "（暂无进度条 / 节点数据）", type: "", title: "", start: "", end: "", dur: "", color: "", note: "" });
    r.font = { italic: true, color: "888888" };
  }
  detail.autoFilter = { from: "A1", to: "I1" };

  // ═══════════════════════════════════════════════
  // 工作表 2：甘特图（可视化）
  // ═══════════════════════════════════════════════
  const { buckets, daily } = buildBuckets(start, end);
  const gantt = wb.addWorksheet("甘特图", { views: [{ state: "frozen", xSplit: 1, ySplit: 3 }] });

  const TITLE_ROW = 1;
  const SUB_ROW = 2;
  const HEAD_ROW = 3;
  const FIRST_DATA_ROW = 4;
  const colA = 1; // 轨道名列

  // 标题
  gantt.mergeCells(TITLE_ROW, colA, TITLE_ROW, colA + buckets.length);
  const titleCell = gantt.getCell(TITLE_ROW, colA);
  titleCell.value = schedule.title || "快速排期";
  titleCell.font = { bold: true, size: 15, color: "1F2937" };
  titleCell.alignment = { vertical: "middle", horizontal: "left" };

  gantt.mergeCells(SUB_ROW, colA, SUB_ROW, colA + buckets.length);
  const subCell = gantt.getCell(SUB_ROW, colA);
  subCell.value = `${start} ~ ${end} · 共 ${totalDays} 天 · ${tracks.length} 轨道 / ${barCount} 进度条 / ${arrowCount} 箭头线 / ${msCount} 节点`;
  subCell.font = { size: 10, color: "6B7280" };
  subCell.alignment = { vertical: "middle", horizontal: "left" };

  // 轨道名列宽 + 日期列宽
  gantt.getColumn(colA).width = 18;
  const dateColWidth = daily ? 3.6 : 9;
  for (let i = 0; i < buckets.length; i++) {
    gantt.getColumn(colA + 1 + i).width = dateColWidth;
  }

  // 日期表头
  const headCell = gantt.getCell(HEAD_ROW, colA);
  headCell.value = "轨道";
  headCell.font = { bold: true, color: "FFFFFF" };
  headCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb("374151") } };
  headCell.alignment = { vertical: "middle", horizontal: "center" };
  headCell.border = { right: { style: "thin", color: { argb: argb("FFFFFF") } } };

  // 参照线日期集合（用于表头高亮）
  const vlineBucketSet = new Set();
  for (const v of vlines) {
    for (let i = 0; i < buckets.length; i++) {
      if (overlaps(v.date, v.date, buckets[i].start, buckets[i].end)) {
        vlineBucketSet.add(i);
      }
    }
  }

  buckets.forEach((b, i) => {
    const c = gantt.getCell(HEAD_ROW, colA + 1 + i);
    let label;
    if (daily) {
      label = `${b.start.slice(5).replace("-", "/")}`;
    } else {
      label = `${b.start.slice(5).replace("-", "/")}~${b.end.slice(8)}`;
    }
    c.value = label;
    // 月份交替底色
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: b.month % 2 === 0 ? argb("EEF2F7") : argb("FFFFFF") } };
    c.font = { size: 8, color: "374151", bold: b.start.slice(8) === "01" };
    c.alignment = { vertical: "middle", horizontal: "center" };
    c.border = { right: { style: "thin", color: { argb: argb("D1D5DB") } } };
  });

  // 各轨道数据行
  let rowIdx = FIRST_DATA_ROW;
  for (const t of tracks) {
    // 轨道名单元格
    const aCell = gantt.getCell(rowIdx, colA);
    aCell.value = t.title || "(未命名)";
    aCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(t.label_color || "1565C0") } };
    aCell.font = { bold: true, color: "FFFFFF" };
    aCell.alignment = { vertical: "middle", horizontal: "left" };
    aCell.border = { right: { style: "thin", color: { argb: argb("FFFFFF") } } };

    // 进度条 / 箭头线 填充
    for (const b of t.bars || []) {
      const isArrow = b.style === "arrow";
      for (let i = 0; i < buckets.length; i++) {
        if (overlaps(b.start_date, b.end_date, buckets[i].start, buckets[i].end)) {
          const c = gantt.getCell(rowIdx, colA + 1 + i);
          const fillColor = isArrow
            ? lighten(b.color, 0.82)
            : stripHash(b.color);
          c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(fillColor) } };
          // 进度条首格放名称（白色加粗，跨格显示）
          if (!isArrow && b.title && i === firstOverlapIdx(buckets, b.start_date, b.end_date)) {
            c.value = b.title;
            c.font = { color: "FFFFFF", bold: true, size: 9 };
            c.alignment = { vertical: "middle", horizontal: "left" };
          }
        }
      }
    }

    // 关键节点 标记
    for (const m of t.milestones || []) {
      for (let i = 0; i < buckets.length; i++) {
        if (overlaps(m.date, m.date, buckets[i].start, buckets[i].end)) {
          const c = gantt.getCell(rowIdx, colA + 1 + i);
          c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(m.color) } };
          c.value = "●" + (m.title ? ` ${m.title}` : "");
          c.font = { color: "FFFFFF", bold: true, size: 9 };
          c.alignment = { vertical: "middle", horizontal: "left" };
        }
      }
    }

    rowIdx++;
  }

  // 参照线高亮：在表头行下方插入一行「参照线」标注（用浅色填充对应列首格）
  if (vlines.length > 0) {
    const vRow = rowIdx;
    const vaCell = gantt.getCell(vRow, colA);
    vaCell.value = "参照线";
    vaCell.font = { bold: true, color: "FFFFFF" };
    vaCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb("A94442") } };
    vaCell.alignment = { vertical: "middle", horizontal: "center" };
    for (const v of vlines) {
      for (let i = 0; i < buckets.length; i++) {
        if (overlaps(v.date, v.date, buckets[i].start, buckets[i].end)) {
          const c = gantt.getCell(vRow, colA + 1 + i);
          c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(v.color) } };
          c.value = "▼" + (v.title ? ` ${v.title}` : "");
          c.font = { color: "FFFFFF", bold: true, size: 8 };
          c.alignment = { vertical: "middle", horizontal: "left" };
        }
      }
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/** 返回某个 bar 区间首个重叠桶的下标（用于放置名称） */
function firstOverlapIdx(buckets, barStart, barEnd) {
  for (let i = 0; i < buckets.length; i++) {
    if (overlaps(barStart, barEnd, buckets[i].start, buckets[i].end)) return i;
  }
  return -1;
}
