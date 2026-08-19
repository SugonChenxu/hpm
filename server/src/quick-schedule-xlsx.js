/**
 * 快速排期 → XLSX 导出（月度示意版·原生形状·美化）
 *
 * 布局：横向表头 = 季度(合并) + 月份(一格一月，不逐日还原)；纵向 = 轨道名称。
 * 元素全部为真正的 Excel 绘图形状（twoCellAnchor），可在 Excel/WPS 中直接
 * 选中拖动、缩放、改色：
 *   - 轨道线     → 原生「直线箭头」形状（line + tailEnd 箭头）
 *   - 进度条     → 圆角矩形（内嵌白色粗体名称）
 *   - 关键节点   → 菱形（按 symbol 映射）+ 名称文本框
 *   - 参照线     → 原生「虚线」形状（line + prstDash=dash）贯穿全部轨道
 *
 * 实现：ExcelJS 生成「月份网格 + 轨道标签」骨架 → jszip 注入 spreadsheetDrawing。
 */

import ExcelJS from "exceljs";
import JSZip from "jszip";

function parseDate(s) {
  const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y || 1970, (m || 1) - 1, d || 1));
}
function stripHash(hex) {
  const h = String(hex || "").replace("#", "").trim();
  return /^[0-9A-Fa-f]{6}$/.test(h) ? h.toUpperCase() : "1565C0";
}
const argb = (hex, alpha = "FF") => alpha + stripHash(hex);

const SYMBOL_GEOM = {
  circle: "ellipse",
  square: "roundRect",
  triangle: "triangle",
  diamond: "diamond",
  star: "star5",
  flag: "roundRect",
};

// ── 网格布局常量（1-based 行 / 列，对齐 PPT 导出版式） ──
const TITLE_ROW = 1;
const HEAD_Q_ROW = 2; // 季度行（红底）
const HEAD_M_ROW = 3; // 月份行（浅红底）
const FIRST_DATA_ROW = 4;
const COL_A = 1;                 // 轨道名列（1-based）
const DATE_COL0 = COL_A;         // 0-based 起始月列 = B
const ROW0_FIRST = FIRST_DATA_ROW - 1; // 0-based 首条轨道行 = 3

const ROW_EMU = 457200;          // 36pt 轨道行高（EMU，参考 PPT ROW_H=0.5"）
const MONTH_COL_WIDTH = 13;      // 月份列宽（字符，≈96px）
const MONTH_COL_EMU = Math.round((MONTH_COL_WIDTH * 7 + 5) * 9525);
const TRACK_COL_WIDTH = 22;      // 轨道列宽（字符，≈160px）
const MS_PX = 15;                // 节点符号边长 px（参考 PPT 0.16"）
const MS_W = MS_PX * 9525;
const MS_H = MS_PX * 9525;
const BAR_PAD = Math.round(ROW_EMU * 0.28); // 进度条上下内边距（条高 ≈ 44% 行高 ≈ 21px，参考 PPT 0.22"）
const LINE_W = 19050;            // 1.5pt（轨道线/参照线，参考 PPT）

// PPT 配色方案（quick-schedule-pptx.js 同源）
const C_TITLE = "1F2937";        // 标题深字（无底色）
const C_QUARTER_BG = "A94442";   // 季度红底
const C_MONTH_BG = "D9A6A5";     // 月份浅红底
const C_BAND_A = "FFFFFF";       // 轨道区月带白
const C_BAND_B = "EEF2F7";       // 轨道区月带浅灰
const C_TRACK_TEXT = "374151";   // 轨道名深字
const C_MS_TEXT = "000000";      // 节点文字（PPT 默认黑）

/** 浅色化：颜色与白色按 ratio 混合（轨道名底纹，参考 PPT transparency=88） */
function lighten(hex, ratio = 0.88) {
  const h = stripHash(hex);
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  const mix = (v) => Math.round(v * (1 - ratio) + 255 * ratio);
  const to2 = (v) => v.toString(16).padStart(2, "0").toUpperCase();
  return to2(mix(r)) + to2(mix(g)) + to2(mix(b));
}

/** 起止日期之间的月份序列（含首末月） */
function monthList(start, end) {
  const sd = parseDate(start), ed = parseDate(end);
  const out = [];
  let y = sd.getUTCFullYear(), m = sd.getUTCMonth();
  while (y < ed.getUTCFullYear() || (y === ed.getUTCFullYear() && m <= ed.getUTCMonth())) {
    out.push({ y, m });
    m += 1;
    if (m === 12) { m = 0; y += 1; }
  }
  return out;
}
const qlabel = (y, m) => `${y}年Q${Math.floor(m / 3) + 1}`;
const mlabel = (y, m) => `${m + 1}月`;

/** 月内比例：Forge dateToPixels = 月序号×月宽 + (当月已过天数/当月总天数)×月宽 */
function monthFrac(dateStr) {
  const d = parseDate(dateStr);
  const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return (day - 1) / daysInMonth;
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** 生成一个形状锚点（twoCellAnchor）；lineColor 非空时输出原生线条/箭头/虚线形状 */
function shapeAnchor({
  id, name, colFrom, rowFrom, colOffFrom, rowOffFrom,
  colTo, rowTo, colOffTo, rowOffTo,
  fillHex, fillMode = "solid", geom = "roundRect",
  text, textColor = "FFFFFF", textSize = 900, textAlign = "ctr",
  lineColor = null, lineW = LINE_W, dash = "solid", tailArrow = false, headArrow = false,
  stroke = null,
}) {
  const fillXml = fillMode === "none" ? "<a:noFill/>" : `<a:solidFill><a:srgbClr val="${fillHex}"/></a:solidFill>`;
  let lnXml;
  if (lineColor) {
    const dashXml = dash === "dash" ? `<a:prstDash val="dash"/>` : "";
    const head = headArrow ? `<a:headEnd type="triangle" w="med" len="med"/>` : "";
    const tail = tailArrow ? `<a:tailEnd type="triangle" w="med" len="med"/>` : "";
    lnXml = `<a:ln w="${lineW}" cap="flat"><a:solidFill><a:srgbClr val="${lineColor}"/></a:solidFill>${dashXml}${head}${tail}</a:ln>`;
  } else if (stroke) {
    lnXml = `<a:ln w="6350"><a:solidFill><a:srgbClr val="${stroke}"/></a:solidFill></a:ln>`;
  } else {
    lnXml = "<a:ln><a:noFill/></a:ln>";
  }
  let txBody = "";
  if (text) {
    txBody =
      `<xdr:txBody><a:bodyPr vert="horz" lIns="36000" tIns="18000" rIns="36000" bIns="18000" anchor="ctr" wrap="square"/>` +
      `<a:lstStyle/><a:p><a:pPr algn="${textAlign}"/>` +
      `<a:r><a:rPr lang="zh-CN" sz="${textSize}" b="1"><a:solidFill><a:srgbClr val="${textColor}"/></a:solidFill></a:rPr>` +
      `<a:t>${esc(text)}</a:t></a:r></a:p></xdr:txBody>`;
  }
  return (
    `<xdr:twoCellAnchor>` +
    `<xdr:from><xdr:col>${colFrom}</xdr:col><xdr:colOff>${colOffFrom}</xdr:colOff><xdr:row>${rowFrom}</xdr:row><xdr:rowOff>${rowOffFrom}</xdr:rowOff></xdr:from>` +
    `<xdr:to><xdr:col>${colTo}</xdr:col><xdr:colOff>${colOffTo}</xdr:colOff><xdr:row>${rowTo}</xdr:row><xdr:rowOff>${rowOffTo}</xdr:rowOff></xdr:to>` +
    `<xdr:sp><xdr:nvSpPr><xdr:cNvPr id="${id}" name="${esc(name)}"/><xdr:cNvSpPr/></xdr:nvSpPr>` +
    `<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></a:xfrm>` +
    `<a:prstGeom prst="${geom}"><a:avLst/></a:prstGeom>${fillXml}${lnXml}</xdr:spPr>` +
    `${txBody}` +
    `<xdr:style><a:lnRef idx="0"><a:schemeClr val="accent1"/></a:lnRef><a:fillRef idx="0"><a:schemeClr val="accent1"/></a:fillRef>` +
    `<a:effectRef idx="0"><a:schemeClr val="accent1"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="tx1"/></a:fontRef></xdr:style>` +
    `</xdr:sp><xdr:clientData/></xdr:twoCellAnchor>`
  );
}

/** 构建 drawing1.xml 的全部锚点（月度坐标系） */
function buildDrawing(schedule) {
  const start = schedule.start_date;
  const end = schedule.end_date;
  const tracks = schedule.tracks || [];
  const vlines = schedule.vlines || [];
  const months = monthList(start, end);

  const colOf = (dateStr) => {
    const d = parseDate(dateStr);
    const i = months.findIndex((x) => x.y === d.getUTCFullYear() && x.m === d.getUTCMonth());
    return DATE_COL0 + i;
  };

  const anchors = [];
  let id = 1;
  const lastRow0 = ROW0_FIRST + tracks.length; // 末行之后（0-based）

  tracks.forEach((t, ti) => {
    const row0 = ROW0_FIRST + ti;
    const trackColor = stripHash(t.label_color || "1565C0");
    // 行垂直中线（箭头线/节点符号共用）
    const midY = Math.round(ROW_EMU / 2);
    const cyTop = midY - Math.round(MS_H / 2);
    const cyBot = midY + Math.round(MS_H / 2);
    // 节点文字在符号下方（参考 PPT：y = centerY + size/2 + gap）
    const lblTop = cyBot + 9525;
    const lblBot = ROW_EMU - 9525;

    for (const b of t.bars || []) {
      const f1 = monthFrac(b.start_date);
      const f2 = monthFrac(b.end_date);
      const c1 = colOf(b.start_date);
      const c2 = colOf(b.end_date);
      if (b.style === "arrow") {
        // 轨道线：水平直线 + 末端箭头，右端对齐最后一个月份的右侧
        anchors.push(
          shapeAnchor({
            id: id++, name: `arrow_${ti}_${b.id || id}`,
            colFrom: c1, rowFrom: row0, colOffFrom: Math.round(f1 * MONTH_COL_EMU), rowOffFrom: midY,
            colTo: c2 + 1, rowTo: row0, colOffTo: 0, rowOffTo: midY,
            fillMode: "none", geom: "line",
            lineColor: stripHash(b.color || trackColor), lineW: LINE_W, tailArrow: true,
          })
        );
      } else {
        // 进度条：按 Forge 比例（左=开始日位置，右=结束日位置），白边 + 8pt 白字（参考 PPT）
        anchors.push(
          shapeAnchor({
            id: id++, name: `bar_${ti}_${b.id || id}`,
            colFrom: c1, rowFrom: row0, colOffFrom: Math.round(f1 * MONTH_COL_EMU), rowOffFrom: BAR_PAD,
            colTo: c2, rowTo: row0, colOffTo: Math.round(f2 * MONTH_COL_EMU), rowOffTo: ROW_EMU - BAR_PAD,
            fillHex: stripHash(b.color), geom: "roundRect", stroke: "FFFFFF",
            text: b.title, textColor: "FFFFFF", textSize: 800,
          })
        );
      }
    }

    for (const m of t.milestones || []) {
      const c = colOf(m.date);
      const frac = monthFrac(m.date);
      const geom = SYMBOL_GEOM[m.symbol] || "diamond";
      // 符号：15px，中心对准日期点；文字居中于符号下方
      const wf = m.symbol === "square" ? 0.58 : 1;
      const w = Math.round(MS_W * wf);
      const cx = Math.round(frac * MONTH_COL_EMU);
      const offFrom = Math.max(0, cx - Math.round(w / 2));
      anchors.push(
        shapeAnchor({
          id: id++, name: `ms_${ti}_${m.id || id}`,
          colFrom: c, rowFrom: row0, colOffFrom: offFrom, rowOffFrom: cyTop,
          colTo: c, rowTo: row0, colOffTo: offFrom + w, rowOffTo: cyBot,
          fillHex: stripHash(m.color), geom,
        })
      );
      if (m.title) {
        const lblW = Math.round(100 * 9525); // ≈100px，与 PPT 文字宽 1.1" 相当
        const lblFrom = Math.max(0, cx - Math.round(lblW / 2));
        anchors.push(
          shapeAnchor({
            id: id++, name: `ms_t_${ti}_${m.id || id}`,
            colFrom: c, rowFrom: row0, colOffFrom: lblFrom, rowOffFrom: lblTop,
            colTo: c, rowTo: row0, colOffTo: lblFrom + lblW, rowOffTo: lblBot,
            fillMode: "none", geom: "rect",
            text: m.title, textColor: stripHash(m.text_color || C_MS_TEXT), textSize: 750, textAlign: "ctr",
          })
        );
      }
    }
  });

  // 参照线：竖直虚线（colOff 相同 → 绝对垂直），贯穿全部轨道
  for (const v of vlines) {
    const c = colOf(v.date);
    const x = Math.round(monthFrac(v.date) * MONTH_COL_EMU);
    anchors.push(
      shapeAnchor({
        id: id++, name: `vline_${v.id || id}`,
        colFrom: c, rowFrom: ROW0_FIRST, colOffFrom: x, rowOffFrom: 0,
        colTo: c, rowTo: lastRow0, colOffTo: x, rowOffTo: 0,
        fillMode: "none", geom: "line",
        lineColor: stripHash(v.color || "D32F2F"), lineW: LINE_W, dash: "dash",
      })
    );
    if (v.title) {
      anchors.push(
        shapeAnchor({
          id: id++, name: `vline_t_${v.id || id}`,
          colFrom: c, rowFrom: ROW0_FIRST, colOffFrom: x + 12000, rowOffFrom: 0,
          colTo: c + 2, rowTo: ROW0_FIRST, colOffTo: 0, rowOffTo: Math.round(ROW_EMU * 0.6),
          fillMode: "none", geom: "rect",
          text: v.title, textColor: stripHash(v.color || "D32F2F"), textSize: 700, textAlign: "l",
        })
      );
    }
  }

  if (anchors.length === 0) return null;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    anchors.join("") +
    `</xdr:wsDr>`
  );
}

/** 把 drawing 注入到已生成的 xlsx zip 中（仅 sheet1 = 甘特图） */
async function injectDrawing(buf, drawingXml) {
  const zip = await JSZip.loadAsync(buf);
  const sheetPath = "xl/worksheets/sheet1.xml";
  if (!zip.file(sheetPath)) throw new Error("找不到 worksheet: " + sheetPath);
  let sheetXml = await zip.file(sheetPath).async("string");
  if (!/xmlns:r=/.test(sheetXml)) {
    sheetXml = sheetXml.replace(
      /<worksheet\b/,
      '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
    );
  }
  sheetXml = sheetXml.replace(/<\/worksheet>/, '<drawing r:id="rId1"/></worksheet>');
  zip.file(sheetPath, sheetXml);

  const relsPath = "xl/worksheets/_rels/sheet1.xml.rels";
  zip.file(
    relsPath,
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>` +
      `</Relationships>`
  );
  zip.file("xl/drawings/drawing1.xml", drawingXml);
  zip.file(
    "xl/drawings/_rels/drawing1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`
  );

  let ct = await zip.file("[Content_Types].xml").async("string");
  if (!/drawings\/drawing1\.xml/.test(ct)) {
    ct = ct.replace(
      /<\/Types>/,
      `<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`
    );
    zip.file("[Content_Types].xml", ct);
  }

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

export async function buildScheduleXlsx(schedule) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Forge";
  wb.subject = "快速排期";
  wb.title = schedule.title || "快速排期";

  const start = schedule.start_date;
  const end = schedule.end_date;
  const tracks = schedule.tracks || [];
  const months = monthList(start, end);
  const N = months.length;

  let barCount = 0, arrowCount = 0, msCount = 0;
  for (const t of tracks) {
    for (const b of t.bars || []) b.style === "arrow" ? arrowCount++ : barCount++;
    msCount += (t.milestones || []).length;
  }

  // 单工作表：甘特图（月份网格骨架），冻结表头 3 行 + 轨道列
  const gantt = wb.addWorksheet("甘特图", { views: [{ state: "frozen", xSplit: 1, ySplit: 3 }] });
  const colCount = COL_A + N; // A 列 + 每月一列

  // ── 标题（参考 PPT：深色文字、无底色） ──
  gantt.mergeCells(TITLE_ROW, COL_A, TITLE_ROW, colCount);
  const titleCell = gantt.getCell(TITLE_ROW, COL_A);
  titleCell.value = schedule.title || "快速排期";
  titleCell.font = { bold: true, size: 17, color: { argb: argb(C_TITLE) } };
  titleCell.alignment = { vertical: "middle", horizontal: "left" };
  gantt.getRow(TITLE_ROW).height = 28;

  // ── 列宽 ──
  gantt.getColumn(COL_A).width = TRACK_COL_WIDTH;
  for (let i = 0; i < N; i++) gantt.getColumn(COL_A + 1 + i).width = MONTH_COL_WIDTH;

  // ── 季度行（参考 PPT：红底 A94442，白字；A 列角格留空） ──
  const qruns = [];
  for (let i = 0; i < N; ) {
    const q = qlabel(months[i].y, months[i].m);
    let j = i;
    while (j < N && qlabel(months[j].y, months[j].m) === q) j += 1;
    qruns.push({ i, j: j - 1, q });
    i = j;
  }
  const q0 = gantt.getCell(HEAD_Q_ROW, COL_A);
  q0.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(C_QUARTER_BG) } };
  for (const r of qruns) {
    if (r.j > r.i) gantt.mergeCells(HEAD_Q_ROW, COL_A + 1 + r.i, HEAD_Q_ROW, COL_A + 1 + r.j);
    for (let c = r.i; c <= r.j; c++) {
      const cell = gantt.getCell(HEAD_Q_ROW, COL_A + 1 + c);
      cell.value = r.q;
      cell.font = { bold: true, size: 9, color: { argb: argb("FFFFFF") } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(C_QUARTER_BG) } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    }
  }
  gantt.getRow(HEAD_Q_ROW).height = 18;

  // ── 月份行（参考 PPT：浅红底 D9A6A5，白字；A 列角格留空） ──
  const m0 = gantt.getCell(HEAD_M_ROW, COL_A);
  m0.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(C_MONTH_BG) } };
  for (let i = 0; i < N; i++) {
    const cell = gantt.getCell(HEAD_M_ROW, COL_A + 1 + i);
    cell.value = mlabel(months[i].y, months[i].m);
    cell.font = { size: 8, color: { argb: argb("FFFFFF") } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(C_MONTH_BG) } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  }
  gantt.getRow(HEAD_M_ROW).height = 18;

  // ── 轨道区月带底色（参考 PPT：白 / EEF2F7 交替） ──
  for (let i = 0; i < N; i++) {
    const bg = i % 2 === 0 ? C_BAND_A : C_BAND_B;
    for (let ti = 0; ti < tracks.length; ti++) {
      const cell = gantt.getCell(FIRST_DATA_ROW + ti, COL_A + 1 + i);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(bg) } };
    }
  }

  // ── 轨道标签（参考 PPT：浅色底纹 + 深色名称 + 左侧色块） ──
  tracks.forEach((t, ti) => {
    const r = FIRST_DATA_ROW + ti;
    gantt.getRow(r).height = 36;
    const lc = t.label_color || "1565C0";
    const aCell = gantt.getCell(r, COL_A);
    aCell.value = t.title || "(未命名)";
    aCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(lighten(lc)) } };
    aCell.font = { bold: true, size: 9, color: { argb: argb(C_TRACK_TEXT) } };
    aCell.alignment = { vertical: "middle", horizontal: "left" };
    aCell.border = {
      left: { style: "thick", color: { argb: argb(lc) } },
      top: { style: "thin", color: { argb: "FFD9DEE5" } },
      bottom: { style: "thin", color: { argb: "FFD9DEE5" } },
    };
  });

  // ── 底部说明（参考 PPT 底部统计） ──
  const legendRow = FIRST_DATA_ROW + tracks.length + 1;
  gantt.mergeCells(legendRow, COL_A, legendRow, colCount);
  const legendCell = gantt.getCell(legendRow, COL_A);
  legendCell.value =
    `共 ${tracks.length} 个轨道 · ${barCount} 个进度条 · ${msCount} 个节点 —— 所有形状均可直接选中拖动/缩放/改色`;
  legendCell.font = { size: 9, color: { argb: argb("6B7280") }, italic: true };
  legendCell.alignment = { vertical: "middle", horizontal: "right" };
  gantt.getRow(legendRow).height = 16;

  const baseBuf = await wb.xlsx.writeBuffer();

  // 注入可视化形状
  const drawingXml = buildDrawing(schedule);
  if (drawingXml) {
    return Buffer.from(await injectDrawing(Buffer.from(baseBuf), drawingXml));
  }
  return Buffer.from(baseBuf);
}
