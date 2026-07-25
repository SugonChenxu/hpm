/**
 * PLMConnectionCard — 库存管理页的 PLM 连接设置卡片
 *
 * 流程：填 Cookie → 自动拉 PLM 项目列表 → 按名称自动匹配 Forge 项目 → 逐项目设仓库(treeLabel)
 */

import { useState, useEffect } from "react";
import {
  Box, Card, CardContent, TextField, Button, Typography, Alert, Stack, Divider, MenuItem,
  IconButton, Tooltip, Dialog, DialogTitle, DialogContent, DialogActions, Link,
} from "@mui/material";
import api from "../../api/client";

function norm(s) {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export default function PLMConnectionCard({ onSaved, onClose }) {
  const [serverUrl, setServerUrl] = useState("https://plm.sugon.com/3dspace");
  const [cookie, setCookie] = useState("");
  const [showCookie, setShowCookie] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const [plmProjects, setPlmProjects] = useState([]); // [{oid, code, name}]
  const [forgeProjects, setForgeProjects] = useState([]);
  // 每个 Forge 项目一个 link: { forge_id, forge_name, plm_oid, plm_code, plm_name, tree_label }
  const [links, setLinks] = useState({});
  const [loadingMeta, setLoadingMeta] = useState(false);

  const loadMeta = () => {
    setLoadingMeta(true);
    Promise.all([
      api.plm.projects().catch(() => ({ data: [], needsConfig: false })),
      api.projects.list({}).catch(() => ({ data: [] })),
      api.plm.connection().then((r) => r.data || {}).catch(() => ({})),
    ]).then(([pp, fp, conn]) => {
      const list = (pp.data || []).map((p) => ({ oid: p.oid || p.id, code: p.code || "", name: p.name || "" }));
      setPlmProjects(list);
      const fps = fp.data || [];
      setForgeProjects(fps);
      let prev = [];
      try { prev = Array.isArray(conn.project_links) ? conn.project_links : JSON.parse(conn.project_links || "[]"); } catch {}
      const m = {};
      (prev || []).forEach((x) => { if (x?.forge_id) m[x.forge_id] = x; });
      // 自动匹配：尚未关联的 Forge 项目按名称预选 PLM 项目
      fps.forEach((p) => {
        if (m[p.id]) return;
        const fn = norm(p.name);
        const hit = list.find(
          (lp) => norm(lp.code).includes(fn) || norm(lp.name).includes(fn) ||
            fn.includes(norm(lp.code)) || fn.includes(norm(lp.name))
        );
        if (hit) {
          m[p.id] = {
            forge_id: p.id, forge_name: p.name,
            plm_oid: hit.oid, plm_code: hit.code || "", plm_name: hit.name || hit.code,
            tree_label: "",
          };
        }
      });
      setLinks(m);
      if (conn.server_url) setServerUrl(conn.server_url);
      if (conn.cookie) setCookie(conn.cookie);
    }).finally(() => setLoadingMeta(false));
  };

  useEffect(() => { loadMeta(); }, []);

  const setField = (fid, field, value) => {
    setLinks((m) => ({
      ...m,
      [fid]: {
        forge_id: fid,
        forge_name: forgeProjects.find((p) => String(p.id) === String(fid))?.name || "",
        ...(m[fid] || {}),
        [field]: value,
      },
    }));
  };

  const save = async () => {
    setSaving(true); setMsg(null);
    const arr = Object.values(links).filter((x) => x.plm_oid);
    try {
      await api.plm.updateConnection({
        server_url: serverUrl,
        cookie,
        project_links: arr,
      });
      setMsg({ type: "success", text: `已保存（${arr.length} 个项目已关联）` });
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
            <Typography variant="subtitle1">PLM 连接设置（每用户独立）</Typography>
            {onClose && <Button size="small" onClick={onClose}>收起</Button>}
          </Box>

          <Stack spacing={2}>
            <TextField label="PLM 服务器地址" value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} size="small" fullWidth />
            <TextField
              label="Cookie"
              value={cookie}
              onChange={(e) => setCookie(e.target.value)}
              size="small" fullWidth multiline minRows={2}
              type={showCookie ? "text" : "password"}
              helperText={
                <span>
                  浏览器登录 PLM 后，F12 → Network → 复制任一请求的 Cookie 请求头完整内容（含 JSESSIONID 与 afs）。
                  {" "}
                  <Link component="button" type="button" onClick={() => setHelpOpen(true)} sx={{ cursor: "pointer" }}>
                    ？获取方法
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
          <Typography variant="subtitle2" gutterBottom>
            项目关联（按 Forge 项目名自动匹配 PLM 项目，可手动改）
          </Typography>
          <Box sx={{ maxHeight: 400, overflowY: "auto", border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
            {loadingMeta && <Typography variant="body2" sx={{ p: 2 }} color="text.secondary">加载中…</Typography>}
            {!loadingMeta && forgeProjects.length === 0 && (
              <Typography variant="body2" sx={{ p: 2 }} color="text.secondary">暂无 Forge 项目。</Typography>
            )}
            {!loadingMeta && forgeProjects.map((p) => {
              const l = links[p.id] || {};
              return (
                <Box key={p.id} sx={{ p: 1.5, borderBottom: "1px solid", borderColor: "divider" }}>
                  <Typography variant="body2" fontWeight={600}>{p.name}</Typography>
                  <Box sx={{ display: "flex", gap: 1, mt: 0.8, flexWrap: "wrap" }}>
                    <TextField select size="small" value={l.plm_oid || ""}
                      onChange={(e) => {
                        const hit = plmProjects.find((x) => x.oid === e.target.value);
                        setField(p.id, "plm_oid", e.target.value);
                        setField(p.id, "plm_code", hit?.code || "");
                        setField(p.id, "plm_name", hit?.name || "");
                      }}
                      sx={{ minWidth: 240, flex: 1 }} SelectProps={{ displayEmpty: true }}>
                      <MenuItem value="">不关联</MenuItem>
                      {plmProjects.map((x) => (
                        <MenuItem key={x.oid} value={x.oid}>
                          [{x.code}] {x.name}
                        </MenuItem>
                      ))}
                    </TextField>
                    <TextField size="small" label="仓库" placeholder="青海" value={l.tree_label || ""}
                      onChange={(e) => setField(p.id, "tree_label", e.target.value)} sx={{ minWidth: 110 }} />
                  </Box>
                </Box>
              );
            })}
          </Box>

          {msg && <Alert severity={msg.type} sx={{ mt: 1 }}>{msg.text}</Alert>}
        </CardContent>
      </Card>

      <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          如何获取 PLM Cookie
          <Tooltip title="关闭">
            <IconButton onClick={() => setHelpOpen(false)} sx={{ position: "absolute", right: 8, top: 8 }}>✕</IconButton>
          </Tooltip>
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            任意浏览器均可：登录 PLM → F12 → Network → 任意请求 → Headers → Request Headers → Cookie → 右键复制值。
          </Typography>
          <Alert severity="warning" sx={{ mt: 1 }}>Cookie 含 httpOnly 字段，JS 代码读不到，请务必用 DevTools 网络抓取法。</Alert>
          <Alert severity="info" sx={{ mt: 1 }}>Cookie 会在 PLM 退出登录/隔天后过期，届时重新获取即可。</Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHelpOpen(false)} variant="contained">知道了</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
