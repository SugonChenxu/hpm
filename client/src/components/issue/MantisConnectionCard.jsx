/**
 * MantisConnectionCard — 故障管理页面顶部的 Mantis 连接配置卡片
 *
 * 每位用户在此填写自己的 Mantis 登录 Cookie（server_url + api_token），
 * 后端按 owner_id 隔离，互不影响。保存后自动刷新项目下拉列表。
 */

import { useState, useEffect } from "react";
import { Box, Card, CardContent, TextField, Button, Typography, Alert, Stack, Divider } from "@mui/material";
import api from "../../api/client";

export default function MantisConnectionCard({ onSaved }) {
  const [serverUrl, setServerUrl] = useState("https://mantis.sugon.com");
  const [cookie, setCookie] = useState("");
  const [showCookie, setShowCookie] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [lastSync, setLastSync] = useState(null);

  useEffect(() => {
    api.mantis.connection().then((r) => {
      const c = r.data || {};
      if (c.server_url) setServerUrl(c.server_url);
      if (c.api_token) setCookie(c.api_token);
      if (c.last_sync_at) setLastSync({ at: c.last_sync_at, st: c.last_sync_status });
    }).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      await api.mantis.updateConnection({ server_url: serverUrl, api_token: cookie });
      setMsg({ type: "success", text: "已保存，现在可以同步 Mantis 数据了" });
      if (onSaved) onSaved();
    } catch (e) {
      setMsg({ type: "error", text: e.message || "保存失败" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card variant="outlined" sx={{ mb: 3 }}>
      <CardContent>
        <Typography variant="subtitle1" gutterBottom>Mantis 连接配置（每用户独立）</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          填写你在 Sugon Mantis 的登录 Cookie，用于拉取「本人账号」下的缺陷数据。其他同事的 Cookie 互不影响。
        </Typography>
        <Stack spacing={2}>
          <TextField
            label="Mantis 服务器地址"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            size="small"
            fullWidth
          />
          <TextField
            label="Cookie / API Token"
            value={cookie}
            onChange={(e) => setCookie(e.target.value)}
            size="small"
            fullWidth
            multiline
            minRows={2}
            type={showCookie ? "text" : "password"}
            helperText="浏览器登录 Mantis 后，按 F12 → Network → 复制任一请求的 Cookie 请求头完整内容"
          />
          <Box>
            <Button onClick={() => setShowCookie((s) => !s)} size="small" sx={{ mr: 1 }}>
              {showCookie ? "隐藏" : "显示"}
            </Button>
            <Button variant="contained" onClick={save} disabled={saving || !cookie.trim()}>
              {saving ? "保存中…" : "保存连接"}
            </Button>
          </Box>
          {lastSync?.at && (
            <Typography variant="caption" color="text.secondary">
              上次同步：{lastSync.at}（状态：{lastSync.st || "未知"}）
            </Typography>
          )}
          {msg && <Alert severity={msg.type}>{msg.text}</Alert>}
        </Stack>
        <Divider sx={{ my: 1.5 }} />
        <Typography variant="caption" color="text.secondary">
          提示：Mantis 没有「最近使用项目」接口，下拉框展示全部项目；选择后会自动按名称匹配并记住映射。
        </Typography>
      </CardContent>
    </Card>
  );
}
