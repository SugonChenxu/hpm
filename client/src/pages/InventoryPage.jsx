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
// 纯数字物料号：去掉前导10位0填充
function cleanMatnr(s) {
  const t = String(s || "").trim();
  if (/^\d+$/.test(t) && t.length > 1) return t.replace(/^0+/, "");
  return t;
}

export default function InventoryPage() {
  const [showSettings, setShowSettings] = useState(false);
  const [forgeProjects, setForgeProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [link, setLink] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");

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
      setLink(r.data || null);
    }).catch(() => setLink(null));
    loadInventory(projectId);
  }, [projectId, loadInventory]);

  const handleSync = async () => {
    if (!projectId) return;
    setSyncing(true); setError(null);
    try {
      await api.plm.sync({ project_id: projectId });
      await loadInventory(projectId);
    } catch (e) {
      setError(e.message || "同步失败");
    } finally {
      setSyncing(false);
    }
  };

  // 搜索 + 排序
  const filtered = useMemo(() => {
    let list = rows;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        ["matnr", "maktx", "wgbez", "matkl"].some((k) => (String(r[k] || "")).toLowerCase().includes(q))
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
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
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

      {/* 项目选择 + 关联 + 同步 */}
      <Stack direction="row" spacing={1.5} sx={{ mb: 2, alignItems: "center", flexWrap: "wrap" }}>
        <TextField select size="small" label="项目" value={projectId}
          onChange={(e) => setProjectId(e.target.value)} sx={{ minWidth: 300 }}>
          {forgeProjects.map((p) => (<MenuItem key={p.id} value={String(p.id)}>{p.name}</MenuItem>))}
        </TextField>
        {link && link.plm_oid && (
          <Chip color="success" size="small"
            label={`${link.plm_code ? `[${link.plm_code}] ` : ""}${link.plm_name || link.plm_oid}`} />
        )}
        {link && !link.plm_oid && (
          <Chip color="warning" size="small" label="未关联，请到 ⚙ PLM 设置 关联项目" />
        )}
        {link && link.plm_oid && (
          <Button variant="contained" color="secondary" size="small" onClick={handleSync} disabled={syncing}>
            {syncing ? "同步中…" : "同步库存"}
          </Button>
        )}
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <TextField size="small" placeholder="搜索物料号/描述/物料组..." value={search}
        onChange={(e) => setSearch(e.target.value)} sx={{ mb: 1.5, minWidth: 300 }} />

      {loading ? (
        <Box sx={{ textAlign: "center", py: 6 }}><CircularProgress size={28} /></Box>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 50, fontWeight: 600 }}>序号</TableCell>
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
                {rows.length === 0 ? "暂无库存数据，请先关联项目并点「同步库存」" : "无匹配结果"}
              </TableCell></TableRow>
            )}
            {filtered.map((r, i) => (
              <TableRow key={r.id} hover>
                <TableCell>{i + 1}</TableCell>
                <TableCell>{cleanMatnr(r.matnr)}</TableCell>
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
