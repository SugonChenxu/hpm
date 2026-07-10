import { Box } from "@mui/material";

export const PRIORITY_MAP = {
  urgent: { label: "紧急", color: "#DC2626" },
  high: { label: "高", color: "#EA580C" },
  medium: { label: "中", color: "#D97706" },
  low: { label: "低", color: "#16A34A" },
  P0: { label: "紧急", color: "#DC2626" },
  P1: { label: "高", color: "#EA580C" },
  P2: { label: "中", color: "#D97706" },
};

export const PRIORITY_OPTIONS = ["urgent", "high", "medium", "low"];

/** 循环切换顺序：低 → 中 → 高 → 紧急 → 低 */
export function nextPriority(current) {
  const idx = PRIORITY_OPTIONS.indexOf(current);
  if (idx === -1) return "low";
  return PRIORITY_OPTIONS[(idx + 3) % 4]; // 反向：low→medium→high→urgent→low
}

/** 10px 纯色圆点，可点击循环切换 */
export default function PriorityChip({ priority, onClick, sx = {} }) {
  const info = PRIORITY_MAP[priority] || PRIORITY_MAP.medium;
  return (
    <Box
      onClick={onClick}
      sx={{
        width: 10,
        height: 10,
        borderRadius: "50%",
        bgcolor: info.color,
        flexShrink: 0,
        cursor: onClick ? "pointer" : "default",
        transition: "background-color 0.15s",
        ...sx,
      }}
    />
  );
}
