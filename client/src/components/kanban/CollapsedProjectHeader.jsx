import { Box, Typography } from "@mui/material";
import { TaskAlt } from "@mui/icons-material";

/**
 * 折叠态项目头部 — 全部完成时显示
 * 严格对标原型：主题色横条 + ✓ + 项目名 + "全部完成 · 点击展开"
 */
export default function CollapsedProjectHeader({ project, taskCount, onExpand }) {
  const themeColor = project?.theme_color || "#1E40AF";

  return (
    <Box
      onClick={onExpand}
      sx={{
        background: "var(--color-background-primary, #fff)",
        borderRadius: "var(--border-radius-lg, 12px)",
        border: "0.5px solid var(--color-border-tertiary, #E2E8F0)",
        overflow: "hidden",
        cursor: "pointer",
      }}
    >
      <Box sx={{ height: 3, bgcolor: themeColor }} />
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          py: 1.5,
          px: 2,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <TaskAlt sx={{ color: "#16A34A", fontSize: 16 }} />
          <Typography
            variant="body2"
            fontWeight={500}
            color="text.secondary"
            sx={{ fontSize: 14 }}
          >
            {project?.code ? `[${project.code}] ` : ""}
            {project?.name || "项目看板"}
          </Typography>
        </Box>
        <Typography variant="caption" color="text.disabled" sx={{ fontSize: 11 }}>
          全部完成 · 点击展开
        </Typography>
      </Box>
    </Box>
  );
}
