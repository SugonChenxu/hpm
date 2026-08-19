/**
 * 快速排期 → XLSX 导出（可视化甘特图版）
 *
 * 与 PPT 导出类似的「可视化、可在 Excel 中直接拖动调整」的简易甘特图：
 *   - 进度条 → 圆角矩形（可拖动 / 改大小）
 *   - 箭头直线 → 细横条
 *   - 关键节点 → 菱形 + 名称文本框
 *   - 参照线 → 贯穿全部轨道的竖条 + 名称文本框
 *
 * 实现方式：先用 ExcelJS 生成「日期网格 + 轨道标签」骨架，再用 jszip 向 xlsx
 * 注入 spreadsheetDrawing（xl/drawings/drawing1.xml），把上述对象作为真正的
 * Excel 绘图形状叠放在网格之上。形状用单元格锚定（twoCellAnchor），与网页版、
 * PPT 版保持同一套「不含首尾」日期语义。
 */

import ExcelJS from "exceljs";
import JSZip from "jszip";

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
const argb = (hex, alpha = "FF") => alpha + stripHash(hex);

const SYMBOL_GEOM = {
  circle: "ellipse",
  square: "roundRect",
  triangle: "triangle",
  diamond: "diamond",
  star: "star5",
  flag: "roundRect",
};

// 网格布局常量（1-based 行列）
const TITLE_ROW = 1;
const SUB_ROW = 2;
const HEAD_ROW = 3;
const FIRST_DATA_ROW = 4;
const COL_A = 1; // 轨道名列（1-based）
// 0-based 映射
const DATE_COL0 = COL_A; // 日期列从 B 列起，0-based = 1
const ROW0_FIRST = FIRST_DATA_ROW - 1; // = 3

const ROW_EMU = 279400; // 22pt 行高（EMU）
const DATE_COL_WIDTH = 4; // 字符宽
const DATE_COL_EMU = Math.round((DATE_COL_WIDTH * 7 + 5) * 9525);
const BAR_PAD = 20000; // 进度条上下内边距
const ARROW_TOP = 95000;
const ARROW_BOT = 185000;
const MS_INSET = 40000;

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** 生成一个形状锚点（twoCellAnchor） */
function shapeAnchor({ id, name, colFrom, rowFrom, colOffFrom, rowOffFrom, colTo, rowTo, colOffTo, rowOffTo, fillHex, fillMode = "solid", geom = "roundRect", text, textColor = "FFFFFF" }) {
  const fillXml = fillMode === "none" ? "<a:noFill/>" : `<a:solidFill><a:srgbClr val="${fillHex}"/></a:solidFill>`;
  let txBody = "";
  if (text) {
    txBody =
      `<xdr:txBody><a:bodyPr vert="horz" lIns="36000" tIns="18000" rIns="36000" bIns="18000" anchor="ctr" wrap="square"/>` +
      `<a:lstStyle/><a:p><a:pPr algn="ctr"/>` +
      `<a:r><a:rPr lang="zh-CN" sz="900" b="1"><a:solidFill><a:srgbClr val="${textColor}"/></a:solidFill></a:rPr>` +
      `<a:t>${esc(text)}</a:t></a:r></a:p></xdr:txBody>`;
  }
  return (
    `<xdr:twoCellAnchor>` +
    `<xdr:from><xdr:col>${colFrom}</xdr:col><xdr:colOff>${colOffFrom}</xdr:colOff><xdr:row>${rowFrom}</xdr:row><xdr:rowOff>${rowOffFrom}</xdr:rowOff></xdr:from>` +
    `<xdr:to><xdr:col>${colTo}</xdr:col><xdr:colOff>${colOffTo}</xdr:colOff><xdr:row>${rowTo}</xdr:row><xdr:rowOff>${rowOffTo}</xdr:rowOff></xdr:to>` +
    `<xdr:sp><xdr:nvSpPr><xdr:cNvPr id="${id}" name="${esc(name)}"/><xdr:cNvSpPr/></xdr:nvSpPr>` +
    `<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></a:xfrm>` +
    `<a:prstGeom prst="${geom}"><a:avLst/></a:prstGeom>${fillXml}<a:ln><a:noFill/></a:ln></xdr:spPr>` +
    `${txBody}` +
    `<xdr:style><a:lnRef idx="0"><a:schemeClr val="accent1"/></a:lnRef><a:fillRef idx="0"><a:schemeClr val="accent1"/></a:fillRef>` +
    `<a:effectRef idx="0"><a:schemeClr val="accent1"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="tx1"/></a:fontRef></xdr:style>` +
    `</xdr:sp><xdr:clientData/></xdr:twoCellAnchor>`
  );
}

/** 构建 drawing1.xml 的全部锚点 */
function buildDrawing(schedule) {
  const start = schedule.start_date;
  const end = schedule.end_date;
  const totalDays = daysBetween(start, end) + 1;
  const tracks = schedule.tracks || [];
  const vlines = schedule.vlines || [];

  const anchors = [];
  let id = 1;

  const dateCol0 = (dateStr) => DATE_COL0 + daysBetween(start, dateStr);

  // 进度条 / 箭头 / 节点
  tracks.forEach((t, ti) => {
    const row0 = ROW0_FIRST + ti;
    for (const b of t.bars || []) {
      const s = dateCol0(b.start_date);
      const e = dateCol0(b.end_date);
      const colTo = e + 1; // 含首日、末日整格
      if (b.style === "arrow") {
        anchors.push(
          shapeAnchor({
            id: id++, name: `arrow_${ti}_${b.id || id}`,
            colFrom: s, rowFrom: row0, colOffFrom: 0, rowOffFrom: ARROW_TOP,
            colTo, rowTo: row0, colOffTo: 0, rowOffTo: ARROW_BOT,
            fillHex: stripHash(b.color), geom: "rect",
            text: b.title, textColor: "FFFFFF",
          })
        );
      } else {
        anchors.push(
          shapeAnchor({
            id: id++, name: `bar_${ti}_${b.id || id}`,
            colFrom: s, rowFrom: row0, colOffFrom: 0, rowOffFrom: BAR_PAD,
            colTo, rowTo: row0, colOffTo: 0, rowOffTo: ROW_EMU - BAR_PAD,
            fillHex: stripHash(b.color), geom: "roundRect",
            text: b.title, textColor: "FFFFFF",
          })
        );
      }
    }
    for (const m of t.milestones || []) {
      const c = dateCol0(m.date);
      const left = Math.round(DATE_COL_EMU * 0.3);
      const right = Math.round(DATE_COL_EMU * 0.7);
      const geom = SYMBOL_GEOM[m.symbol] || "diamond";
      anchors.push(
        shapeAnchor({
          id: id++, name: `ms_${ti}_${m.id || id}`,
          colFrom: c, rowFrom: row0, colOffFrom: left, rowOffFrom: MS_INSET,
          colTo: c + 1, rowTo: row0, colOffTo: right, rowOffTo: ROW_EMU - MS_INSET,
          fillHex: stripHash(m.color), geom,
        })
      );
      if (m.title) {
        anchors.push(
          shapeAnchor({
            id: id++, name: `ms_t_${ti}_${m.id || id}`,
            colFrom: c + 1, rowFrom: row0, colOffFrom: 0, rowOffFrom: MS_INSET,
            colTo: c + 4, rowTo: row0, colOffTo: 0, rowOffTo: ROW_EMU - MS_INSET,
            fillMode: "none", geom: "rect",
            text: m.title, textColor: "1F2937",
          })
        );
      }
    }
  });

  // 参照线
  const lastRow0 = ROW0_FIRST + tracks.length; // 末行之后
  for (const v of vlines) {
    const c = dateCol0(v.date);
    const half = Math.round(DATE_COL_EMU / 2);
    const lw = 16000;
    anchors.push(
      shapeAnchor({
        id: id++, name: `vline_${v.id || id}`,
        colFrom: c, rowFrom: ROW0_FIRST, colOffFrom: half - lw, rowOffFrom: 0,
        colTo: c, rowTo: lastRow0, colOffTo: half + lw, rowOffTo: 0,
        fillHex: stripHash(v.color) || "A94442", geom: "rect",
      })
    );
    if (v.title) {
      anchors.push(
        shapeAnchor({
          id: id++, name: `vline_t_${v.id || id}`,
          colFrom: c, rowFrom: ROW0_FIRST, colOffFrom: half + lw + 4000, rowOffFrom: 0,
          colTo: c + 3, rowTo: ROW0_FIRST, colOffTo: 0, rowOffTo: ROW_EMU,
          fillMode: "none", geom: "rect",
          text: v.title, textColor: "A94442",
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
  const totalDays = daysBetween(start, end) + 1;
  const tracks = schedule.tracks || [];
  const vlines = schedule.vlines || [];

  // 统计
  let barCount = 0, arrowCount = 0, msCount = 0;
  for (const t of tracks) {
    for (const b of t.bars || []) b.style === "arrow" ? arrowCount++ : barCount++;
    msCount += (t.milestones || []).length;
  }

  // 单工作表：甘特图（网格骨架）
  const gantt = wb.addWorksheet("甘特图", { views: [{ state: "frozen", xSplit: 1, ySplit: 3 }] });

  const colCount = COL_A + totalDays; // A 列 + 每日一列
  gantt.mergeCells(TITLE_ROW, COL_A, TITLE_ROW, colCount);
  const titleCell = gantt.getCell(TITLE_ROW, COL_A);
  titleCell.value = schedule.title || "快速排期";
  titleCell.font = { bold: true, size: 15, color: "1F2937" };
  titleCell.alignment = { vertical: "middle", horizontal: "left" };

  gantt.mergeCells(SUB_ROW, COL_A, SUB_ROW, colCount);
  const subCell = gantt.getCell(SUB_ROW, COL_A);
  subCell.value = `${start} ~ ${end} · 共 ${totalDays} 天 · ${tracks.length} 轨道 / ${barCount} 进度条 / ${arrowCount} 箭头线 / ${msCount} 节点 · 可直接拖动形状调整`;
  subCell.font = { size: 10, color: "6B7280" };
  subCell.alignment = { vertical: "middle", horizontal: "left" };

  // 列宽
  gantt.getColumn(COL_A).width = 18;
  for (let i = 0; i < totalDays; i++) gantt.getColumn(COL_A + 1 + i).width = DATE_COL_WIDTH;

  // 表头（日期）
  const headCell = gantt.getCell(HEAD_ROW, COL_A);
  headCell.value = "轨道";
  headCell.font = { bold: true, color: "FFFFFF" };
  headCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb("374151") } };
  headCell.alignment = { vertical: "middle", horizontal: "center" };

  for (let d = 0; d < totalDays; d++) {
    const dateStr = addDaysStr(start, d);
    const mm = dateStr.slice(5, 7);
    const dd = dateStr.slice(8);
    const c = gantt.getCell(HEAD_ROW, COL_A + 1 + d);
    c.value = dd === "01" ? `${Number(mm)}月` : Number(dd);
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: Number(mm) % 2 === 0 ? argb("EEF2F7") : argb("FFFFFF") } };
    c.font = { size: 8, color: "374151", bold: dd === "01" };
    c.alignment = { vertical: "middle", horizontal: "center" };
  }

  // 轨道行（标签 + 行高）
  tracks.forEach((t, ti) => {
    const r = FIRST_DATA_ROW + ti;
    gantt.getRow(r).height = 22;
    const aCell = gantt.getCell(r, COL_A);
    aCell.value = t.title || "(未命名)";
    aCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(t.label_color || "1565C0") } };
    aCell.font = { bold: true, color: "FFFFFF" };
    aCell.alignment = { vertical: "middle", horizontal: "left" };
  });

  const baseBuf = await wb.xlsx.writeBuffer();

  // 注入可视化形状
  const drawingXml = buildDrawing(schedule);
  if (drawingXml) {
    return Buffer.from(await injectDrawing(Buffer.from(baseBuf), drawingXml));
  }
  return Buffer.from(baseBuf);
}
