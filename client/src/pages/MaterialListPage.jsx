import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import dayjs from "dayjs";
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Chip, TextField, Button, IconButton,
  Menu, MenuItem, Checkbox, Tooltip, Alert, Snackbar,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
} from "@mui/material";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import "dayjs/locale/zh-cn";

import api from "../api/client";
import ProjectSelector from "../components/common/ProjectSelector";
import PageHeader from "../components/common/PageHeader";
import PageLoading from "../components/common/PageLoading";
import MaterialImportDialog from "../components/material/MaterialImportDialog";
import { MATERIAL_STATUSES, statusStyle } from "../utils/materialStatus";
import { exportMaterialsExcel } from "../utils/materialExcel";

// ===== 常量 =====
const COLUMNS = [
  { key: "part_number",       label: "物料号",   type: "text",   width: 150 },
  { key: "manufacturer",      label: "厂家",     type: "text",   width: 120 },
  { key: "model",             label: "物料型号", type: "text",   width: 170 },
  { key: "material_status",   label: "物料状态", type: "status", width: 110 },
  { key: "quantity",          label: "数量",     type: "number", width: 90 },
  { key: "purchase_date",     label: "采购时间", type: "date",   width: 120 },
  { key: "lead_time",         label: "采购周期", type: "number", width: 90 },
  { key: "expected_delivery", label: "预计交期", type: "date",   width: 120 },
  { key: "notes",             label: "备注",     type: "text",   width: 220 },
];
const COL_WIDTH_KEY = "forge.material.colwidths.v1";
const UNDO_WINDOW = 5 * 60 * 1000;

// ===== Unicode 箭头 =====
function SortArrow({ dir }) {
  return (
    <Box sx={{ display: "inline-flex", flexDirection: "column", ml: 0.5, lineHeight: 0 }}>
      <Box component="span" sx={{ fontSize: 11, color: dir === "asc" ? "#1976d2" : "#ccc", lineHeight: 1 }}>▲</Box>
      <Box component="span" sx={{ fontSize: 11, color: dir === "desc" ? "#1976d2" : "#ccc", lineHeight: 1 }}>▼</Box>
    </Box>
  );
}

// ===== 状态彩色标签 =====
function StatusChip({ status, onClick }) {
  const st = statusStyle(status);
  return (
    <Chip
      label={<Box component="span" sx={{ color: st.color }}>{status}<Box component="span" sx={{ fontSize: 10, ml: 0.3, opacity: 0.7 }}>▾</Box></Box>}
      size="small"
      onClick={onClick}
      sx={{ bgcolor: st.bg, fontWeight: 600, cursor: "pointer", maxWidth: 90, border: "1px solid", borderColor: st.border, "& .MuiChip-label": { px: 1 } }}
    />
  );
}

// ===== 内联编辑控件 =====
function EditControl({ type, value, onSave, onCancel, onTab }) {
  const [val, setVal] = useState(value ?? "");
  useEffect(() => { setVal(value ?? ""); }, [value]);
  const save = () => {
    if (type === "number") {
      const n = Number(val);
      if (isNaN(n)) return;
      onSave(n);
    } else { onSave(val); }
  };
  const handleKey = (e) => {
    if (e.key === "Enter") { e.preventDefault(); save(); }
    else if (e.key === "Escape") { e.preventDefault(); onCancel(); }
    else if (e.key === "Tab") { e.preventDefault(); save(); onTab(e.shiftKey ? -1 : 1); }
  };
  if (type === "date") {
    return (
      <DatePicker
        value={val ? dayjs(val) : null}
        onChange={(d) => onSave(d ? d.format("YYYY-MM-DD") : "")}
        format="YYYY-MM-DD"
        autoFocus closeOnSelect
        slotProps={{ textField: { size: "small", fullWidth: true, onKeyDown: handleKey } }}
      />
    );
  }
  return (
    <TextField
      size="small" autoFocus fullWidth
      type={type === "number" ? "number" : "text"}
      value={val} onChange={(e) => setVal(e.target.value)}
      onBlur={save} onKeyDown={handleKey}
      inputProps={type === "number" ? { min: 0, style: { textAlign: "right" } } : undefined}
      sx={{ "& .MuiInputBase-input": { fontSize: "0.88rem", py: 0.5 } }}
    />
  );
}

// ===== 主组件 =====
export default function MaterialListPage() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("projectId") || null;

  // 数据
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState(null); // undo 快照
  const [undoTime, setUndoTime] = useState(null);

  // UI 状态
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [editing, setEditing] = useState(null); // { rowId, field }
  const [statusMenu, setStatusMenu] = useState(null); // { rowId, anchorEl }
  const [ctxMenu, setCtxMenu] = useState(null); // { mouseX, mouseY, rowId }
  const [batchEditDlg, setBatchEditDlg] = useState(null);
  const [rowColors, setRowColors] = useState(() => {
    try { return JSON.parse(localStorage.getItem("forge.material.rowcolors") || "{}"); }
    catch { return {}; }
  }); // { field, label, type, ids }
  const [importOpen, setImportOpen] = useState(false);
  const [snack, setSnack] = useState(null);
  const [confirmDlg, setConfirmDlg] = useState(null);
  const [colWidths, setColWidths] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(COL_WIDTH_KEY) || "{}");
      return COLUMNS.map((c) => ({ key: c.key, width: saved[c.key] || c.width }));
    } catch { return COLUMNS.map((c) => ({ key: c.key, width: c.width })); }
  });

  // 列宽拖拽
  const resizing = useRef(null);
  const colWidthsRef = useRef(colWidths);
  colWidthsRef.current = colWidths;
  const onResizeStart = useCallback((e, key) => {
    e.preventDefault(); e.stopPropagation();
    const col = colWidthsRef.current.find((c) => c.key === key);
    const startX = e.clientX, startW = col.width;
    const move = (ev) => {
      setColWidths((prev) => prev.map((c) => c.key === key ? { ...c, width: Math.max(60, startW + ev.clientX - startX) } : c));
    };
    const up = () => {
      setColWidths((prev) => { colWidthsRef.current = prev; return prev; });
      const save = {}; colWidthsRef.current.forEach((c) => save[c.key] = c.width);
      localStorage.setItem(COL_WIDTH_KEY, JSON.stringify(save));
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }, []);

  // 排序
  const handleSort = (key) => {
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else { setSortKey(null); setSortDir("asc"); }
    } else { setSortKey(key); setSortDir("asc"); }
  };

  // ===== 数据加载 =====
  const load = useCallback(async () => {
    if (!projectId) { setRows([]); setLoading(false); return; }
    setLoading(true);
    try {
      const [res, snap] = await Promise.all([
        api.materials.list({ project_id: Number(projectId) }),
        api.materials.importSnapshot(Number(projectId)),
      ]);
      setRows(res.data || []);
      if (snap.data && snap.data.ids_json && snap.data.created_at) {
        setSnapshot(snap.data);
        const elapsed = Date.now() - new Date(snap.data.created_at + "+08:00").getTime();
        if (elapsed < UNDO_WINDOW) setUndoTime(elapsed);
        else setUndoTime(null);
      }
    } catch { setSnack({ severity: "error", text: "加载物料数据失败" }); }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  // undo 倒计时
  useEffect(() => {
    if (undoTime == null || undoTime >= UNDO_WINDOW) { setUndoTime(null); return; }
    const t = setInterval(() => {
      setUndoTime((prev) => {
        if (prev == null || prev >= UNDO_WINDOW) { clearInterval(t); return null; }
        return prev + 1000;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [undoTime != null]);

  // ===== 编辑保存 =====
  const handleSave = async (rowId, field, value) => {
    setEditing(null);
    const row = rows.find((r) => r.id === rowId);
    if (!row || String(row[field]) === String(value ?? "")) return;
    try {
      const updates = { [field]: value };

      // 预计交期自动计算：采购时间 + 采购周期 → 预计交期
      if (field === "purchase_date" || field === "lead_time") {
        const pd = field === "purchase_date" ? value : row.purchase_date;
        const lt = field === "lead_time" ? value : row.lead_time;
        if (pd && lt && lt > 0) {
          updates.expected_delivery = dayjs(pd).add(lt, "day").format("YYYY-MM-DD");
        }
      }

      await api.materials.update(rowId, updates);
      setRows((prev) => prev.map((r) => r.id === rowId ? { ...r, ...updates } : r));
    } catch { setSnack({ severity: "error", text: "保存失败" }); load(); }
  };

  // ===== 状态切换 =====
  const handleStatusChange = async (rowId, status) => {
    setStatusMenu(null);
    try {
      await api.materials.update(rowId, { material_status: status });
      setRows((prev) => prev.map((r) => r.id === rowId ? { ...r, material_status: status } : r));
    } catch { setSnack({ severity: "error", text: "状态更新失败" }); }
  };

  // ===== 添加一行 =====
  const handleAdd = async () => {
    if (!projectId) return;
    try {
      const res = await api.materials.create({ project_id: Number(projectId), material_status: "默认" });
      load(); // 重新加载获取完整 seq
    } catch { setSnack({ severity: "error", text: "添加失败" }); }
  };

  // ===== 删除 =====
  const handleDelete = (rowId) => {
    setConfirmDlg({
      title: "确认删除", text: "确定要删除该物料吗？此操作不可撤销。",
      onOk: async () => {
        setConfirmDlg(null);
        try { await api.materials.remove(rowId); load(); }
        catch { setSnack({ severity: "error", text: "删除失败" }); }
      },
    });
  };

  // ===== 批量操作 =====
  const handleBatchStatus = async (status) => {
    setConfirmDlg({
      title: "批量修改状态",
      text: `确定将选中的 ${selected.size} 项物料状态改为「${status}」吗？`,
      onOk: async () => {
        setConfirmDlg(null);
        try { await api.materials.batchUpdateStatus({ ids: [...selected], material_status: status }); setSelected(new Set()); load(); }
        catch { setSnack({ severity: "error", text: "批量修改失败" }); }
      },
    });
  };
  const handleBatchDelete = () => {
    setConfirmDlg({
      title: "批量删除", text: `确定删除选中的 ${selected.size} 项物料吗？此操作不可撤销。`,
      onOk: async () => {
        setConfirmDlg(null);
        try { await api.materials.batchRemove({ project_id: Number(projectId), ids: [...selected] }); setSelected(new Set()); load(); }
        catch { setSnack({ severity: "error", text: "批量删除失败" }); }
      },
    });
  };

  // ===== 右键菜单 =====
  const handleCtxMenu = (e, rowId) => {
    e.preventDefault();
    if (!selected.has(rowId)) setSelected(new Set([rowId]));
    setCtxMenu({ mouseX: e.clientX - 2, mouseY: e.clientY - 4, rowId });
  };

  const CTX_FIELDS = [
    { key: "manufacturer", label: "厂家", type: "text" },
    { key: "material_status", label: "物料状态", type: "status" },
    { key: "quantity", label: "数量", type: "number" },
    { key: "purchase_date", label: "采购时间", type: "date" },
    { key: "lead_time", label: "采购周期", type: "number" },
    { key: "expected_delivery", label: "预计交期", type: "date" },
    { key: "notes", label: "备注", type: "text" },
  ];

  // 预设行底色
  const ROW_COLORS = [
    { label: "默认(无)", value: null },
    { label: "浅蓝", value: "#e6f7ff" },
    { label: "浅绿", value: "#f6ffed" },
    { label: "浅黄", value: "#fffbe6" },
    { label: "浅红", value: "#fff1f0" },
    { label: "浅紫", value: "#f9f0ff" },
    { label: "浅灰", value: "#f5f5f5" },
  ];

  const handleCtxAction = (field, label, type) => {
    setCtxMenu(null);
    const ids = selected.size > 0 ? [...selected] : [ctxMenu.rowId];
    setBatchEditDlg({ field, label, type, ids, value: "" });
  };

  // 行底色操作
  const handleCtxColor = (color) => {
    setCtxMenu(null);
    const ids = selected.size > 0 ? [...selected] : [ctxMenu.rowId];
    setRowColors((prev) => {
      const next = { ...prev };
      ids.forEach((id) => {
        if (color) next[id] = color; else delete next[id];
      });
      localStorage.setItem("forge.material.rowcolors", JSON.stringify(next));
      return next;
    });
    setSnack({ severity: "success", text: `已更新 ${ids.length} 行的底色` });
  };

  // 右键删除
  const handleCtxDelete = () => {
    setCtxMenu(null);
    const ids = selected.size > 0 ? [...selected] : [ctxMenu.rowId];
    setConfirmDlg({
      title: "确认删除", text: `确定删除选中的 ${ids.length} 项物料吗？此操作不可撤销。`,
      onOk: async () => {
        setConfirmDlg(null);
        try { await api.materials.batchRemove({ project_id: Number(projectId), ids }); setSelected(new Set()); load(); }
        catch { setSnack({ severity: "error", text: "批量删除失败" }); }
      },
    });
  };

  const submitBatchEdit = async (statusOrValue) => {
    if (!batchEditDlg) return;
    const { field, ids } = batchEditDlg;
    // 防御：onClick 传 event 对象 → 忽略，读 batchEditDlg.value
    // 显式传 string：Enter 传 e.target.value，状态按钮传 s
    const value = (typeof statusOrValue === "string")
      ? (field === "material_status" ? statusOrValue : statusOrValue)  // 状态 或 Enter 显式值
      : batchEditDlg.value;  // onClick 无参 → 读 state
    if (!value && value !== 0) return;
    try {
      for (const id of ids) {
        const row = rows.find((r) => r.id === id);
        if (!row) continue;
        const val = (field === "quantity" || field === "lead_time") ? Number(value) : value;
        const updates = { [field]: val };
        if (field === "purchase_date" || field === "lead_time") {
          const pd = field === "purchase_date" ? value : row.purchase_date;
          const lt = field === "lead_time" ? Number(value) : row.lead_time;
          if (pd && lt && lt > 0) {
            updates.expected_delivery = dayjs(pd).add(lt, "day").format("YYYY-MM-DD");
          }
        }
        await api.materials.update(id, updates);
      }
      setBatchEditDlg(null);
      setSnack({ severity: "success", text: `已更新 ${ids.length} 项物料的「${batchEditDlg.label}」` });
      load();
    } catch { setSnack({ severity: "error", text: "批量编辑失败" }); }
  };

  // ===== 导入/导出/撤销 =====
  const handleImportDone = () => { setImportOpen(false); load(); };
  const handleExport = () => {
    const exportRows = selected.size > 0 ? rows.filter((r) => selected.has(r.id)) : rows;
    exportMaterialsExcel(exportRows);
  };
  const handleUndo = async () => {
    try { await api.materials.importUndo(Number(projectId)); setUndoTime(null); load(); }
    catch { setSnack({ severity: "error", text: "撤销导入失败" }); }
  };

  // ===== 全选 =====
  const allIds = rows.map((r) => r.id);
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(allIds));
  };
  const toggleRow = (id) => {
    setSelected((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  };

  // ===== 排序 + 搜索 =====
  const filtered = useMemo(() => {
    let list = [...rows];
    if (search.trim()) {
      const kw = search.trim().toLowerCase();
      list = list.filter((r) =>
        ["part_number", "manufacturer", "model", "material_status", "notes"].some((k) =>
          String(r[k] ?? "").toLowerCase().includes(kw)
        )
      );
    }
    if (sortKey) {
      list.sort((a, b) => {
        const va = String(a[sortKey === "seq" ? "seq" : sortKey] ?? "");
        const vb = String(b[sortKey === "seq" ? "seq" : sortKey] ?? "");
        const cmp = va.localeCompare(vb, "zh-CN", { numeric: true });
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return list;
  }, [rows, sortKey, sortDir, search]);

  // ===== 搜索框 =====
  const searchInput = (
    <TextField
      size="small" placeholder="搜索物料号/厂家/型号/状态/备注..."
      value={search} onChange={(e) => setSearch(e.target.value)}
      sx={{ width: 320 }}
      InputProps={{ startAdornment: <Box component="span" sx={{ mr: 0.5, color: "#999" }}>🔍</Box> }}
    />
  );

  // ===== 渲染 =====
  if (loading) return <PageLoading />;

  if (!projectId) {
    return (
      <Box sx={{ p: 2 }}>
        <Box sx={{ mb: 2 }}><ProjectSelector /></Box>
        <PageHeader title="物料管理" subtitle="BOM 与备料跟踪" />
        <Paper sx={{ textAlign: "center", py: 6 }}>
          <Typography color="text.secondary">请先在右上角选择项目，再管理物料清单</Typography>
        </Paper>
      </Box>
    );
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="zh-cn">
      <Box sx={{ p: 2 }}>
        <Box sx={{ mb: 2 }}><ProjectSelector /></Box>
        <PageHeader title="物料管理" subtitle="BOM 与备料跟踪" />

        {/* ---- 工具栏 ---- */}
        <Box sx={{ display: "flex", gap: 1, mb: 1.5, flexWrap: "wrap", alignItems: "center" }}>
          <Button variant="outlined" component="label" sx={{ gap: 0.5 }}>
            📥 导入 Excel
            <input type="file" hidden accept=".xlsx,.xls" onChange={(e) => { if (e.target.files?.[0]) setImportOpen(e.target.files[0]); e.target.value = ""; }} />
          </Button>
          <Button variant="outlined" onClick={handleAdd} sx={{ gap: 0.5 }}>＋ 添加一行</Button>
          <Button variant="outlined" onClick={handleExport} sx={{ gap: 0.5 }}>
            ↓ 导出{selected.size > 0 ? `(${selected.size})` : ""}
          </Button>
          {undoTime != null && (
            <Button variant="outlined" color="warning" onClick={handleUndo} sx={{ gap: 0.5 }}>
              ↩ 撤销导入({Math.max(0, Math.ceil((UNDO_WINDOW - undoTime) / 60000))}分钟)
            </Button>
          )}
          <Box sx={{ flex: 1 }} />
          {searchInput}
        </Box>

        {/* ---- 批量操作栏 ---- */}
        {selected.size > 0 && (
          <Alert severity="info" sx={{ mb: 1, py: 0 }}
            action={
              <Box sx={{ display: "flex", gap: 0.5 }}>
                {MATERIAL_STATUSES.map((s) => (
                  <Button key={s} size="small" variant="outlined" onClick={() => handleBatchStatus(s)}
                    sx={{ fontSize: "0.75rem", py: 0, color: statusStyle(s).color, borderColor: statusStyle(s).bg }}>
                    {s}
                  </Button>
                ))}
                <Button size="small" color="error" variant="outlined" onClick={handleBatchDelete} sx={{ fontSize: "0.75rem", py: 0 }}>
                  ✕ 删除({selected.size})
                </Button>
                <Button size="small" onClick={() => setSelected(new Set())} sx={{ fontSize: "0.75rem", py: 0 }}>
                  清除选择
                </Button>
              </Box>
            }
          >
            已选 {selected.size} 项
          </Alert>
        )}

        {/* ---- 表格 ---- */}
        <TableContainer component={Paper} variant="outlined">
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 42, fontWeight: 700, bgcolor: "grey.50", p: 0.5, whiteSpace: "nowrap" }}>
                  <Checkbox size="small" checked={allSelected} indeterminate={selected.size > 0 && !allSelected} onChange={toggleAll} />
                </TableCell>
                <TableCell sx={{ width: 60, fontWeight: 700, bgcolor: "grey.50", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap", fontSize: "0.8rem", px: 1 }}
                  onClick={() => handleSort("seq")}>
                  <Box sx={{ display: "flex", alignItems: "center" }}>
                    序号<SortArrow dir={sortKey === "seq" ? sortDir : null} />
                  </Box>
                </TableCell>
                {COLUMNS.map((col) => {
                  const width = colWidths.find((c) => c.key === col.key)?.width || col.width;
                  return (
                    <TableCell key={col.key}
                      sx={{
                        width, fontWeight: 700, bgcolor: "grey.50", cursor: "pointer",
                        userSelect: "none", position: "relative", overflow: "visible",
                        fontSize: "0.8rem", whiteSpace: "nowrap", px: 1,
                      }}
                      onClick={() => col.key !== "material_status" && handleSort(col.key)}
                    >
                      <Box sx={{ display: "flex", alignItems: "center" }}>
                        {col.label}
                        {col.key !== "material_status" && <SortArrow dir={sortKey === col.key ? sortDir : null} />}
                      </Box>
                      <Box
                        sx={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 4, cursor: "col-resize", "&:hover": { bgcolor: "primary.light" } }}
                        onMouseDown={(e) => onResizeStart(e, col.key)}
                      />
                    </TableCell>
                  );
                })}
              </TableRow>
            </TableHead>

            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={COLUMNS.length + 2} sx={{ textAlign: "center", py: 8 }}>
                    <Typography color="text.secondary">
                      {search ? "无匹配结果" : "暂无数据，请通过「导入 Excel」或「添加一行」录入物料"}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row, idx) => (
                  <TableRow key={row.id} hover sx={{ bgcolor: rowColors[row.id] || (selected.has(row.id) ? "action.selected" : "inherit") }}
                    onContextMenu={(e) => handleCtxMenu(e, row.id)}>
                    <TableCell sx={{ p: 0.5 }}>
                      <Checkbox size="small" checked={selected.has(row.id)} onChange={() => toggleRow(row.id)} />
                    </TableCell>

                    {/* 序号 */}
                    <TableCell sx={{ color: "text.secondary", fontSize: "0.82rem" }}>{idx + 1}</TableCell>

                    {/* 业务列 */}
                    {COLUMNS.map((col) => {
                      const isEditing = editing?.rowId === row.id && editing?.field === col.key;
                      if (isEditing) {
                        return (
                          <TableCell key={col.key} sx={{ p: 0.5 }}>
                            <EditControl
                              type={col.type} value={row[col.key]}
                              onSave={(v) => handleSave(row.id, col.key, v)}
                              onCancel={() => setEditing(null)}
                              onTab={(dir) => {
                                const ci = COLUMNS.indexOf(col);
                                const next = ci + dir;
                                if (next >= 0 && next < COLUMNS.length) setEditing({ rowId: row.id, field: COLUMNS[next].key });
                                else setEditing(null);
                              }}
                            />
                          </TableCell>
                        );
                      }

                      // 状态列
                      if (col.key === "material_status") {
                        return (
                          <TableCell key={col.key} sx={{ p: 0.5 }}>
                            <StatusChip
                              status={row.material_status || "默认"}
                              onClick={(e) => setStatusMenu({ rowId: row.id, anchorEl: e.currentTarget })}
                            />
                          </TableCell>
                        );
                      }

                      // 普通单元格
                      const raw = row[col.key];
                      const display = col.type === "date"
                        ? (raw ? dayjs(raw).format("YYYY/M/D") : "-")
                        : (raw ?? "-");
                      return (
                        <TableCell key={col.key}
                          onClick={() => setEditing({ rowId: row.id, field: col.key })}
                          sx={{ p: 0.5, cursor: "pointer", fontSize: "0.88rem", "&:hover": { bgcolor: "action.hover" } }}
                        >
                          <Box component="span" sx={{ color: display === "-" ? "text.disabled" : "text.primary" }}>
                            {display}
                          </Box>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* ---- 状态菜单 ---- */}
        <Menu
          anchorEl={statusMenu?.anchorEl} open={!!statusMenu}
          onClose={() => setStatusMenu(null)}
        >
          {MATERIAL_STATUSES.map((s) => {
            const st = statusStyle(s);
            return (
              <MenuItem key={s} onClick={() => handleStatusChange(statusMenu.rowId, s)}
                sx={{ gap: 1, color: "#222" }}>
                <Box sx={{ width: 14, height: 14, borderRadius: 3, bgcolor: st.bg, border: "1px solid rgba(0,0,0,0.15)" }} />
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{s}</Typography>
              </MenuItem>
            );
          })}
        </Menu>

        {/* ---- 导入弹窗 ---- */}
        {importOpen && (
          <MaterialImportDialog
            open={!!importOpen}
            file={importOpen}
            projectId={Number(projectId)}
            onClose={() => setImportOpen(false)}
            onConfirmed={handleImportDone}
          />
        )}

        {/* ---- 确认弹窗 ---- */}
        {confirmDlg && (
          <Dialog open onClose={() => setConfirmDlg(null)}>
            <DialogTitle>{confirmDlg.title}</DialogTitle>
            <DialogContent><DialogContentText>{confirmDlg.text}</DialogContentText></DialogContent>
            <DialogActions>
              <Button onClick={() => setConfirmDlg(null)}>取消</Button>
              <Button onClick={confirmDlg.onOk} color="error" variant="contained">确认</Button>
            </DialogActions>
          </Dialog>
        )}

        {/* ---- 右键菜单 ---- */}
        <Menu
          open={ctxMenu !== null}
          onClose={() => setCtxMenu(null)}
          anchorReference="anchorPosition"
          anchorPosition={ctxMenu ? { top: ctxMenu.mouseY, left: ctxMenu.mouseX } : undefined}
        >
          <MenuItem disabled sx={{ opacity: "0.7 !important" }}>
            <Typography variant="caption">
              {selected.size > 1 ? `已选 ${selected.size} 项` : "右键操作"}
            </Typography>
          </MenuItem>
          <MenuItem onClick={() => handleCtxAction("manufacturer", "厂家", "text")} sx={{ color: "#222" }}>修改厂家</MenuItem>
          <MenuItem onClick={() => handleCtxAction("material_status", "物料状态", "status")} sx={{ color: "#222" }}>修改状态</MenuItem>
          <MenuItem onClick={() => handleCtxAction("quantity", "数量", "number")} sx={{ color: "#222" }}>修改数量</MenuItem>
          <MenuItem onClick={() => handleCtxAction("purchase_date", "采购时间", "date")} sx={{ color: "#222" }}>采购时间</MenuItem>
          <MenuItem onClick={() => handleCtxAction("lead_time", "采购周期", "number")} sx={{ color: "#222" }}>采购周期</MenuItem>
          <MenuItem onClick={() => handleCtxAction("expected_delivery", "预计交期", "date")} sx={{ color: "#222" }}>预计交期</MenuItem>
          <MenuItem onClick={() => handleCtxAction("notes", "备注", "text")} sx={{ color: "#222" }}>修改备注</MenuItem>
          <Box sx={{ borderTop: "1px solid", borderColor: "divider", my: 0.5 }} />
          {/* 底色子菜单 */}
          <MenuItem sx={{ color: "#222", justifyContent: "space-between" }}>
            表格底色
            <Box component="span" sx={{ display: "flex", gap: 0.3, ml: 1 }}>
              {ROW_COLORS.filter(c => c.value).map((c) => (
                <Box key={c.value} component="span"
                  onClick={(e) => { e.stopPropagation(); handleCtxColor(c.value); }}
                  sx={{ width: 16, height: 16, bgcolor: c.value, borderRadius: 2, cursor: "pointer", border: "1px solid #ddd", "&:hover": { outline: "2px solid #1976d2" } }}
                />
              ))}
            </Box>
          </MenuItem>
          <MenuItem onClick={() => handleCtxColor(null)} sx={{ color: "#222", pl: 4 }}>清除底色</MenuItem>
          <Box sx={{ borderTop: "1px solid", borderColor: "divider", my: 0.5 }} />
          <MenuItem onClick={handleCtxDelete} sx={{ color: "#d32f2f" }}>
            ✕ 删除{selected.size > 1 ? `(${selected.size})` : ""}
          </MenuItem>
        </Menu>

        {/* ---- 批量编辑对话框 ---- */}
        {batchEditDlg && (
          <Dialog open onClose={() => setBatchEditDlg(null)} maxWidth="xs" fullWidth>
            <DialogTitle>
              修改{batchEditDlg.ids.length}项物料的「{batchEditDlg.label}」
            </DialogTitle>
            <DialogContent sx={{ pt: 2 }}>
              {batchEditDlg.field === "material_status" ? (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {MATERIAL_STATUSES.map((s) => {
                    const st = statusStyle(s);
                    return (
                      <Button key={s} variant="outlined"
                        onClick={() => submitBatchEdit(s)}
                        sx={{ color: st.color, borderColor: st.border, bgcolor: st.bg, justifyContent: "flex-start", gap: 1, fontWeight: 600 }}>
                        <Box sx={{ width: 16, height: 16, bgcolor: st.bg, borderRadius: 1, flexShrink: 0 }} />
                        {s}
                      </Button>
                    );
                  })}
                </Box>
              ) : (
                <>
                  {batchEditDlg.type === "date" ? (
                    <DatePicker
                      value={batchEditDlg.value ? dayjs(batchEditDlg.value) : null}
                      onChange={(d) => setBatchEditDlg((p) => ({ ...p, value: d ? d.format("YYYY-MM-DD") : "" }))}
                      format="YYYY-MM-DD"
                      slotProps={{
                        textField: {
                          fullWidth: true, size: "small",
                          onKeyDown: (e) => { if (e.key === "Enter") submitBatchEdit(e.target.value); },
                        },
                      }}
                    />
                  ) : (
                    <TextField
                      autoFocus fullWidth size="small"
                      type={batchEditDlg.type === "number" ? "number" : "text"}
                      label={`新${batchEditDlg.label}`}
                      value={batchEditDlg.value}
                      onChange={(e) => setBatchEditDlg((p) => ({ ...p, value: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") submitBatchEdit(e.target.value); }}
                    />
                  )}
                  <DialogActions sx={{ mt: 2, px: 0 }}>
                    <Button onClick={() => setBatchEditDlg(null)}>取消</Button>
                    <Button onClick={() => submitBatchEdit()} variant="contained">确认修改</Button>
                  </DialogActions>
                </>
              )}
            </DialogContent>
          </Dialog>
        )}

        {/* ---- Snackbar ---- */}
        {snack && (
          <Snackbar open autoHideDuration={4000} onClose={() => setSnack(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
            <Alert severity={snack.severity} onClose={() => setSnack(null)} variant="filled">{snack.text}</Alert>
          </Snackbar>
        )}
      </Box>
    </LocalizationProvider>
  );
}
