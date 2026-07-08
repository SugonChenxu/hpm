import { Box, Typography, Skeleton } from "@mui/material";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const COLORS = ["#1565C0", "#ED6C02", "#2E7D32", "#6A1B9A"];

export default function CategoryBarChart({ data = [], loading = false }) {
  const filtered = data.filter((d) => d.count > 0);

  if (loading) return <Box sx={{ mb: 3 }}><Typography variant="h6" gutterBottom>缺陷分类</Typography><Skeleton variant="rectangular" height={280} sx={{ borderRadius: 1 }} /></Box>;
  if (filtered.length === 0) return <Box sx={{ mb: 3 }}><Typography variant="h6" gutterBottom>缺陷分类</Typography><Box sx={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "grey.50", borderRadius: 1 }}><Typography variant="body2" color="text.secondary">暂无分类数据</Typography></Box></Box>;

  const chartData = filtered.map((d, i) => ({ ...d, fill: COLORS[i % COLORS.length] }));
  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="h6" gutterBottom>缺陷分类</Typography>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
          <XAxis dataKey="category" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
          <Tooltip formatter={(value) => [value, "数量"]} />
          <Bar dataKey="count" fill="#1565C0" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}
