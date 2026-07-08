/**
 * CategoryBarChart — 缺陷分类柱状图
 *
 * recharts BarChart，X 轴分类名，Y 轴数量。
 * 4 种分类对应不同颜色，过滤 count=0 的分类。
 */

import { Box, Typography, Skeleton } from "@mui/material";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

const CATEGORY_COLORS = {
  BIOS: "#1565C0",
  BMC: "#ED6C02",
  HW: "#2E7D32",
  Pef: "#6A1B9A",
};
const FALLBACK_COLOR = "#9E9E9E";

/**
 * @param {Array<{category:string, count:number}>} props.data
 * @param {boolean} props.loading
 */
export default function CategoryBarChart({ data = [], loading = false }) {
  // 过滤 count=0
  const filtered = data.filter((d) => d.count > 0);

  if (loading) {
    return (
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" gutterBottom>缺陷分类</Typography>
        <Skeleton variant="rectangular" height={280} sx={{ borderRadius: 1 }} />
      </Box>
    );
  }

  if (filtered.length === 0) {
    return (
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" gutterBottom>缺陷分类</Typography>
        <Box
          sx={{
            height: 280,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: "grey.50",
            borderRadius: 1,
          }}
        >
          <Typography variant="body2" color="text.secondary">
            暂无分类数据
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="h6" gutterBottom>缺陷分类</Typography>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={filtered} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
          <XAxis dataKey="category" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
          <Tooltip formatter={(value, name) => [value, "数量"]} />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {filtered.map((entry, idx) => (
              <Cell
                key={idx}
                fill={CATEGORY_COLORS[entry.category] || FALLBACK_COLOR}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}
