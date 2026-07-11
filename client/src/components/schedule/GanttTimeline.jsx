import { Box } from "@mui/material";

/**
 * 甘特图双行表头：月行（上行）+ 周行（下行）刻度，含竖向网格线。
 * 表头 sticky 固定（top:0），左侧任务名列占位 sticky（left:0）。
 *
 * Props:
 *   monthSegments — { label, x, width }[]（按月分段，粗竖线）
 *   weekSegments — { label, x, width }[]（按周一分段，细竖线）
 *   chartWidth — 时间轴区域总宽（px）
 *   nameColWidth — 左侧任务名列宽（px）
 *   headerHeight — 表头总高（px）
 */
export default function GanttTimeline({
  monthSegments = [],
  weekSegments = [],
  chartWidth = 0,
  nameColWidth = 220,
  headerHeight = 48,
}) {
  const half = headerHeight / 2;

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
        {/* 月行（上行） */}
        <Box
          sx={{
            position: "relative",
            height: half,
            borderBottom: "1px solid #E5E7EB",
          }}
        >
          {monthSegments.map((s, i) => (
            <Box
              key={`m-${i}`}
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

        {/* 周行（下行） */}
        <Box sx={{ position: "relative", height: half }}>
          {weekSegments.map((s, i) => (
            <Box
              key={`w-${i}`}
              sx={{
                position: "absolute",
                left: s.x,
                top: 0,
                width: s.width,
                height: "100%",
                borderLeft: "1px solid #E5E7EB",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
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
