import { Box, Typography, Skeleton } from "@mui/material";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const COLORS = ["#8B5CF6", "#F59E0B", "#10B981", "#7C3AED", "#EF4444", "#3B82F6", "#6D28D9", "#6B5B8A"];

export default function CategoryBarChart({ data = [], loading = false }) {
  const filtered = data.filter((d) => d.count > 0);

  if (loading) return <Box sx={{ mb: 3 }}><Typography variant="h6" gutterBottom>缺陷分布（按分类）</Typography><Skeleton variant="rectangular" height={280} /></Box>;
  if (filtered.length === 0) return <Box sx={{ mb: 3 }}><Typography variant="h6" gutterBottom>缺陷分布（按分类）</Typography><Box sx={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "grey.100", borderRadius: 1 }}><Typography variant="body2" color="text.secondary">暂无分类数据</Typography></Box></Box>;

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
      <Box sx={{ position: "absolute", top: 30, right: 16, zIndex: 2, p: 1, bgcolor: "rgba(21,16,31,0.85)", borderRadius: 1, boxShadow: 1, border: "1px solid rgba(255,255,255,0.08)" }}>
        {chartData.map((d, i) => (
          <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 0.8, mb: 0.6 }}>
            <Box sx={{ width: 12, height: 12, borderRadius: 0.5, bgcolor: COLORS[i % COLORS.length], flexShrink: 0 }} />
            <Typography variant="caption" sx={{ fontSize: 12, lineHeight: 1.4 }}>{d.label}</Typography>
          </Box>
        ))}
      </Box>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#A89BC4" }} />
          <YAxis tick={{ fontSize: 12, fill: "#A89BC4" }} />
          <Tooltip
            contentStyle={{
              backgroundColor: "rgba(21,16,31,0.9)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8,
              color: "#F5F3FF",
            }}
            formatter={(value) => [`DI ${value}`, ""]}
          />
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
