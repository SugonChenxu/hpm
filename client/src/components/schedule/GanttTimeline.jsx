import { Box } from "@mui/material";

/**
 * 甘特图双行表头：major（上行粗刻度）+ minor（下行细刻度），含竖向网格线。
 * 表头 sticky 固定（top:0），左侧任务名列占位 sticky（left:0）。
 * 标签已在上游（GanttChart）按 unit 预格式化，本组件仅负责布局渲染。
 *
 * Props:
 *   majorSegments — { label, x, width }[]（粗刻度，上行）
 *   minorSegments — { label, x, width }[]（细刻度，下行）
 *   unit — 时间轴单位（'day'|'week'|'month'|'quarter'，仅用于细微样式）
 *   chartWidth — 时间轴区域总宽（px）
 *   nameColWidth — 左侧任务名列宽（px）
 *   headerHeight — 表头总高（px）
 */
export default function GanttTimeline({
  majorSegments = [],
  minorSegments = [],
  unit = "day",
  chartWidth = 0,
  nameColWidth = 220,
  headerHeight = 48,
}) {
  const half = headerHeight / 2;
  // 日模式下次刻度标签较短（DD），其余（MM/DD、年月、Qn）居中即可
  const minorJustify = unit === "day" ? "flex-start" : "center";

  return (
    <Box
      sx={{
        position: "sticky",
        top: 0,
        zIndex: 3,
        display: "flex",
        height: headerHeight,
        borderBottom: "2px solid #D1D5DB",
      }}
    >
      {/* 左侧任务名列占位（sticky left，覆盖交叉角） */}
      <Box
        sx={{
          position: "sticky",
          left: 0,
          zIndex: 7,
          width: nameColWidth,
          flexShrink: 0,
          bgcolor: "#F9FAFB",
          borderRight: "1px solid #E5E7EB",
          display: "flex",
          alignItems: "center",
          pl: 1,
          fontWeight: 600,
          fontSize: "0.8rem",
          color: "#1E1B2E",
        }}
      >
        任务 / 时间
      </Box>

      {/* 时间轴刻度区域 */}
      <Box sx={{ position: "relative", width: chartWidth, flexShrink: 0 }}>
        {/* 上行：major 粗刻度 */}
        <Box
          sx={{
            position: "relative",
            height: half,
            borderBottom: "1px solid #E5E7EB",
          }}
        >
          {majorSegments.map((s, i) => (
            <Box
              key={`major-${i}`}
              sx={{
                position: "absolute",
                left: s.x,
                top: 0,
                width: s.width,
                height: "100%",
                borderLeft: "1px solid #D1D5DB",
                display: "flex",
                alignItems: "center",
                pl: 0.5,
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "#374151",
                whiteSpace: "nowrap",
                overflow: "hidden",
              }}
            >
              {s.label}
            </Box>
          ))}
        </Box>

        {/* 下行：minor 细刻度 */}
        <Box sx={{ position: "relative", height: half }}>
          {minorSegments.map((s, i) => (
            <Box
              key={`minor-${i}`}
              sx={{
                position: "absolute",
                left: s.x,
                top: 0,
                width: s.width,
                height: "100%",
                borderLeft: "1px solid #E5E7EB",
                display: "flex",
                alignItems: "center",
                justifyContent: minorJustify,
                pl: minorJustify === "flex-start" ? 0.5 : 0,
                fontSize: "0.7rem",
                color: "#9CA3AF",
                whiteSpace: "nowrap",
                overflow: "hidden",
              }}
            >
              {s.label}
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
