import { Box } from "@mui/material";

/**
 * 甘特图表头 — 全部单行，格式简洁。
 *
 * Props:
 *   majorSegments — { label, x, width }[]（时间刻度）
 *   chartWidth — 时间轴区域总宽（px）
 *   nameColWidth — 左侧任务名列宽（px），默认 220
 *   headerHeight — 表头高度（px），默认 28
 */
export default function GanttTimeline({
  majorSegments = [],
  chartWidth = 0,
  nameColWidth = 220,
  headerHeight = 28,
}) {
  return (
    <Box
      sx={{
        position: "sticky",
        top: 0,
        zIndex: 3,
        display: "flex",
        height: headerHeight,
        borderBottom: "2px solid #D1D5DB",
        bgcolor: "#F9FAFB",
      }}
    >
      {/* 左侧任务名列占位（sticky left） */}
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
          fontSize: "0.78rem",
          color: "#1E1B2E",
        }}
      >
        任务 / 时间
      </Box>

      {/* 时间轴刻度区域 */}
      <Box sx={{ position: "relative", width: chartWidth, flexShrink: 0 }}>
        {majorSegments.map((s, i) => (
          <Box
            key={`seg-${i}`}
            sx={{
              position: "absolute",
              left: s.x,
              top: 0,
              width: s.width,
              height: "100%",
              borderLeft: "1px solid #D1D5DB",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.68rem",
              fontWeight: 600,
              color: "#374151",
              whiteSpace: "nowrap",
              overflow: "hidden",
              letterSpacing: "0.02em",
            }}
          >
            {s.label}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
