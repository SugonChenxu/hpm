/**
 * StatsCards — 全局统计卡片组
 *
 * 3 张 MUI Card 横向排列：故障总数 / 已解决 / 解决率。
 * Loading 状态显示 Skeleton 占位。
 */

import { Box, Card, CardContent, Typography, Skeleton } from "@mui/material";

const CARD_DEFS = [
  { key: "total", label: "故障总数", color: "primary.main" },
  { key: "resolved", label: "已解决", color: "success.main" },
  { key: "rate", label: "解决率", color: "info.main", suffix: "%" },
];

/**
 * @param {{ total: number, resolved: number, rate: number }} props
 * @param {boolean} props.loading
 */
export default function StatsCards({ total = 0, resolved = 0, rate = 0, loading = false }) {
  const values = { total, resolved, rate };

  return (
    <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: "wrap" }}>
      {CARD_DEFS.map((card) => (
        <Card key={card.key} sx={{ flex: 1, minWidth: 160 }}>
          <CardContent sx={{ textAlign: "center", py: 2.5, "&:last-child": { pb: 2.5 } }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {card.label}
            </Typography>
            {loading ? (
              <Skeleton variant="text" width={60} height={40} sx={{ mx: "auto" }} />
            ) : (
              <Typography variant="h4" fontWeight={700} sx={{ color: card.color }}>
                {values[card.key]}
                {card.suffix || ""}
              </Typography>
            )}
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}
