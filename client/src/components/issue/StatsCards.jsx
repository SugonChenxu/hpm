import { Box, Card, CardContent, Typography, Skeleton } from "@mui/material";

const CARD_DEFS = [
  { key: "di", label: "当前 DI 值", color: "error.main" },
  { key: "total", label: "故障总数", color: "primary.main" },
  { key: "rate", label: "解决率", color: "success.main", suffix: "%" },
];

export default function StatsCards({ di = 0, total = 0, rate = 0, loading = false }) {
  const values = { di, total, rate };

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
