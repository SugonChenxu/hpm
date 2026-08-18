/**
 * 快速排期 → PPTX 导出
 *
 * 将排期甘特图映射为 PowerPoint 原生形状：
 *   - 轨道线（arrow bar）→ 直线 + 右端箭头
 *   - 进度条（bar）→ 纯色矩形（内嵌文字）+ 白色斜纹底纹
 *   - 关键节点（milestone）→ 圆/方块/菱形/三角/五角星 + 文字
 *   - 时间轴 → 季度（红底）+ 月份（浅红底）两行，含分割线
 *   - 整体 → 圆角毛玻璃边框；轨道名称保留浅色底纹；底部统计
 *   - 节点/进度条 与各自文字自动组合（<p:grpSp>），拖动即整体移动
 *
 * 说明：pptxgenjs 4.x 不支持形状组合，故生成后 post-process 把相关 <p:sp>
 * 包进 <p:grpSp>，实现「自动成组」。
 */

import PptxGenJS from "pptxgenjs";

function parseDateUTC(s) {
  const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
  return Date.UTC(y || 1970, (m || 1) - 1, d || 1);
}

function toDateStr(t) {
  const y = t.getUTCFullYear();
  const m = String(t.getUTCMonth() + 1).padStart(2, "0");
  const d = String(t.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function daysBetween(a, b) {
  return Math.round((parseDateUTC(b) - parseDateUTC(a)) / 86400000);
}

function stripHash(hex) {
  return String(hex || "1565C0").replace("#", "");
}

const SYMBOL_SHAPE = {
  circle: "ellipse",
  square: "rect",
  diamond: "diamond",
  triangle: "triangle",
  star: "star5",
  flag: "triangle",
};

function buildQuarters(startDate, endDate) {
  const quarters = [];
  const startT = parseDateUTC(startDate);
  const endT = parseDateUTC(endDate);
  let cur = new Date(Date.UTC(new Date(startT).getUTCFullYear(), new Date(startT).getUTCMonth(), 1));
  while (cur.getTime() <= endT) {
    const year = cur.getUTCFullYear();
    const month = cur.getUTCMonth();
    const q = Math.floor(month / 3) + 1;
    const qStart = new Date(Date.UTC(year, (q - 1) * 3, 1));
    const qEnd = new Date(Date.UTC(year, (q - 1) * 3 + 3, 0));
    const labelStart = qStart.getTime() < startT ? startT : qStart.getTime();
    const labelEnd = qEnd.getTime() > endT ? endT : qEnd.getTime();
    quarters.push({
      label: `${year} Q${q}`,
      startDate: toDateStr(new Date(labelStart)),
      endDate: toDateStr(new Date(labelEnd)),
    });
    cur = new Date(Date.UTC(year, (q - 1) * 3 + 3, 1));
  }
  return quarters;
}

function buildMonths(startDate, endDate) {
  const months = [];
  const startT = parseDateUTC(startDate);
  const endT = parseDateUTC(endDate);
  let cur = new Date(Date.UTC(new Date(startT).getUTCFullYear(), new Date(startT).getUTCMonth(), 1));
  while (cur.getTime() <= endT) {
    const y = cur.getUTCFullYear();
    const m = cur.getUTCMonth();
    const mStart = new Date(Date.UTC(y, m, 1));
    const mEnd = new Date(Date.UTC(y, m + 1, 0));
    const labelStart = mStart.getTime() < startT ? startT : mStart.getTime();
    const labelEnd = mEnd.getTime() > endT ? endT : mEnd.getTime();
    months.push({
      label: `${m + 1}月`,
      startDate: toDateStr(new Date(labelStart)),
      endDate: toDateStr(new Date(labelEnd)),
    });
    cur = new Date(Date.UTC(y, m + 1, 1));
  }
  return months;
}

/** 追踪 slide 中形状的添加顺序，用于 post-process 组合 */
class SlideBuilder {
  constructor(slide) {
    this.slide = slide;
    this.seq = 0;
    this.groups = [];
  }
  addShape(type, opts) {
    this.slide.addShape(type, opts);
    return this.seq++;
  }
  addText(text, opts) {
    this.slide.addText(text, opts);
    return this.seq++;
  }
  addGroup(spSeqs) {
    this.groups.push(spSeqs);
  }
}

/** 进度条：纯色矩形（内嵌文字）+ 白色斜纹，返回组内 sp 顺序号 */
function addBarShape(builder, x, y, w, h, color, title) {
  const mainSeq = builder.addText(title || "", {
    shape: "rect",
    x, y, w, h,
    fill: { color: stripHash(color) },
    line: { color: "FFFFFF", width: 0.5 },
    fontSize: 8, color: "FFFFFF", bold: true, align: "center", valign: "middle",
  });
  // 白色斜纹：长度 = h*1.5（旋转后垂直跨度≈h，不溢出）
  const hatchSeqs = [];
  const stripeLen = h * 1.5;
  const step = 0.09;
  const count = Math.max(1, Math.ceil((w + h) / step));
  for (let i = 0; i <= count; i++) {
    const cx = x - h + i * step;
    const cy = y + h / 2;
    hatchSeqs.push(
      builder.addShape("rect", {
        x: cx - 0.02, y: cy - stripeLen / 2, w: 0.04, h: stripeLen,
        rotate: 45,
        fill: { color: "FFFFFF", transparency: 55 },
        line: { type: "none" },
      })
    );
  }
  return [mainSeq, ...hatchSeqs];
}

/** 把组内 sp 包成 <p:grpSp>（子坐标转为相对 chOff） */
function buildGrpSp(name, memberSps) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const items = memberSps.map((sp) => {
    const off = /<a:off x="(-?\d+)" y="(-?\d+)"\/>/.exec(sp);
    const ext = /<a:ext cx="(-?\d+)" cy="(-?\d+)"\/>/.exec(sp);
    const x = off ? Number(off[1]) : 0;
    const y = off ? Number(off[2]) : 0;
    const cx = ext ? Number(ext[1]) : 0;
    const cy = ext ? Number(ext[2]) : 0;
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + cx); maxY = Math.max(maxY, y + cy);
    return { sp, x, y };
  });
  // 子形状保持绝对坐标（PowerPoint 的 group 子形状用绝对坐标，无需转相对）
  const children = items.map(({ sp }) => sp);
  const extCx = maxX - minX;
  const extCy = maxY - minY;
  const id = Math.floor(100000 + Math.random() * 800000);
  return (
    `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
    `<p:grpSpPr><a:xfrm><a:off x="${minX}" y="${minY}"/><a:ext cx="${extCx}" cy="${extCy}"/>` +
    `<a:chOff x="${minX}" y="${minY}"/><a:chExt cx="${extCx}" cy="${extCy}"/></a:xfrm></p:grpSpPr>` +
    children.join("") + `</p:grpSp>`
  );
}

/** 按 groups（spSeqs = 0-based 形状顺序号）把 slide XML 里对应 <p:sp> 组合 */
function applyGroups(xml, groups) {
  if (!groups || groups.length === 0) return xml;
  const re = /<p:sp>.*?<\/p:sp>/gs;
  const matches = [...xml.matchAll(re)];
  if (matches.length === 0) return xml;

  const prefix = xml.slice(0, matches[0].index);
  const last = matches[matches.length - 1];
  const suffix = xml.slice(last.index + last[0].length);
  const sps = matches.map((m) => m[0]);

  const groupOf = new Array(sps.length).fill(null);
  groups.forEach((spSeqs, gi) => {
    for (const seq of spSeqs) if (seq < sps.length) groupOf[seq] = { gi, spSeqs };
  });

  const out = [];
  let i = 0;
  while (i < sps.length) {
    const g = groupOf[i];
    if (g) {
      const idxs = g.spSeqs.slice().sort((a, b) => a - b);
      const members = idxs.map((idx) => sps[idx]);
      out.push(buildGrpSp(`Group ${g.gi + 1}`, members));
      i = idxs[idxs.length - 1] + 1;
    } else {
      out.push(sps[i]);
      i++;
    }
  }
  return prefix + out.join("") + suffix;
}

async function groupShapes(buf, slidesMeta) {
  const hasGroups = slidesMeta.some((g) => g.length > 0);
  if (!hasGroups) return buf;
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buf);
  for (let i = 0; i < slidesMeta.length; i++) {
    const groups = slidesMeta[i];
    if (!groups || groups.length === 0) continue;
    const path = `ppt/slides/slide${i + 1}.xml`;
    let xml = await zip.file(path).async("string");
    xml = applyGroups(xml, groups);
    zip.file(path, xml);
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

export async function buildSchedulePptx(schedule) {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "WIDE", width: 13.33, height: 7.5 });
  pptx.layout = "WIDE";
  pptx.author = "Forge";
  pptx.subject = "快速排期";
  pptx.title = schedule.title || "快速排期";

  const start = schedule.start_date;
  const end = schedule.end_date;
  const totalDays = daysBetween(start, end) + 1;
  const tracks = schedule.tracks || [];

  const LABEL_W = 1.7;
  const GANTT_X = 1.9;
  const GANTT_W = 11.0;
  const GANTT_TOP = 1.58;
  const ROW_H = 0.5;
  const MAX_TRACKS = 11;
  const dayW = GANTT_W / totalDays;

  const xForDate = (d) => GANTT_X + daysBetween(start, d) * dayW;
  const quarters = buildQuarters(start, end);
  const months = buildMonths(start, end);
  const pageCount = Math.max(1, Math.ceil(tracks.length / MAX_TRACKS));

  let barCount = 0;
  let msCount = 0;
  for (const t of tracks) {
    barCount += (t.bars || []).filter((b) => b.style !== "arrow").length;
    msCount += (t.milestones || []).length;
  }

  const slidesMeta = [];

  for (let page = 0; page < pageCount; page++) {
    const pageTracks = tracks.slice(page * MAX_TRACKS, (page + 1) * MAX_TRACKS);
    const slide = pptx.addSlide();
    const B = new SlideBuilder(slide);

    // 整体毛玻璃边框
    B.addShape("roundRect", {
      x: 0.32, y: 0.12, w: 12.69, h: 7.26, rectRadius: 0.14,
      fill: { color: "FFFFFF", transparency: 88 },
      line: { color: "94A3B8", width: 1 },
    });

    // 标题 + 日期范围
    B.addText(schedule.title || "快速排期", {
      x: 0.55, y: 0.24, w: 12.2, h: 0.42, fontSize: 19, bold: true, color: "1F2937",
    });
    B.addText(`${start} ~ ${end} · 共 ${totalDays} 天${pageCount > 1 ? ` · 第 ${page + 1}/${pageCount} 页` : ""}`, {
      x: 0.55, y: 0.64, w: 12.2, h: 0.26, fontSize: 10, color: "6B7280",
    });

    // 季度行（红底，含分割线）
    for (const q of quarters) {
      const qx = xForDate(q.startDate);
      const qw = Math.max(0.1, daysBetween(q.startDate, q.endDate) * dayW + dayW);
      B.addText(q.label, {
        x: qx, y: 0.94, w: qw, h: 0.28, fontSize: 9, bold: true, color: "FFFFFF",
        fill: { color: "A94442" }, line: { color: "FFFFFF", width: 0.75 },
        align: "center", valign: "middle",
      });
    }
    // 月份行（浅红底，含分割线）
    for (const m of months) {
      const mx = xForDate(m.startDate);
      const mw = Math.max(0.06, daysBetween(m.startDate, m.endDate) * dayW + dayW);
      const label = mw < 0.3 ? m.label.replace("月", "") : m.label;
      B.addText(label, {
        x: mx, y: 1.24, w: mw, h: 0.26, fontSize: 8, color: "FFFFFF",
        fill: { color: "D9A6A5" }, line: { color: "FFFFFF", width: 0.75 },
        align: "center", valign: "middle",
      });
    }

    // 每条轨道
    pageTracks.forEach((track, i) => {
      const rowY = GANTT_TOP + i * ROW_H;
      const centerY = rowY + ROW_H / 2;

      // 标签底纹 + 色块 + 名称
      B.addShape("rect", {
        x: 0.42, y: rowY + 0.03, w: LABEL_W - 0.3, h: ROW_H - 0.06,
        fill: { color: stripHash(track.label_color), transparency: 88 },
        line: { type: "none" },
      });
      B.addShape("rect", {
        x: 0.5, y: centerY - 0.07, w: 0.14, h: 0.14,
        fill: { color: stripHash(track.label_color) }, line: { type: "none" },
      });
      B.addText(track.title || "(未命名)", {
        x: 0.7, y: rowY, w: LABEL_W - 0.55, h: ROW_H, fontSize: 9, color: "374151",
        valign: "middle", align: "left", isTextBox: true,
      });

      // 进度条（含箭头直线）
      for (const bar of track.bars || []) {
        if (bar.style === "arrow") {
          const lx = xForDate(bar.start_date);
          const lw = Math.max(0.1, daysBetween(bar.start_date, bar.end_date) * dayW);
          B.addShape("line", {
            x: lx, y: centerY, w: lw, h: 0,
            line: { color: stripHash(bar.color), width: 1.5, endArrowType: "arrow" },
          });
        } else {
          const bx = xForDate(bar.start_date);
          const bw = Math.max(0.08, daysBetween(bar.start_date, bar.end_date) * dayW + dayW);
          const seqs = addBarShape(B, bx, centerY - 0.11, bw, 0.22, bar.color, bar.title);
          B.addGroup(seqs); // 进度条 + 文字 + 斜纹 自动成组
        }
      }

      // 关键节点（符号 + 文字 自动成组）
      for (const ms of track.milestones || []) {
        const shape = SYMBOL_SHAPE[ms.symbol] || "ellipse";
        const mx = xForDate(ms.date);
        const size = 0.16;
        const symSeq = B.addShape(shape, {
          x: mx - size / 2, y: centerY - size / 2, w: size, h: size,
          fill: { color: stripHash(ms.color) }, line: { type: "none" },
        });
        const txtSeq = B.addText(ms.title || "", {
          x: mx - 0.55, y: centerY + size / 2 + 0.02, w: 1.1, h: 0.2,
          fontSize: 7.5, color: stripHash(ms.text_color || "000000"), align: "center",
        });
        B.addGroup([symSeq, txtSeq]);
      }
    });

    // 底部统计（保留网页版底部状态）
    B.addText(`共 ${tracks.length} 个轨道 · ${barCount} 个进度条 · ${msCount} 个节点`, {
      x: 0.55, y: 7.12, w: 12.2, h: 0.24, fontSize: 9, color: "6B7280", align: "right",
    });

    slidesMeta.push(B.groups);
  }

  const buf = await pptx.write({ outputType: "nodebuffer" });
  return groupShapes(buf, slidesMeta);
}
