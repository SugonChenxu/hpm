import { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Switch,
  FormControlLabel,
  Box,
  Typography,
  Divider,
  Paper,
  CircularProgress,
  Snackbar,
  Alert,
} from "@mui/material";
import { Hub } from "@mui/icons-material";
import api from "../../api/client";

/**
 * PLM 连接配置 + 只读探针对话框（P0）
 *
 * - 表单：server_url / 会话 Cookie(api_token) / collab_space / 跳过 TLS 校验开关
 * - 「保存连接」→ api.plm.saveConnection，成功 Snackbar
 * - 探针区：输入待探测 URL（相对或绝对），「探测」→ api.plm.probe，展示结构化结果
 * - 打开时自动 getConnection 回填
 *
 * 安全：Cookie 只通过接口写入后端 DB，绝不硬编码进源码/配置。
 */
export default function PlmConnectionDialog({ open, onClose }) {
  const [form, setForm] = useState({
    server_url: "https://plm.sugon.com",
    api_token: "",
    collab_space: "GLOBAL",
    // tls_reject_unauthorized: 0 = 跳过内部 CA（默认开）, 1 = 校验
    tls_reject_unauthorized: 0,
  });
  const [probeUrl, setProbeUrl] = useState("/3dspace/common/emxTree.jsp");
  const [saving, setSaving] = useState(false);
  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState(null);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "success",
  });

  // 打开时自动回填连接配置
  useEffect(() => {
    if (!open) return;
    setProbeResult(null);
    api.plm
      .getConnection()
      .then((res) => {
        const c = res.data || {};
        setForm({
          server_url: c.server_url || "https://plm.sugon.com",
          api_token: c.api_token || "",
          collab_space: c.collab_space || "GLOBAL",
          tls_reject_unauthorized: c.tls_reject_unauthorized === 1 ? 1 : 0,
        });
      })
      .catch(() => {
        /* 无配置时保持默认值即可 */
      });
  }, [open]);

  const showSnackbar = (message, severity) => {
    setSnackbar({ open: true, message, severity });
  };

  const handleSave = async () => {
    if (!form.server_url.trim()) {
      showSnackbar("PLM 服务地址必填", "warning");
      return;
    }
    setSaving(true);
    try {
      await api.plm.saveConnection({
        server_url: form.server_url.trim(),
        api_token: form.api_token.trim(),
        collab_space: form.collab_space.trim() || "GLOBAL",
        tls_reject_unauthorized: form.tls_reject_unauthorized,
      });
      showSnackbar("PLM 连接已保存", "success");
    } catch (err) {
      showSnackbar(err.message || "保存失败", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleProbe = async () => {
    if (!probeUrl.trim()) {
      showSnackbar("请输入要探测的 URL", "warning");
      return;
    }
    setProbing(true);
    setProbeResult(null);
    try {
      const res = await api.plm.probe(probeUrl.trim());
      setProbeResult(res.data || null);
    } catch (err) {
      showSnackbar(err.message || "探测失败", "error");
    } finally {
      setProbing(false);
    }
  };

  const handleClose = () => {
    if (onClose) onClose();
  };

  const isSkipTls = form.tls_reject_unauthorized === 0;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Hub color="primary" />
          PLM 连接配置与只读探针
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {/* ── 连接配置表单 ── */}
        <Typography variant="subtitle2" gutterBottom>
          连接配置
        </Typography>

        <TextField
          label="PLM 服务地址"
          fullWidth
          margin="dense"
          value={form.server_url}
          onChange={(e) => setForm({ ...form, server_url: e.target.value })}
          placeholder="https://plm.sugon.com"
        />

        <TextField
          label="会话 Cookie（api_token）"
          fullWidth
          margin="dense"
          value={form.api_token}
          onChange={(e) => setForm({ ...form, api_token: e.target.value })}
          placeholder="JSESSIONID=...cas01"
          helperText="CAS SSO 登录后的会话 Cookie，仅通过接口写入后端数据库，不会保存在前端代码中"
        />

        <TextField
          label="协作空间（collab_space）"
          fullWidth
          margin="dense"
          value={form.collab_space}
          onChange={(e) => setForm({ ...form, collab_space: e.target.value })}
          placeholder="GLOBAL"
        />

        <FormControlLabel
          sx={{ mt: 1 }}
          control={
            <Switch
              checked={isSkipTls}
              onChange={(e) =>
                setForm({
                  ...form,
                  tls_reject_unauthorized: e.target.checked ? 0 : 1,
                })
              }
            />
          }
          label="跳过 TLS 证书校验（内部 CA 签发，默认开启）"
        />

        <Divider sx={{ my: 2 }} />

        {/* ── 只读探针 ── */}
        <Typography variant="subtitle2" gutterBottom>
          只读探针
        </Typography>
        <Typography variant="caption" color="text.secondary">
          用上方配置的会话 Cookie 探测 PLM 任意 URL（相对路径将自动拼接服务地址）。
          真实排程请求 URL 请在浏览器 F12 抓取后填入。
        </Typography>

        <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
          <TextField
            label="探测 URL（相对如 /3dspace/common/emxTree.jsp 或绝对）"
            fullWidth
            size="small"
            value={probeUrl}
            onChange={(e) => setProbeUrl(e.target.value)}
            placeholder="/3dspace/common/emxTree.jsp"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleProbe();
            }}
          />
          <Button
            variant="contained"
            onClick={handleProbe}
            disabled={probing}
            sx={{ minWidth: 96, whiteSpace: "nowrap" }}
          >
            {probing ? <CircularProgress size={20} /> : "探测"}
          </Button>
        </Box>

        {probeResult && (
          <Paper variant="outlined" sx={{ mt: 2, p: 2 }}>
            <Typography variant="body2">
              HTTP 状态：
              <b>{probeResult.status || "-"}</b>
              {probeResult.message ? `（${probeResult.message}）` : ""}
            </Typography>
            <Typography variant="body2">
              Content-Type：{probeResult.contentType || "-"}
            </Typography>
            <Typography variant="body2">
              Body 长度：{probeResult.bodyLength}
            </Typography>
            <Typography variant="body2">
              是否 JSON：
              {probeResult.isJson
                ? `是（顶层 keys: ${probeResult.jsonKeys?.join(", ") || "（空）"}）`
                : "否"}
            </Typography>
            <Typography variant="body2">
              是否 HTML：{probeResult.isHtml ? "是" : "否"}
            </Typography>

            <Typography variant="subtitle2" sx={{ mt: 1 }}>
              Body 前 2000 字符：
            </Typography>
            <Box
              sx={{
                maxHeight: 300,
                overflow: "auto",
                bgcolor: "#f5f5f5",
                p: 1,
                borderRadius: 1,
              }}
            >
              <pre
                style={{
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  fontSize: "0.75rem",
                }}
              >
                {probeResult.bodyHead || "（空）"}
              </pre>
            </Box>
          </Paper>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>关闭</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? "保存中..." : "保存连接"}
        </Button>
      </DialogActions>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          severity={snackbar.severity}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Dialog>
  );
}
