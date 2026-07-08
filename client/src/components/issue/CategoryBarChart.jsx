import { Box, Typography, Skeleton } from "@mui/material";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";

const COLORS = ["#1565C0", "#ED6C02", "#2E7D32", "#6A1B9A", "#C62828", "#00838F", "#4E342E", "#37474F"];

export default function CategoryBarChart({ data = [], loading = false }) {
  const filtered = data.filter((d) => d.count > 0);

  if (loading) return <Box sx={{ mb: 3 }}><Typography variant="h6" gutterBottom>缺陷分布（按分类）</Typography><Skeleton variant="rectangular" height={280} /></Box>;
  if (filtered.length === 0) return <Box sx={{ mb: 3 }}><Typography variant="h6" gutterBottom>缺陷分布（按分类）</Typography><Box sx={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "grey.50", borderRadius: 1 }}><Typography variant="body2" color="text.secondary">暂无分类数据</Typography></Box></Box>;

  const chartData = filtered.map((d, i) => ({
    name: d.category,
    di: Math.round(d.count * 100) / 100,
    label: `${d.category} ${Math.round(d.count * 100) / 100}`,
    fill: COLORS[i % COLORS.length],
  }));

  return (
    <Box sx={{ mb: 3, position: "relative" }}>
      <Typography variant="h6" gutterBottom>缺陷分布（按分类）</Typography>
      {/* 右上方图注 */}
      <Box sx={{ position: "absolute", top: 30, right: 16, zIndex: 1, bgcolor: "rgba(255,255,255,0.85)", p: 1, borderRadius: 1 }}>
        {chartData.map((d, i) => (
          <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.3 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: COLORS[i % COLORS.length], flexShrink: 0 }} />
            <Typography variant="caption" sx={{ fontSize: 11 }}>{d.label}</Typography>
          </Box>
        ))}
      </Box>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Bar dataKey="di" radius={[4, 4, 0, 0]}>
            {chartData.map((entry, idx) => (
              <rect key={idx} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}
