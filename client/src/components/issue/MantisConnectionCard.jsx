/**
 * MantisConnectionCard — 故障管理页的 Mantis 连接设置卡片
 *
 * - 每位用户填写自己的 Mantis Cookie（server_url + api_token），按 owner_id 隔离。
 * - 「关联 Forge 项目」：列出你在 Mantis 中「最近使用」的项目（真实接口），
 *   为每个项目选择对应的 Forge 项目。该映射仅用于把 Mantis 缺陷同步进 Forge 缺陷列表，
 *   仪表盘本身直接读取 Mantis 实时数据，无需映射。
 * - 组件默认由父页面隐藏，点击「⚙ Mantis 设置」按钮才展开。
 */

import { useState, useEffect } from "react";
import { Box, Card, CardContent, TextField, Button, Typography, Alert, Stack, Divider, MenuItem, IconButton, Tooltip, Dialog, DialogTitle, DialogContent, DialogActions, Link } from "@mui/material";
import api from "../../api/client";

export default function MantisConnectionCard({ onSaved, onClose }) {
  const [serverUrl, setServerUrl] = useState("https://mantis.sugon.com");
  const [cookie, setCookie] = useState("");
  const [showCookie, setShowCookie] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const [recentMantis, setRecentMantis] = useState([]); // [{id, name}] 来自真实最近使用接口
  const [forgeProjects, setForgeProjects] = useState([]);
  // 映射：{ [mantis_id]: { mantis_id, mantis_name, forge_id, forge_name } }
  const [mapping, setMapping] = useState({});
  const [loadingMeta, setLoadingMeta] = useState(false);

  const loadMeta = () => {
    setLoadingMeta(true);
    Promise.all([
      api.mantis.recentProjects().catch(() => ({ data: [] })),
      api.projects.list({}).catch(() => ({ data: [] })),
      api.mantis.connection().then((r) => r.data || {}).catch(() => ({})),
    ]).then(([rp, fp, conn]) => {
      setRecentMantis(rp.data || []);
      setForgeProjects(fp.data || []);
      const prev = conn.project_mapping ? conn.project_mapping : (conn.watched_projects || []);
      const m = {};
      try {
        (Array.isArray(prev) ? prev : JSON.parse(prev || "[]")).forEach((x) => {
          if (x?.mantis_id) m[x.mantis_id] = x;
        });
      } catch {}
      setMapping(m);
      if (conn.server_url) setServerUrl(conn.server_url);
      if (conn.api_token) setCookie(conn.api_token);
      if (conn.last_sync_at) setLastSync({ at: conn.last_sync_at, st: conn.last_sync_status });
    }).finally(() => setLoadingMeta(false));
  };

  useEffect(() => { loadMeta(); }, []);

  const setForge = (mid, mname, fid) => {
    setMapping((m) => ({
      ...m,
      [mid]: {
        mantis_id: mid,
        mantis_name: mname,
        forge_id: fid,
        forge_name: forgeProjects.find((p) => String(p.id) === String(fid))?.name || "",
      },
    }));
  };

  const save = async () => {
    setSaving(true); setMsg(null);
    const arr = Object.values(mapping).filter((x) => x.forge_id);
    try {
      await api.mantis.updateConnection({
        server_url: serverUrl,
        api_token: cookie,
        project_mapping: arr,
        watched_projects: arr, // 兼容字段，保持与旧逻辑一致
      });
      setMsg({ type: "success", text: "已保存，关联映射已更新" });
      if (onSaved) onSaved();
    } catch (e) {
      setMsg({ type: "error", text: e.message || "保存失败" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <Card variant="outlined" sx={{ mb: 3 }}>
      <CardContent>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
          <Typography variant="subtitle1">Mantis 连接设置（每用户独立）</Typography>
          {onClose && <Button size="small" onClick={onClose}>收起</Button>}
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          填写你的 Mantis 登录 Cookie。下方列出你在 Mantis「最近使用」的项目，按需为每个关联对应的 Forge 项目（仅用于把缺陷同步进 Forge 缺陷列表）。仪表盘本身直接读取 Mantis 实时数据。
        </Typography>

        <Stack spacing={2}>
          <TextField label="Mantis 服务器地址" value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} size="small" fullWidth />
          <TextField
            label="Cookie / API Token"
            value={cookie}
            onChange={(e) => setCookie(e.target.value)}
            size="small" fullWidth multiline minRows={2}
            type={showCookie ? "text" : "password"}
            helperText={
              <span>
                浏览器登录 Mantis 后，F12 → Network → 复制任一请求的 Cookie 请求头完整内容。
                {" "}
                <Link component="button" type="button" onClick={() => setHelpOpen(true)} sx={{ cursor: "pointer" }}>
                  ？如何获取 Cookie
                </Link>
              </span>
            }
          />
          <Box>
            <Button onClick={() => setShowCookie((s) => !s)} size="small" sx={{ mr: 1 }}>{showCookie ? "隐藏" : "显示"}</Button>
            <Button variant="contained" onClick={save} disabled={saving || !cookie.trim()}>{saving ? "保存中…" : "保存连接"}</Button>
          </Box>
        </Stack>

        <Divider sx={{ my: 2 }} />
        <Typography variant="subtitle2" gutterBottom>关联 Forge 项目（最近使用的 Mantis 项目）</Typography>
        <Box sx={{ maxHeight: 320, overflowY: "auto", border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
          {loadingMeta && <Typography variant="body2" sx={{ p: 2 }} color="text.secondary">加载中…</Typography>}
          {!loadingMeta && recentMantis.length === 0 && (
            <Typography variant="body2" sx={{ p: 2 }} color="text.secondary">
              暂无最近使用的 Mantis 项目。请确认 Cookie 有效，或在 Mantis 中打开过项目后再刷新。
            </Typography>
          )}
          {!loadingMeta && recentMantis.map((m) => (
            <Box key={m.id} sx={{ display: "flex", alignItems: "center", gap: 1, p: 1, borderBottom: "1px solid", borderColor: "divider" }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" noWrap title={m.name}>{m.name}</Typography>
              </Box>
              <TextField select size="small" value={mapping[m.id]?.forge_id || ""}
                onChange={(e) => setForge(m.id, m.name, e.target.value)}
                sx={{ minWidth: 200 }} SelectProps={{ displayEmpty: true }}>
                <MenuItem value="">不关联</MenuItem>
                {forgeProjects.map((p) => (<MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>))}
              </TextField>
            </Box>
          ))}
        </Box>

        {lastSync?.at && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
            上次同步：{lastSync.at}（状态：{lastSync.st || "未知"}）
          </Typography>
        )}
        {msg && <Alert severity={msg.type} sx={{ mt: 1 }}>{msg.text}</Alert>}
      </CardContent>
    </Card>

    <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} maxWidth="sm" fullWidth>
      <DialogTitle>
        如何获取 Mantis Cookie
        <Tooltip title="关闭">
          <IconButton onClick={() => setHelpOpen(false)} sx={{ position: "absolute", right: 8, top: 8 }}>
            ✕
          </IconButton>
        </Tooltip>
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" sx={{ mb: 1.5 }}>
          用途：把这段 Cookie 填进上面的框，让故障管理模块能拉取你账号下的 Mantis 缺陷数据。
          <strong>任何浏览器都可以（Edge / Firefox / Safari 无需谷歌浏览器）</strong>——Cookie 取自你平时登录 Mantis 用的那个浏览器。
        </Typography>

        <Typography variant="subtitle2" sx={{ mt: 1 }}>① 打开开发者工具（各浏览器通用）</Typography>
        <Box component="ul" sx={{ mt: 0.5, mb: 1, pl: 3 }}>
          <li><strong>Edge / Chrome</strong>：按 <code>F12</code> 或 <code>Ctrl+Shift+I</code>（操作完全一样）。</li>
          <li><strong>Firefox</strong>：按 <code>F12</code>，或直接 <code>Ctrl+Shift+E</code> 开 Network。</li>
          <li><strong>Safari</strong>：先「设置 → 高级」勾选显示开发菜单，再 <code>Option+Cmd+I</code> 开检查器。</li>
        </Box>

        <Typography variant="subtitle2">② 复制 Cookie 请求头（推荐、最稳）</Typography>
        <Box component="ul" sx={{ mt: 0.5, mb: 1, pl: 3 }}>
          <li>在<strong>已登录 Mantis</strong>的页面，切到 <strong>Network</strong> 标签，按 <code>F5</code> 刷新。</li>
          <li>点列表里任意请求 → 右侧 <strong>Headers → 请求标头</strong> 里的 <code>Cookie</code> 一行 → 右键 <strong>复制值</strong>。</li>
          <li>回到 Forge 输入框 <code>Ctrl+V</code> 粘贴 → 保存。下方「最近使用的 Mantis 项目」能列出即成功。</li>
        </Box>

        <Typography variant="subtitle2">③ 备选：右键请求复制为 cURL</Typography>
        <Box component="ul" sx={{ mt: 0.5, mb: 1, pl: 3 }}>
          <li>Network 里右键任意请求 → <strong>Copy as cURL</strong> → 在记事本找 <code>--cookie '....'</code> 那段复制出来。</li>
        </Box>

        <Alert severity="warning" sx={{ mt: 1 }}>
          <strong>关键坑</strong>：Mantis 登录态 Cookie 通常是 <code>httpOnly</code>，JS 书签 / <code>document.cookie</code> 读不到，取出来会缺关键字段导致「鉴权失败」。请务必走上面的 DevTools 网络抓取法。
        </Alert>
        <Alert severity="info" sx={{ mt: 1 }}>
          Cookie 会随 Mantis 会话过期（退出登录或几天后），届时 Forge 报「鉴权失败」，重新走一遍即可。整段复制最保险，无需只挑某个字段。
        </Alert>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setHelpOpen(false)} variant="contained">知道了</Button>
      </DialogActions>
    </Dialog>
    </>
  );
}
