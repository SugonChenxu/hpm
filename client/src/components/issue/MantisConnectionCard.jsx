/**
 * MantisConnectionCard — 故障管理页的 Mantis 连接设置卡片
 *
 * - 每位用户填写自己的 Mantis Cookie（server_url + api_token），按 owner_id 隔离。
 * - 「关注的项目（最近使用）」：用户手动勾选要关注的 Mantis 项目，并逐一选择对应的
 *   Forge 项目。下拉框只显示这些关注项目，不再罗列全部 40 个。
 * - 组件默认由父页面隐藏，点击「⚙ Mantis 设置」按钮才展开。
 */

import { useState, useEffect } from "react";
import { Box, Card, CardContent, TextField, Button, Typography, Alert, Stack, Divider, Checkbox } from "@mui/material";
import api from "../../api/client";

export default function MantisConnectionCard({ onSaved, onClose }) {
  const [serverUrl, setServerUrl] = useState("https://mantis.sugon.com");
  const [cookie, setCookie] = useState("");
  const [showCookie, setShowCookie] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [lastSync, setLastSync] = useState(null);

  const [allMantis, setAllMantis] = useState([]);
  const [forgeProjects, setForgeProjects] = useState([]);
  const [watched, setWatched] = useState([]); // [{ mantis_id, mantis_name, forge_id, forge_name }]
  const [search, setSearch] = useState("");
  const [loadingMeta, setLoadingMeta] = useState(false);

  const loadMeta = () => {
    setLoadingMeta(true);
    Promise.all([
      api.mantis.projects().catch(() => ({ data: [] })),
      api.projects.list({}).catch(() => ({ data: [] })),
      api.mantis.watchedProjects().catch(() => ({ data: [] })),
    ]).then(([mp, fp, wp]) => {
      setAllMantis(mp.data || []);
      setForgeProjects(fp.data || []);
      setWatched(wp.data || []);
    }).finally(() => setLoadingMeta(false));
  };

  useEffect(() => {
    api.mantis.connection().then((r) => {
      const c = r.data || {};
      if (c.server_url) setServerUrl(c.server_url);
      if (c.api_token) setCookie(c.api_token);
      if (c.last_sync_at) setLastSync({ at: c.last_sync_at, st: c.last_sync_status });
    }).catch(() => {});
    loadMeta();
  }, []);

  const isWatched = (mid) => watched.some((w) => String(w.mantis_id) === String(mid));
  const forgeOf = (mid) => watched.find((w) => String(w.mantis_id) === String(mid))?.forge_id || "";

  const toggleWatch = (m) => {
    if (isWatched(m.id)) {
      setWatched((w) => w.filter((x) => String(x.mantis_id) !== String(m.id)));
    } else {
      setWatched((w) => [...w, { mantis_id: m.id, mantis_name: m.name, forge_id: "", forge_name: "" }]);
    }
  };

  const setForge = (mid, fid) => {
    setWatched((w) => w.map((x) =>
      String(x.mantis_id) === String(mid)
        ? { ...x, forge_id: fid, forge_name: forgeProjects.find((p) => String(p.id) === String(fid))?.name || "" }
        : x
    ));
  };

  const save = async () => {
    setSaving(true); setMsg(null);
    const incomplete = watched.filter((w) => !w.forge_id);
    if (incomplete.length) {
      setMsg({ type: "error", text: "请为每个关注项目选择对应的 Forge 项目" });
      setSaving(false);
      return;
    }
    try {
      await api.mantis.updateConnection({
        server_url: serverUrl,
        api_token: cookie,
        watched_projects: watched,
        project_mapping: watched,
      });
      setMsg({ type: "success", text: "已保存，关注项目已更新" });
      // 重新载入列表（Cookie 变化可能影响 Mantis 项目清单）
      const [mp, wp] = await Promise.all([
        api.mantis.projects().catch(() => ({ data: [] })),
        api.mantis.watchedProjects().catch(() => ({ data: [] })),
      ]);
      setAllMantis(mp.data || []);
      setWatched(wp.data || []);
      if (onSaved) onSaved();
    } catch (e) {
      setMsg({ type: "error", text: e.message || "保存失败" });
    } finally {
      setSaving(false);
    }
  };

  const filtered = allMantis.filter((m) => !search || (m.name || "").toLowerCase().includes(search.toLowerCase()));

  return (
    <Card variant="outlined" sx={{ mb: 3 }}>
      <CardContent>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
          <Typography variant="subtitle1">Mantis 连接设置（每用户独立）</Typography>
          {onClose && <Button size="small" onClick={onClose}>收起</Button>}
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          填写你的 Mantis 登录 Cookie，并勾选要关注的（最近使用的）项目，每个项目选择对应的 Forge 项目。其他同事互不影响。
        </Typography>

        <Stack spacing={2}>
          <TextField label="Mantis 服务器地址" value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} size="small" fullWidth />
          <TextField
            label="Cookie / API Token"
            value={cookie}
            onChange={(e) => setCookie(e.target.value)}
            size="small" fullWidth multiline minRows={2}
            type={showCookie ? "text" : "password"}
            helperText="浏览器登录 Mantis 后，F12 → Network → 复制任一请求的 Cookie 请求头完整内容"
          />
          <Box>
            <Button onClick={() => setShowCookie((s) => !s)} size="small" sx={{ mr: 1 }}>{showCookie ? "隐藏" : "显示"}</Button>
            <Button variant="contained" onClick={save} disabled={saving || !cookie.trim()}>{saving ? "保存中…" : "保存连接"}</Button>
          </Box>
        </Stack>

        <Divider sx={{ my: 2 }} />
        <Typography variant="subtitle2" gutterBottom>关注的项目（最近使用）</Typography>
        <TextField size="small" placeholder="搜索 Mantis 项目…" value={search} onChange={(e) => setSearch(e.target.value)}
          sx={{ mb: 1, width: 280 }} />
        <Box sx={{ maxHeight: 320, overflowY: "auto", border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
          {loadingMeta && <Typography variant="body2" sx={{ p: 2 }} color="text.secondary">加载中…</Typography>}
          {!loadingMeta && filtered.length === 0 && <Typography variant="body2" sx={{ p: 2 }} color="text.secondary">无匹配项目</Typography>}
          {!loadingMeta && filtered.map((m) => (
            <Box key={m.id} sx={{ display: "flex", alignItems: "center", gap: 1, p: 1, borderBottom: "1px solid", borderColor: "divider" }}>
              <Checkbox size="small" checked={isWatched(m.id)} onChange={() => toggleWatch(m)} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" noWrap title={m.name}>{m.name}</Typography>
              </Box>
              {isWatched(m.id) && (
                <TextField select size="small" value={forgeOf(m.id)} onChange={(e) => setForge(m.id, e.target.value)}
                  sx={{ minWidth: 200 }} SelectProps={{ displayEmpty: true }}>
                  <MenuItem value="">选择对应 Forge 项目</MenuItem>
                  {forgeProjects.map((p) => (<MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>))}
                </TextField>
              )}
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
  );
}
