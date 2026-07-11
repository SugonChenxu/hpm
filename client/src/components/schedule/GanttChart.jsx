import { useMemo } from "react";
import { Box, Typography } from "@mui/material";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import quarterOfYear from "dayjs/plugin/quarterOfYear";
import "dayjs/locale/zh-cn";
import { toDayjs } from "../../utils/schedule-date";
import EmptyState from "../common/EmptyState";
import GanttTimeline from "./GanttTimeline";
import GanttRow from "./GanttRow";
import GanttLinks from "./GanttLinks";

// ==============================
// 绘图常量（全组件统一，改一处即可缩放）
// ==============================
// 单位 → 每天像素宽（数值越小越"缩"）。真正的缩放模型：
// 单位越粗 → 每天像素越少 → 整图越"缩"，使日/周/月/季度真正改变显示比例。
const PX_PER_DAY = { day: 24, week: 12, month: 4, quarter: 1.5 };
const ROW_HEIGHT = 36; // 每行高
const BAR_HEIGHT = 22; // 条形高（垂直居中于行）
const HEADER_HEIGHT = 48; // 双行表头（月 24 + 周 24）
const NAME_COL_WIDTH = 220; // 左侧任务名列宽
const PAD_DAYS = 3; // 时间轴两端留白天数
const ARROW_GAP = 12; // 连线从条形端点外扩的水平距离
const TODAY_COLOR = "#ef4444"; // 今天线颜色

// 扩展 dayjs 插件（isoWeek 用于按「周一」分段周刻度；quarterOfYear 用于季度刻度）
dayjs.extend(isoWeek);
dayjs.extend(quarterOfYear);
dayjs.locale("zh-cn");

/**
 * 取色：优先 bg_color，否则按 completion_status 映射
 */
function resolveColor(task) {
  if (task.bg_color) return task.bg_color;
  switch (task.completion_status) {
    case "已完成":
      return "#22c55e";
    case "进行中":
      return "#f59e0b";
    case "未开始":
      return "#93c5fd";
    default:
      return "#93c5fd";
  }
}

/**
 * 安全解析 predecessor_ids（字符串 JSON 数组，如 "[1,3]"）
 * 解析失败 / null / 空 → 返回 []
 */
function parsePredecessors(str) {
  try {
    const parsed = JSON.parse(str || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.map(Number).filter((n) => !Number.isNaN(n));
  } catch {
    return [];
  }
}

/**
 * 生成刻度分段：自 timelineStart 起，按给定粒度（day/week/month/quarter/year）
 * 在 [timelineStart, timelineEnd] 范围内切分，返回 {label,x,width}[]
 * 所有坐标均相对 timelineStart，乘以 PX 即为像素位置。
 */
function buildSegments(timelineStart, timelineEnd, level, px, labelFn) {
  const segments = [];
  const startOf = (d) => {
    switch (level) {
      case "week":
        return d.startOf("isoWeek");
      case "month":
        return d.startOf("month");
      case "quarter":
        return d.startOf("quarter");
      case "year":
        return d.startOf("year");
      default:
        return d.startOf("day");
    }
  };
  const addUnit = (d) => {
    switch (level) {
      case "week":
        return d.add(1, "week");
      case "month":
        return d.add(1, "month");
      case "quarter":
        return d.add(1, "quarter");
      case "year":
        return d.add(1, "year");
      default:
        return d.add(1, "day");
    }
  };

  let cursor = startOf(timelineStart);
  let guard = 0;
  while (!cursor.isAfter(timelineEnd) && guard < 10000) {
    guard += 1;
    const segEnd = addUnit(cursor).subtract(1, "day"); // 含首尾
    const end = segEnd.isAfter(timelineEnd) ? timelineEnd : segEnd;
    const startX = cursor.diff(timelineStart, "day") * px;
    const days = end.diff(cursor, "day") + 1;
    segments.push({ label: labelFn(cursor), x: startX, width: days * px });
    cursor = addUnit(cursor);
  }
  return segments;
}

// 单位 → 主(minor 下行)/次(major 上行)刻度配置
const UNIT_CONFIG = {
  day: {
    minor: "day",
    minorLabel: (d) => d.format("DD"),
    major: "month",
    majorLabel: (d) => `${d.year()}年${d.month() + 1}月`,
  },
  week: {
    minor: "week",
    minorLabel: (d) => d.format("MM/DD"),
    major: "month",
    majorLabel: (d) => `${d.year()}年${d.month() + 1}月`,
  },
  month: {
    minor: "month",
    minorLabel: (d) => `${d.year()}年${d.month() + 1}月`,
    major: "quarter",
    majorLabel: (d) => `${d.year()}年 Q${d.quarter()}`,
  },
  quarter: {
    minor: "quarter",
    minorLabel: (d) => `${d.year()}年Q${d.quarter()}`,
    major: "year",
    majorLabel: (d) => `${d.year()}年`,
  },
};

/**
 * 纯函数：将扁平任务列表转换为甘特图绘图模型
 * 计算：时间轴范围 / 行模型 / id→rowIndex 映射 / FS 依赖连线 / 刻度分段 / 今天线
 * 防御：无效日期、无依赖、自依赖、缺失 id、坐标 NaN 一律跳过，绝不抛错
 */
function buildGanttModel(tasksInput, unit = "day") {
  const tasks = Array.isArray(tasksInput) ? tasksInput : [];
  const validTasks = tasks.filter(
    (t) => t && t.id != null && t.planned_start && t.planned_end
  );

  if (validTasks.length === 0) {
    return {
      empty: true,
      rowModels: [],
      links: [],
      majorSegments: [],
      minorSegments: [],
      gridLines: [],
      chartWidth: 0,
      chartHeight: 0,
      todayX: null,
    };
  }

  // 按单位取得「每天像素宽」
  const PX = PX_PER_DAY[unit] || PX_PER_DAY.day;

  // ---- 时间轴范围 ----
  const starts = validTasks.map((t) => toDayjs(t.planned_start));
  const ends = validTasks.map((t) => toDayjs(t.planned_end));
  const minStart = starts.reduce((a, b) => (b.isBefore(a) ? b : a));
  const maxEnd = ends.reduce((a, b) => (b.isAfter(a) ? b : a));
  const timelineStart = minStart.subtract(PAD_DAYS, "day");
  const timelineEnd = maxEnd.add(PAD_DAYS, "day");
  const totalDays = timelineEnd.diff(timelineStart, "day") + 1;
  const chartWidth = totalDays * PX;
  const chartHeight = validTasks.length * ROW_HEIGHT;

  // 相对时间轴起点的天数差 → 像素坐标（统一换算入口）
  const daysFromStart = (d) => toDayjs(d).diff(timelineStart, "day");

  // ---- 行模型（rowIndex = 数组下标，复用后端深度优先排序）----
  const rowModels = validTasks.map((t, i) => {
    const startDate = toDayjs(t.planned_start);
    const endDate = toDayjs(t.planned_end);
    const duration = Math.max(1, Number(t.duration_days) || 1);
    return {
      id: t.id,
      name: t.name || `任务${t.id}`,
      depth: Number(t.depth) || 0,
      taskType: t.task_type || "普通任务",
      status: t.completion_status || "未开始",
      bgColor: t.bg_color || null,
      durationDays: duration,
      rowIndex: i,
      startDate,
      endDate,
      x: daysFromStart(startDate) * PX,
      width: duration * PX,
      color: resolveColor(t),
    };
  });
  const idToRow = new Map(rowModels.map((m) => [m.id, m.rowIndex]));

  // ---- FS 依赖连线（lag=0）：from = 前置右端，to = 后继左端 ----
  const links = [];
  for (const t of validTasks) {
    const preds = parsePredecessors(t.predecessor_ids);
    const toRow = idToRow.get(t.id);
    if (toRow == null) continue;
    const to = rowModels[toRow];
    for (const pid of preds) {
      if (pid === t.id) continue; // 自依赖跳过
      const fromRow = idToRow.get(pid);
      if (fromRow == null) continue; // 缺失 id 跳过
      const from = rowModels[fromRow];
      const fromX = from.x + from.width;
      const fromY = from.rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
      const toX = to.x;
      const toY = to.rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
      if ([fromX, fromY, toX, toY].some((v) => Number.isNaN(v))) continue; // 坐标非法跳过
      links.push({
        fromId: pid,
        toId: t.id,
        fromRowIndex: from.rowIndex,
        toRowIndex: to.rowIndex,
        fromX,
        fromY,
        toX,
        toY,
      });
    }
  }

  // ---- 刻度分段（按 unit 切换粒度）----
  const cfg = UNIT_CONFIG[unit] || UNIT_CONFIG.day;
  const minorSegments = buildSegments(
    timelineStart,
    timelineEnd,
    cfg.minor,
    PX,
    cfg.minorLabel
  );
  const majorSegments = buildSegments(
    timelineStart,
    timelineEnd,
    cfg.major,
    PX,
    cfg.majorLabel
  );

  // ---- 竖向网格线（major 粗 / minor 细，去重）----
  const gridLines = [];
  majorSegments.forEach((s) => {
    if (s.x > 0) gridLines.push({ x: s.x, strong: true });
  });
  minorSegments.forEach((s) => {
    if (s.x > 0 && !majorSegments.some((m) => m.x === s.x)) {
      gridLines.push({ x: s.x, strong: false });
    }
  });

  // ---- 今天线（落在 [timelineStart, timelineEnd] 才画）----
  const today = dayjs().startOf("day");
  let todayX = null;
  if (!today.isBefore(timelineStart) && !today.isAfter(timelineEnd)) {
    todayX = daysFromStart(today) * PX;
  }

  return {
    empty: false,
    rowModels,
    links,
    majorSegments,
    minorSegments,
    gridLines,
    chartWidth,
    chartHeight,
    todayX,
  };
}

/**
 * 项目甘特图（只读展示组件）
 * 纯展示：数据由 SchedulePage 已取好的 tasks 通过 props 传入，组件内不发请求。
 *
 * Props:
 *   tasks — TaskDTO[]（已过滤后的可见任务，由 SchedulePage 传 visibleTasks）
 *   unit  — 'day' | 'week' | 'month' | 'quarter'，时间轴单位，决定像素缩放与刻度粒度
 */
export default function GanttChart({ tasks, unit = "day" }) {
  const model = useMemo(() => buildGanttModel(tasks, unit), [tasks, unit]);

  if (model.empty) {
    return (
      <Box sx={{ mt: 3 }}>
        <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600, color: "#1E1B2E" }}>
          项目甘特图
        </Typography>
        <EmptyState message="暂无排期，生成或导入排期后查看甘特图" />
      </Box>
    );
  }

  const {
    rowModels,
    links,
    majorSegments,
    minorSegments,
    gridLines,
    chartWidth,
    chartHeight,
    todayX,
  } = model;

  return (
    <Box sx={{ mt: 3 }}>
      <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600, color: "#1E1B2E" }}>
        项目甘特图
      </Typography>
      <Box sx={{ position: "relative", width: NAME_COL_WIDTH + chartWidth }}>
        <GanttTimeline
          majorSegments={majorSegments}
          minorSegments={minorSegments}
          unit={unit}
          chartWidth={chartWidth}
          nameColWidth={NAME_COL_WIDTH}
          headerHeight={HEADER_HEIGHT}
        />
        <Box sx={{ position: "relative" }}>
          {/* 竖向网格背景层 */}
          <Box
            sx={{
              position: "absolute",
              left: NAME_COL_WIDTH,
              top: 0,
              width: chartWidth,
              height: chartHeight,
              pointerEvents: "none",
              zIndex: 0,
            }}
          >
            {gridLines.map((g, i) => (
              <Box
                key={i}
                sx={{
                  position: "absolute",
                  left: g.x,
                  top: 0,
                  height: "100%",
                  borderLeft: g.strong ? "1px solid #E5E7EB" : "1px solid #F1F5F9",
                }}
              />
            ))}
          </Box>

          {/* 逐行条形 */}
          {rowModels.map((m) => (
            <GanttRow
              key={m.id}
              model={m}
              rowHeight={ROW_HEIGHT}
              barHeight={BAR_HEIGHT}
              nameColWidth={NAME_COL_WIDTH}
              chartWidth={chartWidth}
            />
          ))}

          {/* 依赖连线 + 今天线 SVG 叠加层 */}
          <GanttLinks
            links={links}
            chartWidth={chartWidth}
            chartHeight={chartHeight}
            nameColWidth={NAME_COL_WIDTH}
            todayX={todayX}
            arrowGap={ARROW_GAP}
            todayColor={TODAY_COLOR}
          />
        </Box>
      </Box>
    </Box>
  );
}
