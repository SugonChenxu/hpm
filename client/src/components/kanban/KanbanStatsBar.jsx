import { Box, Typography, LinearProgress } from "@mui/material";

/**
 * 看板统计条 — 进度条 + 子任务统计
 *
 * @param {Object} props
 * @param {Object} props.stats - {total, todo, done, subtasks_total, subtasks_done}
 */
export default function KanbanStatsBar({ stats }) {
  const { total = 0, done = 0, subtasks_total = 0, subtasks_done = 0 } = stats || {};
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <Box sx={{ mb: 2 }}>
      {/* 任务进度 */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
        <Typography variant="body2" fontWeight={600}>
          任务进度
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {done}/{total}
        </Typography>
        <Typography variant="body2" fontWeight={600} color="primary" sx={{ ml: "auto" }}>
          {progress}%
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={progress}
        sx={{
          height: 6,
          borderRadius: 3,
          mb: 0.5,
          bgcolor: "action.hover",
          "& .MuiLinearProgress-bar": {
            borderRadius: 3,
            bgcolor: progress === 100 ? "success.main" : "primary.main",
          },
        }}
      />

      {/* 子任务统计 */}
      {subtasks_total > 0 && (
        <Typography variant="caption" color="text.secondary">
          子任务：{subtasks_done}/{subtasks_total} 已完成
        </Typography>
      )}
    </Box>
  );
}
