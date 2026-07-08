import { Box, Typography, IconButton } from "@mui/material";
import { ExpandMore, TaskAlt } from "@mui/icons-material";

/**
 * 折叠态项目头部 — 全部完成时显示
 *
 * @param {Object} props
 * @param {Object} props.project - 项目对象（含 theme_color）
 * @param {number} props.taskCount - 已完成任务总数
 * @param {Function} props.onExpand - 点击展开回调
 */
export default function CollapsedProjectHeader({ project, taskCount, onExpand }) {
  const themeColor = project?.theme_color || "#1565C0";

  return (
    <Box
      onClick={onExpand}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        py: 2,
        px: 2.5,
        borderRadius: 2,
        border: "1px solid",
        borderColor: "divider",
        borderLeft: `4px solid ${themeColor}`,
        bgcolor: "background.paper",
        cursor: "pointer",
        transition: "box-shadow 0.2s",
        "&:hover": {
          boxShadow: 2,
        },
      }}
    >
      <TaskAlt sx={{ color: "success.main", fontSize: 28 }} />

      <Box sx={{ flex: 1 }}>
        <Typography variant="h6" fontWeight={600}>
          {project?.name || "项目看板"}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {taskCount} 项任务全部完成
        </Typography>
      </Box>

      <IconButton size="small" sx={{ transform: "rotate(-90deg)" }}>
        <ExpandMore />
      </IconButton>
    </Box>
  );
}
