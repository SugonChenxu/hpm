import { Box } from "@mui/material";

/**
 * 甘特图依赖连线层：绝对定位 SVG，绘制 FS（完成→开始）依赖箭头折线 + 今天线 + 节点标尺线。
 *
 * Props:
 *   links — GanttLinkModel[]（from=前置右端，to=后继左端）
 *   chartWidth / chartHeight — 时间轴区域尺寸（px）
 *   nameColWidth — 左侧任务名列宽（px），SVG left 偏移至此
 *   todayX — 今天线 x 坐标（px），为 null 则不画
 *   nodeLines — 节点任务中心线 [{ x, name }]，绘制贯穿全图的红色虚线标尺
 *   arrowGap — 连线外扩距离（px），默认 12
 *   todayColor — 今天线颜色，默认 #ef4444
 *   nodeColor — 节点标尺颜色，默认淡红 #f87171
 */
export default function GanttLinks({
  links = [],
  chartWidth = 0,
  chartHeight = 0,
  nameColWidth = 220,
  todayX = null,
  nodeLines = [],
  arrowGap = 12,
  todayColor = "#ef4444",
  nodeColor = "#f87171",
}) {
  const hasContent =
    (links && links.length > 0) ||
    todayX != null ||
    (nodeLines && nodeLines.length > 0);
  if (!hasContent) return null;

  /**
   * 构建 FS 依赖折线：
   * 情形 A（toX ≥ fromX + 2*ARROW_GAP）：标准右折，终点朝右箭头。
   * 情形 B（重叠/反向）：从后继左端左侧绕行，避免横穿条形。
   */
  function buildLinkPath(link) {
    const { fromX, fromY, toX, toY } = link;
    if (toX >= fromX + 2 * arrowGap) {
      const midX = fromX + arrowGap;
      return `M ${fromX},${fromY} L ${midX},${fromY} L ${midX},${toY} L ${toX},${toY}`;
    }
    const detourY = (fromY + toY) / 2;
    return `M ${fromX},${fromY} L ${fromX + arrowGap},${fromY} L ${fromX + arrowGap},${detourY} L ${toX - arrowGap},${detourY} L ${toX - arrowGap},${toY} L ${toX},${toY}`;
  }

  return (
    <Box
      component="svg"
      sx={{
        position: "absolute",
        left: nameColWidth,
        top: 0,
        width: chartWidth,
        height: chartHeight,
        pointerEvents: "none",
        zIndex: 5,
        overflow: "visible",
      }}
    >
      <defs>
        <marker
          id="gantt-arrow"
          markerWidth="8"
          markerHeight="8"
          refX="6"
          refY="3"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M0,0 L6,3 L0,6 Z" fill="#64748b" />
        </marker>
      </defs>

      {(links || []).map((l, i) => (
        <path
          key={i}
          d={buildLinkPath(l)}
          fill="none"
          stroke="#64748b"
          strokeWidth="1.5"
          markerEnd="url(#gantt-arrow)"
        />
      ))}

      {todayX != null && (
        <g>
          <line
            x1={todayX}
            y1={0}
            x2={todayX}
            y2={chartHeight}
            stroke={todayColor}
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
          <rect
            x={Math.max(0, todayX - 16)}
            y={2}
            width="32"
            height="16"
            rx="2"
            fill={todayColor}
          />
          <text x={todayX} y={14} fill="#ffffff" fontSize="10" textAnchor="middle">
            今天
          </text>
        </g>
      )}

      {/* 节点任务标尺线：贯穿全图的红色虚线，顶部小菱形标记 */}
      {(nodeLines || []).map((n, i) => (
        <g key={`node-${i}`}>
          <line
            x1={n.x}
            y1={0}
            x2={n.x}
            y2={chartHeight}
            stroke={nodeColor}
            strokeWidth="1.25"
            strokeDasharray="3 3"
            opacity="0.55"
          />
          <rect
            x={n.x - 4}
            y={3}
            width="8"
            height="8"
            fill={nodeColor}
            transform={`rotate(45 ${n.x} ${7})`}
          />
        </g>
      ))}
    </Box>
  );
}
