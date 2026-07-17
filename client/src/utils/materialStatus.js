// 物料状态枚举与样式
// 全部深色字体 + 高对比背景，确保 Chip 组件上清晰可读
export const MATERIAL_STATUSES = ["默认", "已入库", "已下单", "待决策", "高风险"];

export const STATUS_STYLE = {
  默认:   { color: "#8c8c8c", bg: "#f5f5f5", border: "#d9d9d9" },
  已入库: { color: "#135200", bg: "#d9f7be", border: "#95de64" },
  已下单: { color: "#237804", bg: "#d9f7be", border: "#95de64" },
  待决策: { color: "#ad6800", bg: "#fff7e6", border: "#ffd591" },
  高风险: { color: "#a8071a", bg: "#fff1f0", border: "#ffa39e" },
};

export function statusStyle(status) {
  return STATUS_STYLE[status] || STATUS_STYLE["默认"];
}
