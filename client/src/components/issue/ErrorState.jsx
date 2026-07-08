/**
 * ErrorState — 统一异常状态组件
 *
 * 4 种异常场景的图标 + 文案 + 操作按钮。
 *  - auth_failed: 鉴权失败
 *  - timeout:     请求超时
 *  - network / no_projects: 网络异常 / 无项目
 *  - di_all_zero / no_data: 暂无数据
 *  - 其他:        通用错误
 */

import { Box, Typography, Button } from "@mui/material";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import CloudOffIcon from "@mui/icons-material/CloudOff";
import InboxOutlinedIcon from "@mui/icons-material/InboxOutlined";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";

const CONFIG = {
  auth_failed: {
    icon: <LockOutlinedIcon sx={{ fontSize: 56 }} />,
    label: "鉴权失败，请检查 API Token",
    action: { text: "前往配置", retry: false },
  },
  timeout: {
    icon: <WarningAmberIcon sx={{ fontSize: 56 }} />,
    label: "请求超时",
    action: { text: "重试", retry: true },
  },
  network: {
    icon: <CloudOffIcon sx={{ fontSize: 56 }} />,
    label: "无数据",
    action: { text: "重试", retry: true },
  },
  no_projects: {
    icon: <CloudOffIcon sx={{ fontSize: 56 }} />,
    label: "无数据",
    action: { text: "重试", retry: true },
  },
  di_all_zero: {
    icon: <InboxOutlinedIcon sx={{ fontSize: 56 }} />,
    label: "暂无数据",
    action: null,
  },
  no_data: {
    icon: <InboxOutlinedIcon sx={{ fontSize: 56 }} />,
    label: "暂无数据",
    action: null,
  },
  unknown: {
    icon: <ErrorOutlineIcon sx={{ fontSize: 56 }} />,
    label: null,
    action: { text: "重试", retry: true },
  },
};

/**
 * @param {{
 *   type: 'auth_failed'|'timeout'|'network'|'no_projects'|'di_all_zero'|'no_data'|string,
 *   message: string,
 *   onRetry: () => void,
 * }} props
 */
export default function ErrorState({ type = "unknown", message = "", onRetry }) {
  const cfg = CONFIG[type] || CONFIG.unknown;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        py: 6,
        gap: 2,
        color: "text.secondary",
      }}
    >
      <Box sx={{ color: "grey.400" }}>{cfg.icon}</Box>

      <Typography variant="body1" fontWeight={500}>
        {cfg.label || message || "未知错误"}
      </Typography>

      {cfg.action && (
        <Button
          variant="outlined"
          size="small"
          onClick={cfg.action.retry ? onRetry : undefined}
        >
          {cfg.action.text}
        </Button>
      )}
    </Box>
  );
}
