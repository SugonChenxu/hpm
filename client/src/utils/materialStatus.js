// 物料状态枚举与样式（严格遵循模块规范）
export const MATERIAL_STATUSES = ["默认", "已入库", "已下单", "待决策", "高风险"];

export const STATUS_STYLE = {
  默认: { color: "#8c8c8c", bg: "#f5f5f5" },
  已入库: { color: "#ffffff", bg: "#52c41a" },
  已下单: { color: "#135200", bg: "#b7eb8f" },
  待决策: { color: "#ffffff", bg: "#faad14" },
  高风险: { color: "#ffffff", bg: "#ff4d4f" },
};

export function statusStyle(status) {
  return STATUS_STYLE[status] || STATUS_STYLE["默认"];
}
