import { Chip } from "@mui/material";

/**
 * 优先级映射常量（可导出供其他组件使用）
 */
export const PRIORITY_MAP = {
  urgent: { label: "紧急", color: "#cf1322" },
  high: { label: "高", color: "#ff4d4f" },
  medium: { label: "中", color: "#faad14" },
  low: { label: "低", color: "#52c41a" },
  // 兼容旧值
  P0: { label: "紧急", color: "#cf1322" },
  P1: { label: "高", color: "#ff4d4f" },
  P2: { label: "中", color: "#faad14" },
};

export const PRIORITY_OPTIONS = ["urgent", "high", "medium", "low"];

/**
 * 优先级颜色指示灯
 *
 * @param {Object} props
 * @param {string} props.priority - 优先级值：urgent|high|medium|low
 * @param {string} [props.size="small"] - Chip 尺寸：small|medium
 * @param {Object} [props.sx] - 额外样式
 */
export default function PriorityChip({ priority, size = "small", sx = {} }) {
  const info = PRIORITY_MAP[priority] || PRIORITY_MAP.medium;

  return (
    <Chip
      label={info.label}
      size={size}
      sx={{
        fontWeight: 600,
        fontSize: size === "small" ? "0.7rem" : "0.75rem",
        bgcolor: `${info.color}18`,
        color: info.color,
        border: `1px solid ${info.color}40`,
        height: size === "small" ? 20 : 24,
        ...sx,
      }}
    />
  );
}
