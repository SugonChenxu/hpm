// 物料状态枚举与样式
// 字体统一用深色确保可读性，背景色保持区分
export const MATERIAL_STATUSES = ["默认", "已入库", "已下单", "待决策", "高风险"];

export const STATUS_STYLE = {
  默认:   { color: "#595959", bg: "#f0f0f0" },
  已入库: { color: "#ffffff", bg: "#389e0d" },
  已下单: { color: "#237804", bg: "#d9f7be" },
  待决策: { color: "#ffffff", bg: "#d48806" },
  高风险: { color: "#ffffff", bg: "#cf1322" },
};

export function statusStyle(status) {
  return STATUS_STYLE[status] || STATUS_STYLE["默认"];
}
