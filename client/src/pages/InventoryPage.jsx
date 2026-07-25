import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Box, Typography, Button, Table, TableHead, TableRow, TableCell,
  TableBody, TableSortLabel, TextField, MenuItem, Stack, Alert, Chip, CircularProgress,
} from "@mui/material";
import api from "../api/client";
import PageHeader from "../components/common/PageHeader";
import PLMConnectionCard from "../components/inventory/PLMConnectionCard";

const SORTABLE_COLS = [
  { key: "matnr", label: "物料号", width: 160 },
  { key: "wgbez", label: "物料组", width: 120 },
  { key: "maktx", label: "物料描述", width: 280 },
  { key: "labst", label: "库存数量", width: 100, align: "right" },
  { key: "stprs", label: "参考单价", width: 120, align: "right" },
];

function fmtNum(n) {
  return Number(n || 0).toLocaleString("zh-CN");
}
function fmtMoney(n) {
  return "¥" + Number(n || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function InventoryPage() {
  const [showSettings, setShowSettings] = useState(false);
  const [forgeProjects, setForgeProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [link, setLink] = useState(null);
  const [treeLabel, setTreeLabel] = useState("");
  const [savingLink, setSavingLink] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // 搜索 + 排序
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");

  // 加载 Forge 项目列表
  useEffect(() => {
    api.projects.list({}).then((r) => {
      const list = r.data || [];
      setForgeProjects(list);
      if (list.length && !projectId) setProjectId(String(list[0].id));
    }).catch(() => {});
  }, []);

  const loadInventory = useCallback(async (pid) => {
    if (!pid) return;
    setLoading(true); setError(null);
    try {
      const r = await api.plm.inventory(pid, "");
      setRows(r.data.rows || []);
    } catch (e) {
      setError(e.message || "加载库存失败");
    } finally {
      setLoading(false);
    }
  }, []);

  // 切换项目
  useEffect(() => {
    if (!projectId) { setLink(null); setRows([]); return; }
    setLink(null);
    api.plm.link(projectId).then((r) => {
      const l = r.data || null;
      setLink(l);
      setTreeLabel(l?.tree_label || "");
    }).catch(() => setLink(null));
    loadInventory(projectId);
  }, [projectId, loadInventory]);

  const handleSaveLink = async () => {
    if (!link || !link.plm_oid) return;
    setSavingLink(true);
    try {
      const arr = [{
        forge_id: link.forge_id, forge_name: link.forge_name,
        plm_oid: link.plm_oid, plm_code: link.plm_code || "", plm_name: link.plm_name || "",
        tree_label: treeLabel, lgort: link.lgort || "",
      }];
      await api.plm.updateConnection({ project_links: arr });
      setLink({ ...link, tree_label: treeLabel });
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
      await api.plm.sync({ project_id: projectId, tree_label: treeLabel });
      await loadInventory(projectId);
      if (link) {
        await api.plm.updateConnection({
          project_links: [{
            forge_id: link.forge_id, forge_name: link.forge_name,
            plm_oid: link.plm_oid, plm_code: link.plm_code || "", plm_name: link.plm_name || "",
            tree_label: treeLabel, lgort: link.lgort || "",
          }],
        });
      }
      window.alert("同步完成");
    } catch (e) {
      setError(e.message || "同步失败");
    } finally {
      setSyncing(false);
    }
  };

  // 搜索过滤 + 排序
  const filtered = useMemo(() => {
    let list = rows;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        ["matnr", "maktx", "wgbez", "matkl"].some((k) => (r[k] || "").toLowerCase().includes(q))
      );
    }
    if (sortKey) {
      list = [...list].sort((a, b) => {
        const va = a[sortKey];
        const vb = b[sortKey];
        const na = typeof va === "number" ? va : (va == null ? "" : String(va));
        const nb = typeof vb === "number" ? vb : (vb == null ? "" : String(vb));
        if (na < nb) return sortDir === "asc" ? -1 : 1;
        if (na > nb) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
    }
    return list;
  }, [rows, search, sortKey, sortDir]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
        <PageHeader title="库存管理" subtitle="从 PLM 研发库房拉取项目库存" />
        <Button variant="outlined" size="small" onClick={() => setShowSettings((s) => !s)}>
          ⚙ PLM 设置
        </Button>
      </Box>

      {showSettings && (
        <PLMConnectionCard
          onSaved={() => projectId && api.plm.link(projectId).then((r) => setLink(r.data)).catch(() => {})}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* 项目选择 + 关联 */}
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mb: 2, alignItems: "center", flexWrap: "wrap" }}>
        <TextField select size="small" label="项目" value={projectId}
          onChange={(e) => setProjectId(e.target.value)} sx={{ minWidth: 300 }}>
          {forgeProjects.map((p) => (<MenuItem key={p.id} value={String(p.id)}>{p.name}</MenuItem>))}
        </TextField>
        {link && link.plm_oid && (
          <Chip
            color="success" size="small"
            label={`已关联 ${link.plm_code ? `[${link.plm_code}] ` : ""}${link.plm_name || link.plm_oid}${link.auto ? "（自动）" : ""}`}
          />
        )}
        {link && !link.plm_oid && (
          <Chip color="warning" size="small" label="未关联 PLM 项目" />
        )}
      </Stack>

      {link && link.plm_oid && (
        <Stack direction="row" spacing={2} sx={{ mb: 2, alignItems: "center", flexWrap: "wrap" }}>
          <TextField size="small" label="仓库(treeLabel)" placeholder="如 青海" value={treeLabel}
            onChange={(e) => setTreeLabel(e.target.value)} sx={{ minWidth: 160 }} />
          <Button variant="contained" size="small" onClick={handleSaveLink} disabled={savingLink}>
            {savingLink ? "保存中…" : "保存关联"}
          </Button>
          <Button variant="contained" color="secondary" size="small" onClick={handleSync}
            disabled={syncing || !treeLabel.trim()}>
            {syncing ? "同步中…" : "同步库存"}
          </Button>
        </Stack>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* 搜索 */}
      <TextField size="small" placeholder="搜索物料号/描述/物料组..." value={search}
        onChange={(e) => setSearch(e.target.value)} sx={{ mb: 1.5, minWidth: 300 }}
        InputProps={{ endAdornment: search ? <Button size="small" onClick={() => setSearch("")}>清除</Button> : null }} />

      {loading ? (
        <Box sx={{ textAlign: "center", py: 6 }}><CircularProgress size={28} /></Box>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 50 }}>#</TableCell>
              {SORTABLE_COLS.map((col) => (
                <TableCell key={col.key} align={col.align || "left"} sx={{ width: col.width, fontWeight: 600, cursor: "pointer" }}
                  onClick={() => handleSort(col.key)}>
                  <TableSortLabel active={sortKey === col.key} direction={sortKey === col.key ? sortDir : "asc"}>
                    {col.label}
                  </TableSortLabel>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={7} align="center" sx={{ color: "text.secondary", py: 4 }}>
                {rows.length === 0 ? "暂无库存数据，请先「同步库存」" : "无匹配结果"}
              </TableCell></TableRow>
            )}
            {filtered.map((r, i) => (
              <TableRow key={r.id}>
                <TableCell>{i + 1}</TableCell>
                <TableCell>{r.matnr}</TableCell>
                <TableCell>{r.wgbez}</TableCell>
                <TableCell sx={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.maktx}
                </TableCell>
                <TableCell align="right">{fmtNum(r.labst)}</TableCell>
                <TableCell align="right">{fmtMoney(r.stprs)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Box>
  );
}
