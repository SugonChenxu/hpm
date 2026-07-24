import { useState, useEffect, useCallback } from "react";
import {
  Box, Typography, Button, Table, TableHead, TableRow, TableCell, TableBody, TextField, MenuItem, Stack, Alert, Chip, CircularProgress,
} from "@mui/material";
import api from "../api/client";
import PageHeader from "../components/common/PageHeader";
import PLMConnectionCard from "../components/inventory/PLMConnectionCard";

function fmtNum(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("zh-CN");
}
function fmtMoney(n) {
  const v = Number(n) || 0;
  return "¥" + v.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function InventoryPage() {
  const [showSettings, setShowSettings] = useState(false);
  const [forgeProjects, setForgeProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [link, setLink] = useState(null); // { forge_id, plm_oid, plm_name, tree_label, lgort, auto }
  const [treeLabel, setTreeLabel] = useState("");
  const [lgort, setLgort] = useState(""); // 当前过滤/默认库位号
  const [savingLink, setSavingLink] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState({ total_stock: 0, total_value: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // 加载 Forge 项目列表，默认选第一个
  useEffect(() => {
    api.projects.list({}).then((r) => {
      const list = r.data || [];
      setForgeProjects(list);
      if (list.length && !projectId) setProjectId(String(list[0].id));
    }).catch(() => {});
  }, []);

  const loadInventory = useCallback(async (pid, filterLgort) => {
    if (!pid) return;
    setLoading(true); setError(null);
    try {
      const r = await api.plm.inventory(pid, filterLgort || "");
      setRows(r.data.rows || []);
      setStats({ total_stock: r.data.total_stock || 0, total_value: r.data.total_value || 0 });
    } catch (e) {
      setError(e.message || "加载库存失败");
    } finally {
      setLoading(false);
    }
  }, []);

  // 切换项目：加载关联 + 库存
  useEffect(() => {
    if (!projectId) { setLink(null); setRows([]); return; }
    setLink(null);
    api.plm.link(projectId).then((r) => {
      const l = r.data || null;
      setLink(l);
      setTreeLabel(l?.tree_label || "");
      setLgort(l?.lgort || "");
    }).catch(() => setLink(null));
    loadInventory(projectId, "");
  }, [projectId, loadInventory]);

  const handleSaveLink = async () => {
    if (!link || !link.plm_oid) return;
    setSavingLink(true);
    try {
      const arr = [{
        forge_id: link.forge_id,
        forge_name: link.forge_name,
        plm_oid: link.plm_oid,
        plm_name: link.plm_name,
        tree_label: treeLabel,
        lgort: lgort,
      }];
      await api.plm.updateConnection({ project_links: arr });
      setLink({ ...link, tree_label: treeLabel, lgort });
      setError(null);
    } catch (e) {
      setError(e.message || "保存关联失败");
    } finally {
      setSavingLink(false);
    }
  };

  const handleSync = async () => {
    if (!projectId) return;
    setSyncing(true); setError(null);
    try {
      const r = await api.plm.sync({ project_id: projectId, tree_label: treeLabel, lgort });
      await loadInventory(projectId, lgort || "");
      setError(null);
      // 同步成功后回填关联（保证 tree_label/lgort 已保存）
      if (link) {
        await api.plm.updateConnection({
          project_links: [{
            forge_id: link.forge_id, forge_name: link.forge_name,
            plm_oid: link.plm_oid, plm_name: link.plm_name,
            tree_label: treeLabel, lgort,
          }],
        });
      }
      setError(null);
      window.alert(`同步完成，新增/更新 ${r.data.synced_count} 条库存记录`);
    } catch (e) {
      setError(e.message || "同步失败");
    } finally {
      setSyncing(false);
    }
  };

  const applyLgortFilter = () => {
    loadInventory(projectId, lgort || "");
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
        <PageHeader title="库存管理" subtitle="从 PLM 研发库房拉取项目库存（按库位号）" />
        <Button variant="outlined" size="small" onClick={() => setShowSettings((s) => !s)}>
          ⚙ PLM 设置
        </Button>
      </Box>

      {showSettings && (
        <PLMConnectionCard onSaved={() => projectId && api.plm.link(projectId).then((r) => setLink(r.data)).catch(() => {})} onClose={() => setShowSettings(false)} />
      )}

      {/* 项目选择 + 关联 */}
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mb: 2, alignItems: "center", flexWrap: "wrap" }}>
        <TextField select size="small" label="项目" value={projectId}
          onChange={(e) => setProjectId(e.target.value)} sx={{ minWidth: 280 }}>
          {forgeProjects.map((p) => (<MenuItem key={p.id} value={String(p.id)}>{p.name}</MenuItem>))}
        </TextField>
        {link && link.plm_oid && (
          <Chip color="success" size="small" label={`已关联 PLM：${link.plm_name || link.plm_oid}${link.auto ? "（自动）" : ""}`} />
        )}
        {link && !link.plm_oid && (
          <Chip color="warning" size="small" label="未关联 PLM 项目，请到 ⚙ PLM 设置 关联" />
        )}
      </Stack>

      {link && link.plm_oid && (
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mb: 2, alignItems: "center", flexWrap: "wrap" }}>
          <TextField size="small" label="仓库(treeLabel)" placeholder="如 青海" value={treeLabel}
            onChange={(e) => setTreeLabel(e.target.value)} sx={{ minWidth: 160 }} />
          <TextField size="small" label="库位号(LGORT)" placeholder="如 4471" value={lgort}
            onChange={(e) => setLgort(e.target.value)} sx={{ minWidth: 160 }} />
          <Button variant="contained" size="small" onClick={handleSaveLink} disabled={savingLink}>
            {savingLink ? "保存中…" : "保存关联"}
          </Button>
          <Button variant="contained" color="secondary" size="small" onClick={handleSync} disabled={syncing || !treeLabel.trim()}>
            {syncing ? "同步中…" : "同步库存"}
          </Button>
          {!treeLabel.trim() && (
            <Typography variant="caption" color="text.secondary">需先填写仓库才能同步</Typography>
          )}
        </Stack>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* 统计 */}
      <Stack direction="row" spacing={3} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="caption" color="text.secondary">库存总件数</Typography>
          <Typography variant="h6">{fmtNum(stats.total_stock)}</Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">库存总金额</Typography>
          <Typography variant="h6">{fmtMoney(stats.total_value)}</Typography>
        </Box>
      </Stack>

      {/* 库位号过滤 */}
      <Stack direction="row" spacing={1} sx={{ mb: 1, alignItems: "center" }}>
        <TextField size="small" label="按库位号过滤" value={lgort} onChange={(e) => setLgort(e.target.value)} sx={{ minWidth: 160 }} />
        <Button size="small" variant="outlined" onClick={applyLgortFilter}>筛选</Button>
        <Button size="small" variant="text" onClick={() => { setLgort(""); loadInventory(projectId, ""); }}>清除</Button>
      </Stack>

      {loading ? (
        <Box sx={{ textAlign: "center", py: 6 }}><CircularProgress size={28} /></Box>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>物料号</TableCell>
              <TableCell>物料描述</TableCell>
              <TableCell align="right">库存</TableCell>
              <TableCell>工厂</TableCell>
              <TableCell>库位号</TableCell>
              <TableCell>库位描述</TableCell>
              <TableCell align="right">单价</TableCell>
              <TableCell>物料组</TableCell>
              <TableCell align="right">小计</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={9} align="center" sx={{ color: "text.secondary", py: 4 }}>
                暂无库存数据，请先「同步库存」
              </TableCell></TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.matnr}</TableCell>
                <TableCell>{r.maktx}</TableCell>
                <TableCell align="right">{fmtNum(r.labst)}</TableCell>
                <TableCell>{r.werks}</TableCell>
                <TableCell>{r.lgort}</TableCell>
                <TableCell>{r.lgobe}</TableCell>
                <TableCell align="right">{fmtMoney(r.stprs)}</TableCell>
                <TableCell>{r.wgbez}</TableCell>
                <TableCell align="right">{fmtMoney((r.labst || 0) * (r.stprs || 0))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Box>
  );
}
