/**
 * 快速排期 → PPTX 导出
 *
 * 将排期甘特图映射为 PowerPoint 原生形状：
 *   - 轨道线（arrow bar）→ 直线 + 右端箭头
 *   - 进度条（bar）→ 纯色矩形 + 居中白字
 *   - 关键节点（milestone）→ 圆/方块/菱形/三角/五角星 + 文字
 *   - 时间轴 → 季度标签（红底白字）
 *
 * 生成 .pptx 后，所有形状均可自由拖动、调整大小（PPT 原生能力）。
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

// 节点符号 → PPT 形状类型
const SYMBOL_SHAPE = {
  circle: "ellipse",
  square: "rect",
  diamond: "diamond",
  triangle: "triangle",
  star: "star5",
  flag: "triangle", // 旗帜用三角简化
};

// 将时间跨度拆成季度标签
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

  // 布局常量（英寸）
  const LABEL_W = 1.7;
  const GANTT_X = 1.9;
  const GANTT_W = 11.0;
  const GANTT_TOP = 1.5;
  const ROW_H = 0.5;
  const MAX_TRACKS = 11; // 每页最多轨道数
  const dayW = GANTT_W / totalDays;

  const xForDate = (d) => GANTT_X + daysBetween(start, d) * dayW;
  const quarters = buildQuarters(start, end);
  const pageCount = Math.max(1, Math.ceil(tracks.length / MAX_TRACKS));

  for (let page = 0; page < pageCount; page++) {
    const pageTracks = tracks.slice(page * MAX_TRACKS, (page + 1) * MAX_TRACKS);
    const slide = pptx.addSlide();

    // 标题 + 日期范围
    slide.addText(schedule.title || "快速排期", {
      x: 0.5, y: 0.22, w: 12.3, h: 0.45, fontSize: 20, bold: true, color: "1F2937",
    });
    slide.addText(`${start} ~ ${end} · 共 ${totalDays} 天${pageCount > 1 ? ` · 第 ${page + 1}/${pageCount} 页` : ""}`, {
      x: 0.5, y: 0.68, w: 12.3, h: 0.3, fontSize: 10, color: "6B7280",
    });

    // 时间轴季度标签
    for (const q of quarters) {
      const qx = xForDate(q.startDate);
      const qw = Math.max(0.1, daysBetween(q.startDate, q.endDate) * dayW + dayW);
      slide.addText(q.label, {
        x: qx, y: 1.04, w: qw, h: 0.3, fontSize: 9, bold: true, color: "FFFFFF",
        fill: { color: "A94442" }, align: "center", valign: "middle",
      });
    }

    // 每条轨道
    pageTracks.forEach((track, i) => {
      const rowY = GANTT_TOP + i * ROW_H;
      const centerY = rowY + ROW_H / 2;

      // 左侧标签：色块 + 名称
      slide.addShape("rect", {
        x: 0.4, y: centerY - 0.07, w: 0.14, h: 0.14,
        fill: { color: stripHash(track.label_color) }, line: { type: "none" },
      });
      slide.addText(track.title || "(未命名)", {
        x: 0.58, y: rowY, w: LABEL_W - 0.34, h: ROW_H, fontSize: 9, color: "374151",
        valign: "middle", align: "left", isTextBox: true,
      });

      // 进度条（含箭头直线）
      for (const bar of track.bars || []) {
        if (bar.style === "arrow") {
          const lx = xForDate(bar.start_date);
          const lw = Math.max(0.1, daysBetween(bar.start_date, bar.end_date) * dayW);
          slide.addShape("line", {
            x: lx, y: centerY, w: lw, h: 0,
            line: { color: stripHash(bar.color), width: 1.5, endArrowType: "arrow" },
          });
        } else {
          const bx = xForDate(bar.start_date);
          const bw = Math.max(0.08, daysBetween(bar.start_date, bar.end_date) * dayW + dayW);
          slide.addShape("rect", {
            x: bx, y: centerY - 0.11, w: bw, h: 0.22,
            fill: { color: stripHash(bar.color) }, line: { color: "FFFFFF", width: 0.75 },
          });
          slide.addText(bar.title || "", {
            x: bx, y: centerY - 0.11, w: bw, h: 0.22, fontSize: 8, color: "FFFFFF",
            bold: true, align: "center", valign: "middle",
          });
        }
      }

      // 关键节点
      for (const ms of track.milestones || []) {
        const shape = SYMBOL_SHAPE[ms.symbol] || "ellipse";
        const mx = xForDate(ms.date);
        const size = 0.16;
        slide.addShape(shape, {
          x: mx - size / 2, y: centerY - size / 2, w: size, h: size,
          fill: { color: stripHash(ms.color) }, line: { type: "none" },
        });
        slide.addText(ms.title || "", {
          x: mx - 0.55, y: centerY + size / 2 + 0.02, w: 1.1, h: 0.2,
          fontSize: 7.5, color: stripHash(ms.text_color || "000000"), align: "center",
        });
      }
    });
  }

  return pptx.write({ outputType: "nodebuffer" });
}
