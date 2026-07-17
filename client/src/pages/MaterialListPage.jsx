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
      label={<>{status}<Box component="span" sx={{ fontSize: 10, ml: 0.3 }}>▾</Box></>}
      size="small"
      onClick={onClick}
      sx={{ color: st.color, bgcolor: st.bg, fontWeight: 600, cursor: "pointer", maxWidth: 90, "& .MuiChip-label": { px: 1 } }}
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
      await api.materials.update(rowId, { [field]: value });
      setRows((prev) => prev.map((r) => r.id === rowId ? { ...r, [field]: value } : r));
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
                <TableCell sx={{ width: 42, fontWeight: 700, bgcolor: "grey.50", p: 0.5 }}>
                  <Checkbox size="small" checked={allSelected} indeterminate={selected.size > 0 && !allSelected} onChange={toggleAll} />
                </TableCell>
                <TableCell sx={{ width: 60, fontWeight: 700, bgcolor: "grey.50", cursor: "pointer", userSelect: "none" }}
                  onClick={() => handleSort("seq")}>
                  序号<SortArrow dir={sortKey === "seq" ? sortDir : null} />
                </TableCell>
                {COLUMNS.map((col) => {
                  const width = colWidths.find((c) => c.key === col.key)?.width || col.width;
                  return (
                    <TableCell key={col.key}
                      sx={{
                        width, fontWeight: 700, bgcolor: "grey.50", cursor: "pointer",
                        userSelect: "none", position: "relative", overflow: "visible",
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
                  <TableRow key={row.id} hover sx={{ bgcolor: selected.has(row.id) ? "action.selected" : "inherit" }}>
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
                sx={{ gap: 1 }}>
                <Box sx={{ width: 12, height: 12, borderRadius: "50%", bgcolor: st.bg, border: `1px solid ${st.color}` }} />
                <Typography variant="body2" sx={{ color: st.color, fontWeight: 600 }}>{s}</Typography>
              </MenuItem>
            );
          })}
        </Menu>

        {/* ---- 导入弹窗 ---- */}
        {importOpen && (
          <MaterialImportDialog
            file={importOpen}
            projectId={Number(projectId)}
            onClose={() => setImportOpen(false)}
            onDone={handleImportDone}
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
