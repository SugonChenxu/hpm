import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import dayjs from "dayjs";
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  TextField,
  Button,
  IconButton,
  Menu,
  MenuItem,
  Checkbox,
  Tooltip,
  Alert,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from "@mui/material";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import "dayjs/locale/zh-cn";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import AddIcon from "@mui/icons-material/Add";
import DownloadIcon from "@mui/icons-material/Download";
import UndoIcon from "@mui/icons-material/Undo";
import SearchIcon from "@mui/icons-material/Search";
import DeleteIcon from "@mui/icons-material/Delete";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";

import api from "../api/client";
import ProjectSelector from "../components/common/ProjectSelector";
import PageHeader from "../components/common/PageHeader";
import PageLoading from "../components/common/PageLoading";
import MaterialImportDialog from "../components/material/MaterialImportDialog";
import { MATERIAL_STATUSES, statusStyle } from "../utils/materialStatus";
import { exportMaterialsExcel } from "../utils/materialExcel";

const COLUMNS = [
  { key: "part_number", label: "物料号", type: "text", width: 150 },
  { key: "manufacturer", label: "厂家", type: "text", width: 120 },
  { key: "model", label: "物料型号", type: "text", width: 170 },
  { key: "material_status", label: "物料状态", type: "status", width: 110 },
  { key: "quantity", label: "数量", type: "number", width: 90 },
  { key: "purchase_date", label: "采购时间", type: "date", width: 120 },
  { key: "lead_time", label: "采购周期", type: "number", width: 90 },
  { key: "expected_delivery", label: "预计交期", type: "date", width: 120 },
  { key: "notes", label: "备注", type: "text", width: 220 },
];
const COL_WIDTH_KEY = "forge.material.colwidths.v1";
const UNDO_WINDOW = 5 * 60 * 1000;

// ===== 状态彩色标签（带 ▾ 提示可交互） =====
function StatusChip({ status, onClick }) {
  const st = statusStyle(status);
  return (
    <Chip
      label={status}
      size="small"
      onClick={onClick}
      onDelete={onClick}
      deleteIcon={<ArrowDropDownIcon />}
      sx={{
        color: st.color,
        bgcolor: st.bg,
        fontWeight: 600,
        cursor: "pointer",
        border: "none",
        "& .MuiChip-label": { px: 0.6 },
        "& .MuiChip-deleteIcon": { ml: 0, mr: -0.4 },
      }}
    />
  );
}

// ===== 内联编辑控件 =====
function EditControl({ type, value, onSave, onCancel, onTab }) {
  const [val, setVal] = useState(value ?? "");
  useEffect(() => {
    setVal(value ?? "");
  }, [value]);

  const save = () => onSave(type === "number" ? Number(val) : val);
  const handleKey = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      save();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    } else if (e.key === "Tab") {
      e.preventDefault();
      save();
      onTab(e.shiftKey ? -1 : 1);
    }
  };

  if (type === "date") {
    return (
      <DatePicker
        value={val ? dayjs(val) : null}
        onChange={(d) => onSave(d ? d.format("YYYY-MM-DD") : "")}
        format="YYYY-MM-DD"
        autoFocus
        closeOnSelect
        slotProps={{
          textField: { size: "small", fullWidth: true, onKeyDown: handleKey },
        }}
      />
    );
  }

  return (
    <TextField
      size="small"
      type={type === "number" ? "number" : "text"}
      value={val}
      autoFocus
      onChange={(e) => setVal(e.target.value)}
      onBlur={save}
      onKeyDown={handleKey}
      fullWidth
      sx={{ "& .MuiInputBase-root": { height: 32 } }}
    />
  );
}

export default function MaterialListPage() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("projectId") || null;

  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [selected, setSelected] = useState(new Set());
  const [editing, setEditing] = useState(null); // { id, field }
  const [statusMenu, setStatusMenu] = useState({ id: null, anchor: null });

  const [importFile, setImportFile] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [snapshot, setSnapshot] = useState(null);
  const [undoSeconds, setUndoSeconds] = useState(0);

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [batchStatusAnchor, setBatchStatusAnchor] = useState(null);
  const [snackbar, setSnackbar] = useState(null);

  // 列宽（含持久化）
  const [colWidths, setColWidths] = useState(() => {
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(COL_WIDTH_KEY) || "{}");
    } catch (e) {
      saved = {};
    }
    return COLUMNS.map((c) => ({ ...c, width: saved[c.key] || c.width }));
  });
  const colWidthsRef = useRef(colWidths);
  useEffect(() => {
    colWidthsRef.current = colWidths;
  }, [colWidths]);
  const resizing = useRef(null);

  const load = useCallback(() => {
    if (!projectId) {
      setMaterials([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      api.materials.list({ project_id: Number(projectId) }),
      api.materials.importSnapshot(Number(projectId)),
    ])
      .then(([listRes, snapRes]) => {
        setMaterials(listRes.data);
        setSnapshot(snapRes.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  // 撤销倒计时
  useEffect(() => {
    if (!snapshot) {
      setUndoSeconds(0);
      return;
    }
    const calc = () => {
      const created = new Date(
        snapshot.created_at.replace(" ", "T") + (snapshot.created_at.includes("Z") ? "" : "+08:00")
      );
      const remain = Math.floor((UNDO_WINDOW - (Date.now() - created.getTime())) / 1000);
      if (remain <= 0) {
        setSnapshot(null);
        setUndoSeconds(0);
      } else {
        setUndoSeconds(remain);
      }
    };
    calc();
    const t = setInterval(calc, 1000);
    return () => clearInterval(t);
  }, [snapshot]);

  // 排序 + 搜索后的视图数据
  const viewRows = useMemo(() => {
    let list = materials;
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((m) =>
        [m.part_number, m.manufacturer, m.model, m.material_status, m.notes]
          .some((v) => (v || "").toLowerCase().includes(s))
      );
    }
    if (sortField) {
      list = [...list].sort((a, b) => {
        let av = a[sortField];
        let bv = b[sortField];
        if (sortField === "quantity" || sortField === "lead_time") {
          av = Number(av) || 0;
          bv = Number(bv) || 0;
        }
        if (av < bv) return sortDir === "asc" ? -1 : 1;
        if (av > bv) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
    }
    return list;
  }, [materials, search, sortField, sortDir]);

  // ===== 内联编辑保存 =====
  const commitEdit = useCallback(
    async (id, field, value) => {
      try {
        await api.materials.update(id, { [field]: value });
        setMaterials((prev) => prev.map((m) => (m.id === id ? { ...m, [field]: value } : m)));
      } catch (e) {
        setSnackbar({ type: "error", msg: e.message || "保存失败" });
      }
    },
    []
  );

  const startEdit = (m, col) => {
    if (col.type === "status") return;
    setEditing({ id: m.id, field: col.key });
  };

  const editFieldNav = (dir) => {
    if (!editing) return;
    const keys = COLUMNS.filter((c) => c.type !== "status").map((c) => c.key);
    const idx = keys.indexOf(editing.field);
    const ni = (idx + dir + keys.length) % keys.length;
    setEditing({ id: editing.id, field: keys[ni] });
  };

  // ===== 状态菜单（单元格 / 批量） =====
  const openStatusMenu = (e, id) => {
    e.stopPropagation();
    setStatusMenu({ id, anchor: e.currentTarget });
  };
  const selectStatus = async (status) => {
    const id = statusMenu.id;
    setStatusMenu({ id: null, anchor: null });
    if (!id) return;
    try {
      await api.materials.update(id, { material_status: status });
      setMaterials((prev) => prev.map((m) => (m.id === id ? { ...m, material_status: status } : m)));
    } catch (e) {
      setSnackbar({ type: "error", msg: e.message || "更新失败" });
    }
  };

  // ===== 行选择 =====
  const allSelected = viewRows.length > 0 && viewRows.every((m) => selected.has(m.id));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(viewRows.map((m) => m.id)));
  };
  const toggleRow = (id) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  // ===== 添加一行 =====
  const handleAddRow = async () => {
    if (!projectId) return;
    try {
      const res = await api.materials.create({ project_id: Number(projectId), material_status: "默认" });
      const newId = res.data.id;
      setMaterials((prev) => [...prev, res.data]);
      setEditing({ id: newId, field: "part_number" });
    } catch (e) {
      setSnackbar({ type: "error", msg: e.message || "添加失败" });
    }
  };

  // ===== 导入 =====
  const handleFileChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      setImportFile(file);
      setImportOpen(true);
    }
    e.target.value = "";
  };
  const handleImported = (count) => {
    setImportOpen(false);
    setImportFile(null);
    load();
    setSnackbar({ type: "success", msg: `成功导入 ${count} 条物料` });
  };

  // ===== 撤销导入 =====
  const handleUndo = async () => {
    try {
      await api.materials.importUndo(Number(projectId));
      setSnapshot(null);
      load();
      setSnackbar({ type: "success", msg: "已撤销最近一次导入" });
    } catch (e) {
      setSnapshot(null);
      load();
      setSnackbar({ type: "error", msg: e.message || "撤销失败" });
    }
  };

  // ===== 批量操作 =====
  const handleBatchDelete = async () => {
    setConfirmDeleteOpen(false);
    try {
      await api.materials.batchRemove({ project_id: Number(projectId), ids: [...selected] });
      setMaterials((prev) => prev.filter((m) => !selected.has(m.id)));
      setSnackbar({ type: "success", msg: `已删除 ${selected.size} 条` });
      setSelected(new Set());
    } catch (e) {
      setSnackbar({ type: "error", msg: e.message || "删除失败" });
    }
  };
  const handleBatchStatus = async (status) => {
    setBatchStatusAnchor(null);
    try {
      await api.materials.batchUpdateStatus({ ids: [...selected], material_status: status });
      setMaterials((prev) =>
        prev.map((m) => (selected.has(m.id) ? { ...m, material_status: status } : m))
      );
      setSnackbar({ type: "success", msg: `已更新 ${selected.size} 条状态` });
    } catch (e) {
      setSnackbar({ type: "error", msg: e.message || "更新失败" });
    }
  };
  const handleBatchExport = () => {
    const rows = materials.filter((m) => selected.has(m.id));
    exportMaterialsExcel(rows, "物料清单_选中.xlsx");
  };
  const handleExportAll = () => {
    exportMaterialsExcel(materials, "物料清单.xlsx");
  };

  // ===== 列宽拖拽 =====
  const onResizeStart = (e, key) => {
    e.preventDefault();
    e.stopPropagation();
    const col = colWidths.find((c) => c.key === key);
    resizing.current = { key, startX: e.clientX, startW: col.width };
    const move = (ev) => {
      if (!resizing.current) return;
      const dx = ev.clientX - resizing.current.startX;
      const newW = Math.max(60, resizing.current.startW + dx);
      setColWidths((prev) =>
        prev.map((c) => (c.key === resizing.current.key ? { ...c, width: newW } : c))
      );
    };
    const end = () => {
      resizing.current = null;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", end);
      const save = {};
      colWidthsRef.current.forEach((c) => (save[c.key] = c.width));
      localStorage.setItem(COL_WIDTH_KEY, JSON.stringify(save));
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", end);
  };

  const toggleSort = (key) => {
    if (sortField === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(key);
      setSortDir("asc");
    }
  };
  const sortArrow = (key) => {
    if (sortField !== key) return null;
    return sortDir === "asc" ? (
      <KeyboardArrowUpIcon fontSize="small" />
    ) : (
      <KeyboardArrowDownIcon fontSize="small" />
    );
  };

  const displayValue = (m, col) => {
    const v = m[col.key];
    if (col.type === "date") return v ? v : "-";
    if (col.type === "number") return v != null ? String(v) : "";
    return v || "";
  };

  if (loading) return <PageLoading />;

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="zh-cn">
      <Box>
        <Box sx={{ mb: 2 }}>
          <ProjectSelector />
        </Box>
        <PageHeader title="物料管理" subtitle="BOM 与备料跟踪" />

        {!projectId ? (
          <Paper sx={{ textAlign: "center", py: 6 }}>
            <Typography color="text.secondary">请先在右上角选择项目，再管理物料清单</Typography>
          </Paper>
        ) : (
          <Box>
            {/* 工具栏 */}
            <Box sx={{ display: "flex", gap: 1, mb: 1.5, flexWrap: "wrap", alignItems: "center" }}>
              <Button variant="outlined" component="label" startIcon={<UploadFileIcon />}>
                导入 Excel
                <input
                  hidden
                  accept=".xlsx,.xls"
                  type="file"
                  onChange={handleFileChange}
                />
              </Button>
              <Button variant="contained" startIcon={<AddIcon />} onClick={handleAddRow}>
                添加一行
              </Button>
              <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleExportAll}>
                导出 Excel
              </Button>
              {snapshot && undoSeconds > 0 && (
                <Button
                  variant="outlined"
                  color="warning"
                  startIcon={<UndoIcon />}
                  onClick={handleUndo}
                >
                  撤销导入（{undoSeconds}s）
                </Button>
              )}
              <Box sx={{ flexGrow: 1 }} />
              <TextField
                size="small"
                placeholder="搜索物料号 / 厂家 / 型号 / 状态 / 备注"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                InputProps={{ startAdornment: <SearchIcon fontSize="small" sx={{ mr: 0.5, color: "text.secondary" }} /> }}
                sx={{ width: 320 }}
              />
            </Box>

            {/* 批量操作栏 */}
            {selected.size > 0 && (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  mb: 1.5,
                  p: 1,
                  borderRadius: 1,
                  bgcolor: "primary.main",
                  color: "primary.contrastText",
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  已选 {selected.size} 项
                </Typography>
                <Button
                  size="small"
                  variant="contained"
                  color="inherit"
                  onClick={(e) => setBatchStatusAnchor(e.currentTarget)}
                  endIcon={<ArrowDropDownIcon />}
                  sx={{ bgcolor: "rgba(255,255,255,0.9)", color: "primary.main" }}
                >
                  批量改状态
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  color="error"
                  onClick={() => setConfirmDeleteOpen(true)}
                  startIcon={<DeleteIcon />}
                  sx={{ bgcolor: "#ff7875" }}
                >
                  批量删除
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  color="inherit"
                  onClick={handleBatchExport}
                  startIcon={<DownloadIcon />}
                  sx={{ borderColor: "rgba(255,255,255,0.7)", color: "inherit" }}
                >
                  导出选中
                </Button>
                <Box sx={{ flexGrow: 1 }} />
                <Button size="small" color="inherit" onClick={() => setSelected(new Set())}>
                  清除
                </Button>
              </Box>
            )}

            {/* 表格 */}
            <TableContainer
              component={Paper}
              sx={{ maxHeight: "calc(100vh - 280px)", overflow: "auto" }}
            >
              <Table
                size="small"
                stickyHeader
                sx={{ tableLayout: "fixed", minWidth: colWidths.reduce((s, c) => s + c.width, 150) }}
              >
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 48 }}>
                      <Checkbox
                        size="small"
                        checked={allSelected}
                        indeterminate={selected.size > 0 && !allSelected}
                        onChange={toggleAll}
                      />
                    </TableCell>
                    <TableCell sx={{ width: 60 }}>序号</TableCell>
                    {colWidths.map((col) => (
                      <TableCell key={col.key} sx={{ width: col.width, position: "relative" }}>
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 0.3,
                            cursor: "pointer",
                            userSelect: "none",
                          }}
                          onClick={() => toggleSort(col.key)}
                        >
                          <span>{col.label}</span>
                          {sortArrow(col.key)}
                        </Box>
                        <Box
                          onMouseDown={(e) => onResizeStart(e, col.key)}
                          sx={{
                            position: "absolute",
                            right: 0,
                            top: 0,
                            bottom: 0,
                            width: 6,
                            cursor: "col-resize",
                            userSelect: "none",
                            "&:hover": { bgcolor: "rgba(0,0,0,0.08)" },
                          }}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {viewRows.map((m, i) => (
                    <TableRow key={m.id} hover selected={selected.has(m.id)}>
                      <TableCell>
                        <Checkbox size="small" checked={selected.has(m.id)} onChange={() => toggleRow(m.id)} />
                      </TableCell>
                      <TableCell>{i + 1}</TableCell>
                      {colWidths.map((col) => {
                        const isEditing = editing && editing.id === m.id && editing.field === col.key;
                        if (col.type === "status") {
                          return (
                            <TableCell key={col.key} onClick={(e) => openStatusMenu(e, m.id)} sx={{ cursor: "pointer" }}>
                              <StatusChip status={m.material_status} onClick={(e) => openStatusMenu(e, m.id)} />
                            </TableCell>
                          );
                        }
                        if (isEditing) {
                          return (
                            <TableCell key={col.key} sx={{ p: 0.5 }}>
                              <EditControl
                                type={col.type}
                                value={m[col.key]}
                                onSave={(v) => {
                                  commitEdit(m.id, col.key, v);
                                  setEditing(null);
                                }}
                                onCancel={() => setEditing(null)}
                                onTab={editFieldNav}
                              />
                            </TableCell>
                          );
                        }
                        return (
                          <TableCell
                            key={col.key}
                            onClick={() => startEdit(m, col)}
                            sx={{ cursor: "text", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                          >
                            {displayValue(m, col)}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                  {viewRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={COLUMNS.length + 2} align="center" sx={{ py: 6 }}>
                        <Typography color="text.secondary">
                          {search ? "未找到匹配的物料" : "暂无物料，点击「添加一行」或「导入 Excel」开始"}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {/* 单元格状态下拉菜单 */}
        <Menu anchorEl={statusMenu.anchor} open={Boolean(statusMenu.anchor)} onClose={() => setStatusMenu({ id: null, anchor: null })}>
          {MATERIAL_STATUSES.map((s) => {
            const st = statusStyle(s);
            return (
              <MenuItem key={s} onClick={() => selectStatus(s)} sx={{ gap: 1 }}>
                <Box
                  sx={{
                    width: 14,
                    height: 14,
                    borderRadius: "3px",
                    bgcolor: st.bg,
                    border: `1px solid ${st.color}`,
                  }}
                />
                <span style={{ color: st.bg === "#f5f5f5" ? "#8c8c8c" : st.bg }}>{s}</span>
              </MenuItem>
            );
          })}
        </Menu>

        {/* 批量改状态菜单 */}
        <Menu anchorEl={batchStatusAnchor} open={Boolean(batchStatusAnchor)} onClose={() => setBatchStatusAnchor(null)}>
          {MATERIAL_STATUSES.map((s) => {
            const st = statusStyle(s);
            return (
              <MenuItem key={s} onClick={() => handleBatchStatus(s)} sx={{ gap: 1 }}>
                <Box sx={{ width: 14, height: 14, borderRadius: "3px", bgcolor: st.bg, border: `1px solid ${st.color}` }} />
                <span>{s}</span>
              </MenuItem>
            );
          })}
        </Menu>

        <MaterialImportDialog
          open={importOpen}
          file={importFile}
          projectId={projectId}
          onClose={() => {
            setImportOpen(false);
            setImportFile(null);
          }}
          onConfirmed={handleImported}
        />

        {/* 批量删除确认 */}
        <Dialog open={confirmDeleteOpen} onClose={() => setConfirmDeleteOpen(false)}>
          <DialogTitle>确认批量删除</DialogTitle>
          <DialogContent>
            <DialogContentText>
              确定要删除选中的 {selected.size} 条物料吗？此操作不可撤销。
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmDeleteOpen(false)}>取消</Button>
            <Button color="error" variant="contained" onClick={handleBatchDelete}>
              删除
            </Button>
          </DialogActions>
        </Dialog>

        <Snackbar
          open={Boolean(snackbar)}
          autoHideDuration={3000}
          onClose={() => setSnackbar(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          {snackbar ? (
            <Alert severity={snackbar.type} onClose={() => setSnackbar(null)}>
              {snackbar.msg}
            </Alert>
          ) : undefined}
        </Snackbar>
      </Box>
    </LocalizationProvider>
  );
}
