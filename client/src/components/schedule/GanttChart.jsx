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
// 绘图常量
// ==============================
const ROW_HEIGHT = 36;
const BAR_HEIGHT = 22;
const HEADER_HEIGHT = 28;
const NAME_COL_WIDTH = 220;
const PAD_DAYS = 3;
const ARROW_GAP = 12;
const TODAY_COLOR = "#ef4444";

// 单位像素配置
const UNIT_PX = { day: 28, week: 40, month: 56, quarter: 72 };
const MIN_BAR_PX = 3;

// 扩展 dayjs 插件
dayjs.extend(isoWeek);
dayjs.extend(quarterOfYear);
dayjs.locale("zh-cn");

// ==============================
// 工具函数
// ==============================

/** 取色：优先 bg_color，否则按 completion_status 映射 */
function resolveColor(task) {
  if (task.bg_color) return task.bg_color;
  switch (task.completion_status) {
    case "已完成": return "#22c55e";
    case "进行中": return "#f59e0b";
    case "未开始": return "#93c5fd";
    default: return "#93c5fd";
  }
}

/** 安全解析 predecessor_ids */
function parsePredecessors(str) {
  try {
    const parsed = JSON.parse(str || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.map(Number).filter((n) => !Number.isNaN(n));
  } catch {
    return [];
  }
}

/** 过滤折叠子任务——与 ScheduleTable 保持一致 */
function filterVisibleTasks(tasks, collapsedPhases) {
  if (!collapsedPhases || collapsedPhases.size === 0) return tasks;
  const hidden = new Set();
  for (const task of tasks) {
    if (task.task_type === "阶段任务" && collapsedPhases.has(task.id)) {
      const collectDescendants = (parentId) => {
        for (const t of tasks) {
          if (t.parent_id === parentId) {
            hidden.add(t.id);
            collectDescendants(t.id);
          }
        }
      };
      collectDescendants(task.id);
    }
  }
  return tasks.filter((t) => !hidden.has(t.id));
}

// ==============================
// 核心：单位感知模型构建
// ==============================

/**
 * 将日期 diff 转为像素（单位感知，使用 dayjs 分数 diff 保证精度）
 */
function dateToPixel(date, timelineStart, unit) {
  return date.diff(timelineStart, unit, true) * (UNIT_PX[unit] || 24);
}

/**
 * 构建甘特图绘图模型
 */
function buildGanttModel(tasksInput, unit, collapsedPhases) {
  const pxPerUnit = UNIT_PX[unit] || 24;

  // 1) 过滤可见任务
  const visible = filterVisibleTasks(tasksInput, collapsedPhases);

  // 2) 过滤有效任务
  const validTasks = visible.filter(
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

  // 3) 时间轴范围（以天为单位计算边界）
  const starts = validTasks.map((t) => toDayjs(t.planned_start));
  const ends = validTasks.map((t) => toDayjs(t.planned_end));
  const minStart = starts.reduce((a, b) => (b.isBefore(a) ? b : a));
  const maxEnd = ends.reduce((a, b) => (b.isAfter(a) ? b : a));
  const timelineStart = minStart.subtract(PAD_DAYS, "day");
  const timelineEnd = maxEnd.add(PAD_DAYS, "day");

  // 4) 图表总宽（单位感知）
  const totalUnits = timelineEnd.diff(timelineStart, unit, true);
  const chartWidth = Math.ceil(totalUnits * pxPerUnit);
  const chartHeight = validTasks.length * ROW_HEIGHT;

  // 5) 行模型
  const rowModels = validTasks.map((t, i) => {
    const startDate = toDayjs(t.planned_start);
    const endDate = toDayjs(t.planned_end);
    const x = dateToPixel(startDate, timelineStart, unit);
    let width = dateToPixel(endDate, timelineStart, unit) - x;
    width = Math.max(width, MIN_BAR_PX);
    return {
      id: t.id,
      name: t.name || `任务${t.id}`,
      depth: Number(t.depth) || 0,
      taskType: t.task_type || "普通任务",
      status: t.completion_status || "未开始",
      bgColor: t.bg_color || null,
      durationDays: Math.max(1, Number(t.duration_days) || 1),
      rowIndex: i,
      startDate,
      endDate,
      x,
      width,
      color: resolveColor(t),
    };
  });
  const idToRow = new Map(rowModels.map((m) => [m.id, m.rowIndex]));

  // 5.1) 节点任务中心线 x（用于甘特图贯穿虚线标尺）
  const nodeLines = rowModels
    .filter((m) => m.taskType === "节点任务")
    .map((m) => ({ x: m.x + m.width / 2, name: m.name }));

  // 6) FS 依赖连线
  const links = [];
  for (const t of validTasks) {
    const preds = parsePredecessors(t.predecessor_ids);
    const toRow = idToRow.get(t.id);
    if (toRow == null) continue;
    const to = rowModels[toRow];
    for (const pid of preds) {
      if (pid === t.id) continue;
      const fromRow = idToRow.get(pid);
      if (fromRow == null) continue;
      const from = rowModels[fromRow];
      const fromX = from.x + from.width;
      const fromY = from.rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
      const toX = to.x;
      const toY = to.rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
      if ([fromX, fromY, toX, toY].some((v) => Number.isNaN(v))) continue;
      links.push({
        fromId: pid,
        toId: t.id,
        fromRowIndex: from.rowIndex,
        toRowIndex: to.rowIndex,
        fromX, fromY, toX, toY,
      });
    }
  }

  // 7) 分段（全部单行，格式简洁）
  const majorSegments = [];
  const minorSegments = []; // 不再使用，保留兼容

  if (unit === "day") {
    let dc = timelineStart;
    while (dc.isBefore(timelineEnd)) {
      const x = dateToPixel(dc, timelineStart, "day");
      majorSegments.push({ label: dc.format("M/D"), x, width: pxPerUnit });
      dc = dc.add(1, "day");
    }
  } else if (unit === "week") {
    let wc = timelineStart.startOf("isoWeek");
    while (wc.isBefore(timelineEnd)) {
      const x = dateToPixel(wc, timelineStart, "week");
      const yy = String(wc.year()).slice(-2);
      const wn = wc.isoWeek();
      // 跨年边界纠正：1月初可能仍属前一年ISO周，用 isoWeekYear
      const isoYy = String(wc.isoWeekYear()).slice(-2);
      majorSegments.push({ label: `${isoYy}W${wn}`, x, width: pxPerUnit });
      wc = wc.add(1, "week").startOf("isoWeek");
    }
  } else if (unit === "month") {
    let mc = timelineStart.startOf("month");
    while (mc.isBefore(timelineEnd)) {
      const x = dateToPixel(mc, timelineStart, "month");
      const yy = String(mc.year()).slice(-2);
      majorSegments.push({ label: `${yy}/${mc.month() + 1}`, x, width: pxPerUnit });
      mc = mc.add(1, "month").startOf("month");
    }
  } else if (unit === "quarter") {
    let qc = timelineStart.startOf("quarter");
    while (qc.isBefore(timelineEnd)) {
      const x = dateToPixel(qc, timelineStart, "quarter");
      const yy = String(qc.year()).slice(-2);
      majorSegments.push({ label: `${yy}Q${qc.quarter()}`, x, width: pxPerUnit });
      qc = qc.add(1, "quarter").startOf("quarter");
    }
  }

  // 8) 网格线（全部单行，只画粗线）
  const gridLines = [];
  majorSegments.forEach((s, i) => {
    if (i > 0) gridLines.push({ x: s.x, strong: true });
  });

  // 9) 今天线（单位感知）
  const today = dayjs().startOf("day");
  let todayX = null;
  if (!today.isBefore(timelineStart) && !today.isAfter(timelineEnd)) {
    todayX = dateToPixel(today, timelineStart, unit);
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
    nodeLines,
  };
}

// ==============================
// 组件
// ==============================

/**
 * 项目甘特图（只读展示组件）
 *
 * Props:
 *   tasks         — TaskDTO[]
 *   unit          — 'day' | 'week' | 'month' | 'quarter'
 *   collapsedPhases — Set<phaseId>
 *   onToggleCollapse — (phaseId) => void
 */
export default function GanttChart({
  tasks,
  unit = "day",
  collapsedPhases,
  onToggleCollapse,
}) {
  const model = useMemo(
    () => buildGanttModel(tasks, unit, collapsedPhases),
    [tasks, unit, collapsedPhases]
  );

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
    nodeLines,
  } = model;

  return (
    <Box sx={{ mt: 3 }}>
      <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600, color: "#1E1B2E" }}>
        项目甘特图
      </Typography>
      <Box sx={{ position: "relative", width: NAME_COL_WIDTH + chartWidth }}>
        <GanttTimeline
          majorSegments={majorSegments}
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
                  borderLeft: g.strong
                    ? "1px solid #E5E7EB"
                    : "1px solid #F1F5F9",
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
              collapsedPhases={collapsedPhases}
              onToggleCollapse={onToggleCollapse}
            />
          ))}

          {/* 依赖连线 + 今天线 + 节点标尺 SVG 叠加层 */}
          <GanttLinks
            links={links}
            chartWidth={chartWidth}
            chartHeight={chartHeight}
            nameColWidth={NAME_COL_WIDTH}
            todayX={todayX}
            nodeLines={nodeLines}
            arrowGap={ARROW_GAP}
            todayColor={TODAY_COLOR}
          />
        </Box>
      </Box>
    </Box>
  );
}
