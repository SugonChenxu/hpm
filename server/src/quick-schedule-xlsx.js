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

// ── 网格布局常量（1-based 行 / 列） ──
const TITLE_ROW = 1;
const SUB_ROW = 2;
const HEAD_Q_ROW = 3; // 季度行
const HEAD_M_ROW = 4; // 月份行
const FIRST_DATA_ROW = 5;
const COL_A = 1;                 // 轨道名列（1-based）
const DATE_COL0 = COL_A;         // 0-based 起始月列 = B
const ROW0_FIRST = FIRST_DATA_ROW - 1; // 0-based 首条轨道行 = 4

const ROW_EMU = 406400;          // 32pt 轨道行高（EMU），参照 Forge ROW_HEIGHT=64px 的宽松度
const MONTH_COL_WIDTH = 13;      // 月份列宽（字符，≈96px，参照 Forge 月宽自适应约 80~115px）
const MONTH_COL_EMU = Math.round((MONTH_COL_WIDTH * 7 + 5) * 9525);
const TRACK_COL_WIDTH = 22;      // 轨道列宽（字符，≈160px，参照 Forge LABEL_WIDTH=160px）
const MS_PX = 18;                // 节点符号边长 px（参照 Forge MilestoneSymbol size=18）
const MS_W = MS_PX * 9525;
const MS_H = MS_PX * 9525;
const BAR_PAD = Math.round(ROW_EMU * 0.24); // 进度条上下内边距（条高 ≈ 52% 行高）
const LINE_W = 19050;            // 1.5pt

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
}) {
  const fillXml = fillMode === "none" ? "<a:noFill/>" : `<a:solidFill><a:srgbClr val="${fillHex}"/></a:solidFill>`;
  let lnXml;
  if (lineColor) {
    const dashXml = dash === "dash" ? `<a:prstDash val="dash"/>` : "";
    const head = headArrow ? `<a:headEnd type="triangle" w="med" len="med"/>` : "";
    const tail = tailArrow ? `<a:tailEnd type="triangle" w="med" len="med"/>` : "";
    lnXml = `<a:ln w="${lineW}" cap="flat"><a:solidFill><a:srgbClr val="${lineColor}"/></a:solidFill>${dashXml}${head}${tail}</a:ln>`;
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
    // 行垂直中心（箭头线/节点/名称框统一中线对齐）
    const midY = Math.round(ROW_EMU / 2);
    const cyTop = midY - Math.round(MS_H / 2);
    const cyBot = midY + Math.round(MS_H / 2);

    for (const b of t.bars || []) {
      const f1 = monthFrac(b.start_date);
      const f2 = monthFrac(b.end_date);
      const c1 = colOf(b.start_date);
      const c2 = colOf(b.end_date);
      if (b.style === "arrow") {
        // 轨道线：水平直线 + 末端箭头（rowOff 相同 → 绝对水平）
        anchors.push(
          shapeAnchor({
            id: id++, name: `arrow_${ti}_${b.id || id}`,
            colFrom: c1, rowFrom: row0, colOffFrom: Math.round(f1 * MONTH_COL_EMU), rowOffFrom: midY,
            colTo: c2 + 1, rowTo: row0, colOffTo: Math.round(f2 * MONTH_COL_EMU), rowOffTo: midY,
            fillMode: "none", geom: "line",
            lineColor: stripHash(b.color || trackColor), lineW: LINE_W, tailArrow: true,
          })
        );
      } else {
        // 进度条：按 Forge 比例（左=开始日位置，右=结束日位置）
        anchors.push(
          shapeAnchor({
            id: id++, name: `bar_${ti}_${b.id || id}`,
            colFrom: c1, rowFrom: row0, colOffFrom: Math.round(f1 * MONTH_COL_EMU), rowOffFrom: BAR_PAD,
            colTo: c2, rowTo: row0, colOffTo: Math.round(f2 * MONTH_COL_EMU), rowOffTo: ROW_EMU - BAR_PAD,
            fillHex: stripHash(b.color), geom: "roundRect",
            text: b.title, textColor: "FFFFFF", textSize: 1000,
          })
        );
      }
    }

    for (const m of t.milestones || []) {
      const c = colOf(m.date);
      const frac = monthFrac(m.date);
      const geom = SYMBOL_GEOM[m.symbol] || "diamond";
      // 符号尺寸：参照 Forge 18×18；square 为窄竖矩形（宽 = 0.58×s）；中心对准日期点
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
        anchors.push(
          shapeAnchor({
            id: id++, name: `ms_t_${ti}_${m.id || id}`,
            colFrom: c, rowFrom: row0, colOffFrom: offFrom + w + 12000, rowOffFrom: cyTop,
            colTo: c + 2, rowTo: row0, colOffTo: 0, rowOffTo: cyBot,
            fillMode: "none", geom: "rect",
            text: m.title, textColor: "374151", textSize: 900, textAlign: "l",
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
        lineColor: stripHash(v.color || "D32F2F"), lineW: 12700, dash: "dash",
      })
    );
    if (v.title) {
      anchors.push(
        shapeAnchor({
          id: id++, name: `vline_t_${v.id || id}`,
          colFrom: c, rowFrom: ROW0_FIRST, colOffFrom: x + 12000, rowOffFrom: 0,
          colTo: c + 2, rowTo: ROW0_FIRST, colOffTo: 0, rowOffTo: Math.round(ROW_EMU * 0.6),
          fillMode: "none", geom: "rect",
          text: v.title, textColor: stripHash(v.color || "D32F2F"), textSize: 900, textAlign: "l",
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

  // 单工作表：甘特图（月份网格骨架），冻结表头 4 行 + 轨道列
  const gantt = wb.addWorksheet("甘特图", { views: [{ state: "frozen", xSplit: 1, ySplit: 4 }] });
  const colCount = COL_A + N; // A 列 + 每月一列

  // ── 标题 ──
  gantt.mergeCells(TITLE_ROW, COL_A, TITLE_ROW, colCount);
  const titleCell = gantt.getCell(TITLE_ROW, COL_A);
  titleCell.value = schedule.title || "快速排期";
  titleCell.font = { bold: true, size: 16, color: "FFFFFF" };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb("1F3A5F") } };
  titleCell.alignment = { vertical: "middle", horizontal: "center" };
  gantt.getRow(TITLE_ROW).height = 26;

  // ── 副标题（统计） ──
  gantt.mergeCells(SUB_ROW, COL_A, SUB_ROW, colCount);
  const subCell = gantt.getCell(SUB_ROW, COL_A);
  subCell.value =
    `${start} ~ ${end} · 共 ${N} 个月 · ${tracks.length} 轨道 / ${barCount} 进度条 / ${arrowCount} 轨道线 / ${msCount} 节点 · 形状可直接拖动调整`;
  subCell.font = { size: 10, color: "6B7280" };
  subCell.alignment = { vertical: "middle", horizontal: "left" };
  gantt.getRow(SUB_ROW).height = 18;

  // ── 列宽 ──
  gantt.getColumn(COL_A).width = TRACK_COL_WIDTH;
  for (let i = 0; i < N; i++) gantt.getColumn(COL_A + 1 + i).width = MONTH_COL_WIDTH;

  // ── 季度行（合并） ──
  const qruns = [];
  for (let i = 0; i < N; ) {
    const q = qlabel(months[i].y, months[i].m);
    let j = i;
    while (j < N && qlabel(months[j].y, months[j].m) === q) j += 1;
    qruns.push({ i, j: j - 1, q });
    i = j;
  }
  const q0 = gantt.getCell(HEAD_Q_ROW, COL_A);
  q0.value = "季度";
  q0.font = { bold: true, size: 9, color: "FFFFFF" };
  q0.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb("374151") } };
  q0.alignment = { vertical: "middle", horizontal: "center" };
  for (const r of qruns) {
    if (r.j > r.i) gantt.mergeCells(HEAD_Q_ROW, COL_A + 1 + r.i, HEAD_Q_ROW, COL_A + 1 + r.j);
    for (let c = r.i; c <= r.j; c++) {
      const cell = gantt.getCell(HEAD_Q_ROW, COL_A + 1 + c);
      cell.value = r.q;
      cell.font = { bold: true, size: 10, color: "FFFFFF" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb("2E5C8A") } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    }
  }
  gantt.getRow(HEAD_Q_ROW).height = 18;

  // ── 月份行（一格一月，单色浅底深字，保证可读） ──
  const m0 = gantt.getCell(HEAD_M_ROW, COL_A);
  m0.value = "月份";
  m0.font = { bold: true, size: 9, color: "FFFFFF" };
  m0.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb("374151") } };
  m0.alignment = { vertical: "middle", horizontal: "center" };
  for (let i = 0; i < N; i++) {
    const cell = gantt.getCell(HEAD_M_ROW, COL_A + 1 + i);
    cell.value = mlabel(months[i].y, months[i].m);
    cell.font = { bold: true, size: 10, color: "1F2937" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb("E8EEF7") } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  }
  gantt.getRow(HEAD_M_ROW).height = 18;

  // ── 轨道标签（轨道区底色统一白色，形状/数据颜色直接输出） ──
  tracks.forEach((t, ti) => {
    const r = FIRST_DATA_ROW + ti;
    gantt.getRow(r).height = 32;
    const aCell = gantt.getCell(r, COL_A);
    aCell.value = t.title || "(未命名)";
    aCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(t.label_color || "1565C0") } };
    aCell.font = { bold: true, size: 10, color: "FFFFFF" };
    aCell.alignment = { vertical: "middle", horizontal: "left" };
  });

  // ── 图例（表尾） ──
  const legendRow = FIRST_DATA_ROW + tracks.length + 1;
  gantt.mergeCells(legendRow, COL_A, legendRow, colCount);
  const legendCell = gantt.getCell(legendRow, COL_A);
  legendCell.value =
    "图例：蓝色轨道线=排期主线 · 圆角矩形=进度条 · 菱形=关键节点 · 红色虚线=参照线 —— 所有形状均可直接选中拖动/缩放/改色";
  legendCell.font = { size: 9, color: "6B7280", italic: true };
  legendCell.alignment = { vertical: "middle", horizontal: "left" };
  gantt.getRow(legendRow).height = 16;

  const baseBuf = await wb.xlsx.writeBuffer();

  // 注入可视化形状
  const drawingXml = buildDrawing(schedule);
  if (drawingXml) {
    return Buffer.from(await injectDrawing(Buffer.from(baseBuf), drawingXml));
  }
  return Buffer.from(baseBuf);
}
