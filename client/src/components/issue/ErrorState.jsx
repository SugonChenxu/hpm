import { Box, Typography, Button } from "@mui/material";

const ICONS = {
  auth_failed: () => <span style={{ fontSize: 48 }}>🔒</span>,
  timeout: () => <span style={{ fontSize: 48 }}>⚠️</span>,
  network: () => <span style={{ fontSize: 48 }}>☁️</span>,
  no_projects: () => <span style={{ fontSize: 48 }}>☁️</span>,
  di_all_zero: () => <span style={{ fontSize: 48 }}>📭</span>,
  no_data: () => <span style={{ fontSize: 48 }}>📭</span>,
  unknown: () => <span style={{ fontSize: 48 }}>❌</span>,
};

const CONFIG = {
  auth_failed: { label: "鉴权失败，请检查 API Token", action: { text: "前往配置", retry: false } },
  timeout: { label: "请求超时", action: { text: "重试", retry: true } },
  network: { label: "网络异常，无法连接 Mantis", action: { text: "重试", retry: true } },
  no_projects: { label: "当前账号下暂无 Mantis 项目", action: { text: "重试", retry: true } },
  di_all_zero: { label: "DI 值均为 0，暂无趋势数据", action: null },
  no_data: { label: "暂无数据", action: null },
  unknown: { label: null, action: { text: "重试", retry: true } },
};

export default function ErrorState({ type = "unknown", message = "", onRetry }) {
  const cfg = CONFIG[type] || CONFIG.unknown;
  const Icon = ICONS[type] || ICONS.unknown;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", py: 6, gap: 2, color: "text.secondary" }}>
      <Icon />
      <Typography variant="body1" fontWeight={500}>{cfg.label || message || "未知错误"}</Typography>
      {cfg.action && <Button variant="outlined" size="small" onClick={cfg.action.retry ? onRetry : undefined}>{cfg.action.text}</Button>}
    </Box>
  );
}
