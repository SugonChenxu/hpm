/**
 * PLMConnectionCard — 库存管理页的 PLM 连接设置卡片
 *
 * - 每位用户填写自己的 PLM 登录 Cookie（JSESSIONID + afs），按 owner_id 隔离。
 * - 「关联项目」：列出你的 Forge 项目，为每个选择一个 PLM 项目（优先按名称自动匹配，可手动改），
 *   并填写 仓库(treeLabel，如 青海/北京/天津) 与 库位号(LGORT，库存地点)。
 *   仓库用于确定拉取哪个研发库房；库位号用于默认过滤该项目的库存。
 */

import { useState, useEffect } from "react";
import {
  Box, Card, CardContent, TextField, Button, Typography, Alert, Stack, Divider, MenuItem, IconButton, Tooltip, Dialog, DialogTitle, DialogContent, DialogActions, Link,
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
  const [lastSync, setLastSync] = useState(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const [plmProjects, setPlmProjects] = useState([]); // [{oid, code, name}]
  const [forgeProjects, setForgeProjects] = useState([]);
  // 映射：{ [forge_id]: { forge_id, forge_name, plm_oid, plm_name, tree_label, lgort } }
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
      setForgeProjects(fp.data || []);
      const prev = conn.project_links ? (Array.isArray(conn.project_links) ? conn.project_links : JSON.parse(conn.project_links || "[]")) : [];
      const m = {};
      (prev || []).forEach((x) => { if (x?.forge_id) m[x.forge_id] = x; });
      // 自动匹配：对尚未关联的 Forge 项目，按名称预选 PLM 项目
      const map = { ...m };
      (fp.data || []).forEach((p) => {
        if (map[p.id]) return;
        const fn = norm(p.name);
        const hit = list.find(
          (lp) => norm(lp.code).includes(fn) || norm(lp.name).includes(fn) ||
            fn.includes(norm(lp.code)) || fn.includes(norm(lp.name))
        );
        if (hit) {
          map[p.id] = {
            forge_id: p.id, forge_name: p.name,
            plm_oid: hit.oid, plm_name: hit.name || hit.code,
            tree_label: "", lgort: "",
          };
        }
      });
      setLinks(map);
      if (conn.server_url) setServerUrl(conn.server_url);
      if (conn.cookie) setCookie(conn.cookie);
      if (conn.last_sync_at) setLastSync({ at: conn.last_sync_at, st: conn.last_sync_status });
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
      setMsg({ type: "success", text: "已保存，项目关联已更新" });
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
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            填写你的 PLM 登录 Cookie。下方列出你的 Forge 项目，为每个关联对应的 PLM 项目（优先按名称自动匹配，可手动改），并填写仓库与库位号。关联后到项目库存页点「同步库存」即可拉取。
          </Typography>

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
          <Typography variant="subtitle2" gutterBottom>关联项目（仓库 / 库位号）</Typography>
          <Box sx={{ maxHeight: 360, overflowY: "auto", border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
            {loadingMeta && <Typography variant="body2" sx={{ p: 2 }} color="text.secondary">加载中…</Typography>}
            {!loadingMeta && forgeProjects.length === 0 && (
              <Typography variant="body2" sx={{ p: 2 }} color="text.secondary">暂无 Forge 项目。</Typography>
            )}
            {!loadingMeta && forgeProjects.map((p) => {
              const l = links[p.id] || {};
              return (
                <Box key={p.id} sx={{ p: 1.5, borderBottom: "1px solid", borderColor: "divider" }}>
                  <Typography variant="body2" fontWeight={600} noWrap title={p.name}>{p.name}</Typography>
                  <Box sx={{ display: "flex", gap: 1, mt: 1, flexWrap: "wrap" }}>
                    <TextField select size="small" value={l.plm_oid || ""}
                      onChange={(e) => {
                        const hit = plmProjects.find((x) => (x.oid || x.id) === e.target.value);
                        setField(p.id, "plm_oid", e.target.value);
                        setField(p.id, "plm_name", hit ? (hit.name || hit.code) : "");
                      }}
                      sx={{ minWidth: 200, flex: 1 }} SelectProps={{ displayEmpty: true }}>
                      <MenuItem value="">不关联</MenuItem>
                      {plmProjects.map((x) => (
                        <MenuItem key={x.oid || x.id} value={x.oid || x.id}>
                          {x.name || x.code || x.oid}
                        </MenuItem>
                      ))}
                    </TextField>
                    <TextField size="small" label="仓库" placeholder="如 青海" value={l.tree_label || ""}
                      onChange={(e) => setField(p.id, "tree_label", e.target.value)} sx={{ minWidth: 110 }} />
                    <TextField size="small" label="库位号" placeholder="如 4471" value={l.lgort || ""}
                      onChange={(e) => setField(p.id, "lgort", e.target.value)} sx={{ minWidth: 110 }} />
                  </Box>
                </Box>
              );
            })}
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
          如何获取 PLM Cookie
          <Tooltip title="关闭">
            <IconButton onClick={() => setHelpOpen(false)} sx={{ position: "absolute", right: 8, top: 8 }}>✕</IconButton>
          </Tooltip>
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            用途：把这段 Cookie 填进上面的框，让库存管理模块能拉取你账号下的 PLM 研发库房库存。
            <strong>任意浏览器均可</strong>——Cookie 取自你平时登录 PLM 用的那个浏览器。
          </Typography>
          <Typography variant="subtitle2" sx={{ mt: 1 }}>① 打开开发者工具</Typography>
          <Box component="ul" sx={{ mt: 0.5, mb: 1, pl: 3 }}>
            <li><strong>Edge / Chrome</strong>：按 <code>F12</code> 或 <code>Ctrl+Shift+I</code>。</li>
            <li><strong>Firefox</strong>：按 <code>F12</code>。</li>
          </Box>
          <Typography variant="subtitle2">② 复制 Cookie 请求头（推荐）</Typography>
          <Box component="ul" sx={{ mt: 0.5, mb: 1, pl: 3 }}>
            <li>在<strong>已登录 PLM</strong>的页面，切到 <strong>Network</strong> 标签，按 <code>F5</code> 刷新。</li>
            <li>点列表里任意请求 → 右侧 <strong>Headers → 请求标头</strong> 里的 <code>Cookie</code> 一行 → 右键 <strong>复制值</strong>。</li>
            <li>回到 Forge 输入框 <code>Ctrl+V</code> 粘贴 → 保存。</li>
          </Box>
          <Alert severity="warning" sx={{ mt: 1 }}>
            <strong>关键坑</strong>：PLM 登录态 Cookie 通常是 <code>httpOnly</code>，JS 书签读不到，取出来会缺关键字段导致「鉴权失败」。请务必走 DevTools 网络抓取法。
          </Alert>
          <Alert severity="info" sx={{ mt: 1 }}>
            Cookie 会随 PLM 会话过期（退出登录或几天后），届时 Forge 报「鉴权失败」，重新走一遍即可。
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHelpOpen(false)} variant="contained">知道了</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
