import { useState } from "react";
import { Paper, Typography, Button, Snackbar, Alert, Skeleton, Box } from "@mui/material";

export default function ReportPanel({ reportText = "", loading = false }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(reportText);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = reportText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
  };

  if (loading) return <Box sx={{ mt: 3 }}><Skeleton variant="rectangular" height={120} sx={{ borderRadius: 1 }} /></Box>;

  return (
    <Box sx={{ mt: 3 }}>
      <Typography variant="h6" gutterBottom>故障周报</Typography>
      <Paper variant="outlined" sx={{ p: 2, position: "relative", bgcolor: "grey.100" }}>
        {reportText && (
          <Button variant="contained" size="small" onClick={handleCopy}
            sx={{ position: "absolute", top: 8, right: 8, fontSize: 12 }}>
            📋 一键复制
          </Button>
        )}
        <Typography sx={{ fontFamily: "monospace", fontSize: 15, whiteSpace: "pre-wrap", pr: reportText ? 12 : 0 }}>
          {reportText || "暂无报告数据"}
        </Typography>
      </Paper>
      <Snackbar open={copied} autoHideDuration={3000} onClose={() => setCopied(false)}>
        <Alert severity="success" variant="filled">已复制到剪贴板</Alert>
      </Snackbar>
    </Box>
  );
}
