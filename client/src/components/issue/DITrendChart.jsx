import { Box, Typography, Skeleton } from "@mui/material";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function DITrendChart({ data = [], loading = false }) {
  const filtered = data.filter((d) => d.di > 0);
  const chartData = filtered.map((d) => ({ name: d.date, di: Math.round(d.di * 100) / 100 }));

  if (loading) return <Box sx={{ mb: 3 }}><Typography variant="h6" gutterBottom>DI 趋势</Typography><Skeleton variant="rectangular" height={280} /></Box>;
  if (chartData.length === 0) return <Box sx={{ mb: 3 }}><Typography variant="h6" gutterBottom>DI 趋势</Typography><Box sx={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "grey.100", borderRadius: 1 }}><Typography variant="body2" color="text.secondary">暂无 DI 趋势数据</Typography></Box></Box>;

  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="h6" gutterBottom>DI 趋势</Typography>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#6B7280" }} angle={-45} textAnchor="end" height={60} />
          <YAxis tick={{ fontSize: 12, fill: "#6B7280" }} />
          <Tooltip
            contentStyle={{
              backgroundColor: "#FFFFFF",
              border: "1px solid #E5E7EB",
              borderRadius: 8,
              color: "#1E1B2E",
            }}
            formatter={(value) => [`DI ${value}`, ""]}
          />
          <Line type="monotone" dataKey="di" stroke="#EF4444" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}
