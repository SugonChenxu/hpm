import { Box, Typography, Skeleton } from "@mui/material";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

export default function DITrendChart({ data = [], loading = false }) {
  const filtered = data.filter((d) => d.di > 0);
  const chartData = filtered.map((d) => ({ name: d.date, di: Math.round(d.di * 100) / 100 }));

  if (loading) return <Box sx={{ mb: 3 }}><Typography variant="h6" gutterBottom>DI 趋势</Typography><Skeleton variant="rectangular" height={280} sx={{ borderRadius: 1 }} /></Box>;
  if (chartData.length === 0) return <Box sx={{ mb: 3 }}><Typography variant="h6" gutterBottom>DI 趋势</Typography><Box sx={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "grey.50", borderRadius: 1 }}><Typography variant="body2" color="text.secondary">暂无 DI 趋势数据</Typography></Box></Box>;

  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="h6" gutterBottom>DI 趋势</Typography>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={60} />
          <YAxis tick={{ fontSize: 12 }} label={{ value: "DI", position: "insideLeft", offset: -5, style: { fontSize: 12 } }} />
          <Tooltip formatter={(value) => [`DI ${value}`, ""]} labelFormatter={(label) => `时间: ${label}`} />
          <Legend />
          <Line type="monotone" dataKey="di" name="缺陷指数" stroke="#D32F2F" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}
