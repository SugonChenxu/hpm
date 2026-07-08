/**
 * DITrendChart — DI 趋势折线图
 *
 * recharts LineChart，X 轴日期（MM-DD），Y 轴 DI 值。
 * 包含 Tooltip、Brush 缩放、Skeleton 加载态、空数据提示。
 */

import { Box, Typography, Skeleton } from "@mui/material";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Brush,
  ResponsiveContainer,
} from "recharts";
import dayjs from "dayjs";

const COLORS = { line: "#1565C0" };

/**
 * @param {Array<{date:string, di:number}>} props.data
 * @param {boolean} props.loading
 */
export default function DITrendChart({ data = [], loading = false }) {
  // 过滤 DI=0 的点
  const filtered = data.filter((d) => d.di > 0);

  // Loading 态
  if (loading) {
    return (
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" gutterBottom>DI 趋势</Typography>
        <Skeleton variant="rectangular" height={280} sx={{ borderRadius: 1 }} />
      </Box>
    );
  }

  // 空数据
  if (filtered.length === 0) {
    return (
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" gutterBottom>DI 趋势</Typography>
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
            暂无 DI 趋势数据
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="h6" gutterBottom>DI 趋势</Typography>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={filtered} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
          <XAxis
            dataKey="date"
            tickFormatter={(v) => (v ? dayjs(v).format("MM-DD") : "")}
            tick={{ fontSize: 12 }}
          />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip
            labelFormatter={(v) => `日期: ${v}`}
            formatter={(value) => [`${value}`, "DI"]}
          />
          <Brush
            dataKey="date"
            height={24}
            stroke={COLORS.line}
            tickFormatter={(v) => (v ? dayjs(v).format("MM-DD") : "")}
          />
          <Line
            type="monotone"
            dataKey="di"
            stroke={COLORS.line}
            strokeWidth={2}
            dot={{ r: 3, fill: COLORS.line }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}
