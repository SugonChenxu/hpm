import { Box } from "@mui/material";

export const PRIORITY_MAP = {
  urgent: { label: "紧急", color: "#cf1322" },
  high: { label: "高", color: "#ff4d4f" },
  medium: { label: "中", color: "#faad14" },
  low: { label: "低", color: "#52c41a" },
  P0: { label: "紧急", color: "#cf1322" },
  P1: { label: "高", color: "#ff4d4f" },
  P2: { label: "中", color: "#faad14" },
};

export const PRIORITY_OPTIONS = ["urgent", "high", "medium", "low"];

/** 10px 纯色圆点状态灯，无文字 */
export default function PriorityChip({ priority, sx = {} }) {
  const info = PRIORITY_MAP[priority] || PRIORITY_MAP.medium;
  return (
    <Box
      sx={{
        width: 10,
        height: 10,
        borderRadius: "50%",
        bgcolor: info.color,
        flexShrink: 0,
        ...sx,
      }}
    />
  );
}
