/**
 * ReportPanel — 自动生成故障报告面板
 *
 * MUI Paper 容器，等宽字体展示报告文本。
 * 提供"一键复制"按钮将文本写入剪贴板。
 */

import { useState } from "react";
import { Paper, Typography, Button, Snackbar, Alert, Skeleton, Box } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";

/**
 * @param {{ reportText: string, loading: boolean }} props
 */
export default function ReportPanel({ reportText = "", loading = false }) {
  const [snackOpen, setSnackOpen] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(reportText);
      setSnackOpen(true);
    } catch {
      // 兜底：老浏览器 fallback
      const textarea = document.createElement("textarea");
      textarea.value = reportText;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setSnackOpen(true);
    }
  };

  return (
    <Box sx={{ mb: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
        <Typography variant="h6">故障报告</Typography>
        <Button
          size="small"
          startIcon={<ContentCopyIcon />}
          disabled={loading || !reportText}
          onClick={handleCopy}
        >
          一键复制
        </Button>
      </Box>

      {loading ? (
        <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 1 }} />
      ) : (
        <Paper
          variant="outlined"
          sx={{
            p: 2,
            fontFamily: "monospace",
            fontSize: "0.875rem",
            whiteSpace: "pre-wrap",
            lineHeight: 1.8,
            bgcolor: "grey.50",
          }}
        >
          {reportText || (
            <Typography variant="body2" color="text.secondary" sx={{ fontFamily: "inherit" }}>
              暂无报告数据
            </Typography>
          )}
        </Paper>
      )}

      <Snackbar
        open={snackOpen}
        autoHideDuration={3000}
        onClose={() => setSnackOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="success" variant="filled" sx={{ width: "100%" }}>
          已复制到剪贴板
        </Alert>
      </Snackbar>
    </Box>
  );
}
