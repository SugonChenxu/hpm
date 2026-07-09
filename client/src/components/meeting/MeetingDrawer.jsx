import { useEffect, useState } from "react";
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  Button,
  Divider,
  Chip,
  Snackbar,
  Alert,
} from "@mui/material";
import { Close, ContentCopy } from "@mui/icons-material";
import api from "../../api/client";
import SmartMinutesViewer from "./SmartMinutesViewer";

/**
 * MeetingDrawer — 右侧滑出面板，展示会议详情与 AI 智能纪要
 *
 * Props:
 *   open    — Drawer 是否打开
 *   onClose — 关闭回调
 *   meeting — 会议对象（含 id, title, start_time, end_time, meeting_code, duration_minutes 等）
 */
export default function MeetingDrawer({ open, onClose, meeting }) {
  const [loading, setLoading] = useState(false);
  const [minutes, setMinutes] = useState(undefined); // undefined=未加载, null=无纪要
  const [error, setError] = useState(null);
  const [snackOpen, setSnackOpen] = useState(false);

  // 打开 Drawer 或切换会议时重新加载纪要
  useEffect(() => {
    if (!meeting || !open) {
      setMinutes(undefined);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    setMinutes(undefined);

    api.meetings
      .getMinutes(meeting.id)
      .then((res) => {
        setMinutes(res.data); // data 可能为 null（无纪要）
      })
      .catch((e) => {
        setError(e.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [meeting, open]);

  /** 复制纪要全文到剪贴板 */
  const handleCopy = () => {
    if (minutes && minutes.content) {
      navigator.clipboard.writeText(minutes.content).then(
        () => setSnackOpen(true),
        () => setSnackOpen(true) // 即使失败也提示
      );
    }
  };

  /** 格式化 ISO 时间为可读字符串 */
  const formatTime = (iso) => {
    if (!iso) return "-";
    try {
      return new Date(iso).toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  return (
    <>
      <Drawer
        anchor="right"
        open={open}
        onClose={onClose}
        PaperProps={{ sx: { width: { xs: "100%", sm: 600 } } }}
      >
        <Box sx={{ p: 3, height: "100%", overflow: "auto" }}>
          {/* ===== 标题区 ===== */}
          <Box
            sx={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              mb: 2,
            }}
          >
            <Box sx={{ flex: 1, mr: 2 }}>
              <Typography variant="h6" fontWeight={700}>
                {meeting?.title || "-"}
              </Typography>

              {/* 基本信息标签 */}
              <Box sx={{ display: "flex", gap: 1, mt: 1.5, flexWrap: "wrap" }}>
                <Chip
                  label={formatTime(meeting?.start_time)}
                  size="small"
                  variant="outlined"
                  color="primary"
                />
                {meeting?.meeting_code && (
                  <Chip
                    label={`会议号: ${meeting.meeting_code}`}
                    size="small"
                    variant="outlined"
                  />
                )}
                {meeting?.duration_minutes && (
                  <Chip
                    label={`${meeting.duration_minutes} 分钟`}
                    size="small"
                    variant="outlined"
                  />
                )}
              </Box>
            </Box>

            {/* 操作按钮组 */}
            <Box sx={{ display: "flex", gap: 0.5, flexShrink: 0 }}>
              {minutes && minutes.content && (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<ContentCopy />}
                  onClick={handleCopy}
                >
                  一键复制
                </Button>
              )}
              <IconButton onClick={onClose} size="small">
                <Close />
              </IconButton>
            </Box>
          </Box>

          <Divider sx={{ mb: 3 }} />

          {/* ===== 纪要内容区 ===== */}
          <Box>
            <Typography variant="subtitle1" fontWeight={600} mb={1.5}>
              AI 智能纪要
            </Typography>
            <SmartMinutesViewer loading={loading} error={error} data={minutes} />
          </Box>
        </Box>
      </Drawer>

      {/* 复制成功提示 */}
      <Snackbar
        open={snackOpen}
        autoHideDuration={2000}
        onClose={() => setSnackOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="success" variant="filled" onClose={() => setSnackOpen(false)}>
          已复制到剪贴板
        </Alert>
      </Snackbar>
    </>
  );
}
