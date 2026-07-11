import { Box, Tooltip } from "@mui/material";
import ExpandMore from "@mui/icons-material/ExpandMore";
import ExpandLess from "@mui/icons-material/ExpandLess";

/**
 * 甘特图单行：左侧任务名列（depth 缩进、sticky）+ 右侧时间轴条形。
 * 条形垂直居中，按 color 着色，hover 显示 Tooltip（名称/起止/工期/状态）。
 * 本期只读：禁用任何编辑交互（cursor: default）。
 *
 * Props:
 *   model — GanttRowModel（来自 GanttChart）
 *   rowHeight / barHeight / nameColWidth / chartWidth — 绘图常量
 */
export default function GanttRow({
  model,
  rowHeight = 36,
  barHeight = 22,
  nameColWidth = 220,
  chartWidth = 0,
  collapsedPhases = new Set(),
  onToggleCollapse = () => {},
}) {
  const barTop = (rowHeight - barHeight) / 2;
  const bg = model.rowIndex % 2 === 1 ? "#FAFAFA" : "#FFFFFF";
  const isPhase = model.taskType === "阶段任务";

  const tooltip = (
    <Box sx={{ fontSize: "0.75rem", lineHeight: 1.6 }}>
      <Box sx={{ fontWeight: 700, mb: 0.25 }}>{model.name}</Box>
      <Box>
        {model.startDate.format("YYYY-MM-DD")} ~ {model.endDate.format("YYYY-MM-DD")}
      </Box>
      <Box>工期：{model.durationDays} 天</Box>
      <Box>状态：{model.status}</Box>
    </Box>
  );

  return (
    <Box
      sx={{
        display: "flex",
        height: rowHeight,
        borderBottom: "1px solid #F3F4F6",
        bgcolor: bg,
      }}
    >
      {/* 左侧任务名列（sticky left，随横向滚动固定） */}
      <Box
        sx={{
          position: "sticky",
          left: 0,
          zIndex: 6,
          width: nameColWidth,
          flexShrink: 0,
          bgcolor: bg,
          display: "flex",
          alignItems: "center",
          paddingLeft: `${8 + model.depth * 16}px`,
          pr: 1,
          borderRight: "1px solid #E5E7EB",
          fontSize: "0.8rem",
          fontWeight: isPhase ? 700 : 400,
          color: "#1F2937",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {/* 阶段任务显示折叠箭头（与排期表共用 collapsedPhases 单一数据源） */}
        {isPhase && (
          <Box
            component="span"
            role="button"
            aria-label={collapsedPhases.has(model.id) ? "展开" : "折叠"}
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapse(model.id);
            }}
            sx={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 20,
              height: 20,
              mr: 0.5,
              flexShrink: 0,
              borderRadius: "4px",
              cursor: "pointer",
              color: "#6B7280",
              "&:hover": { bgcolor: "rgba(0,0,0,0.06)" },
            }}
          >
            {collapsedPhases.has(model.id) ? (
              <ExpandMore fontSize="small" />
            ) : (
              <ExpandLess fontSize="small" />
            )}
          </Box>
        )}
        {model.name}
      </Box>

      {/* 右侧时间轴条形区域 */}
      <Box sx={{ position: "relative", width: chartWidth, flexShrink: 0 }}>
        <Tooltip title={tooltip} arrow placement="top">
          <Box
            sx={{
              position: "absolute",
              left: model.x,
              top: barTop,
              width: model.width,
              height: barHeight,
              bgcolor: model.color,
              borderRadius: "4px",
              border: isPhase ? "1.5px solid rgba(0,0,0,0.25)" : "none",
              cursor: "default",
            }}
          />
        </Tooltip>
      </Box>
    </Box>
  );
}
