import { Box, Tooltip, IconButton, Typography } from "@mui/material";
import { ExpandMore, ChevronRight } from "@mui/icons-material";

/**
 * 甘特图单行：左侧任务名列（depth 缩进、sticky）+ 右侧时间轴条形。
 * 条形垂直居中，按 color 着色，hover 显示 Tooltip（名称/起止/工期/状态）。
 * 本期只读：禁用任何编辑交互（cursor: default）。
 *
 * Props:
 *   model — GanttRowModel（来自 GanttChart）
 *   rowHeight / barHeight / nameColWidth / chartWidth — 绘图常量
 *   collapsedPhases — Set<phaseId>，已折叠的阶段任务 ID
 *   onToggleCollapse — (phaseId) => void，切换折叠状态
 */
export default function GanttRow({
  model,
  rowHeight = 36,
  barHeight = 22,
  nameColWidth = 220,
  chartWidth = 0,
  collapsedPhases,
  onToggleCollapse,
}) {
  const barTop = (rowHeight - barHeight) / 2;
  const bg = model.rowIndex % 2 === 1 ? "#FAFAFA" : "#FFFFFF";
  const isPhase = model.taskType === "阶段任务";
  const isNode = model.taskType === "节点任务";
  const isCollapsed = collapsedPhases && collapsedPhases.has(model.id);

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
        {/* 阶段任务折叠/展开箭头 */}
        {isPhase && onToggleCollapse && (
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapse(model.id);
            }}
            sx={{
              p: 0,
              mr: 0.25,
              minWidth: 18,
              width: 18,
              height: 18,
            }}
          >
            {isCollapsed ? (
              <ChevronRight sx={{ fontSize: 16 }} />
            ) : (
              <ExpandMore sx={{ fontSize: 16 }} />
            )}
          </IconButton>
        )}
        {model.name}
      </Box>

      {/* 右侧时间轴条形区域 */}
      <Box sx={{ position: "relative", width: chartWidth, flexShrink: 0 }}>
        {isNode ? (
          // 节点任务：红色菱形里程碑，着重显示
          <Tooltip title={tooltip} arrow placement="top">
            <Box
              sx={{
                position: "absolute",
                left: model.x + model.width / 2 - (barHeight + 10) / 2,
                top: (rowHeight - (barHeight + 10)) / 2,
                width: barHeight + 10,
                height: barHeight + 10,
                bgcolor: "#EF4444",
                border: "2px solid #B91C1C",
                borderRadius: "4px",
                transform: "rotate(45deg)",
                boxShadow: "0 0 0 3px rgba(239,68,68,0.25)",
                cursor: "default",
              }}
            />
          </Tooltip>
        ) : (
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
                display: "flex",
                alignItems: "center",
                px: 0.5,
                overflow: "hidden",
              }}
            >
              <Typography
                sx={{
                  fontSize: "0.62rem",
                  fontWeight: isPhase ? 700 : 400,
                  color: "#1F2937",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  lineHeight: 1,
                  userSelect: "none",
                }}
              >
                {model.name}
              </Typography>
            </Box>
          </Tooltip>
        )}
      </Box>
    </Box>
  );
}
