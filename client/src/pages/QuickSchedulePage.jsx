import { useState, useEffect, useCallback } from "react";
import {
  Box, Typography, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, IconButton, Tooltip, TextField, Stack,
} from "@mui/material";
import api from "../api/client";
import PageHeader from "../components/common/PageHeader";
import ScheduleGantt from "./ScheduleGantt";

// 各排期计划左侧强调色（按列表顺序循环，便于在折叠列表中区分不同项目）
const ACCENT = [
  "#1565C0", "#2E7D32", "#C2185B", "#ED6C02",
  "#6A1B9A", "#00838F", "#AD1457", "#4527A0",
];

function CreateScheduleDialog({ open, onClose, onCreate }) {
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  // 默认时间范围随对话框打开重置为「今年 ~ 明年」
  useEffect(() => {
    if (open) {
      const now = new Date();
      setTitle("");
      setStart(`${now.getFullYear()}-01-01`);
      setEnd(`${now.getFullYear() + 1}-12-31`);
    }
  }, [open]);

  const handleCreate = () => {
    if (!start || !end || start > end) {
      alert("请检查日期范围");
      return;
    }
    onCreate({ title: title || "未命名排期", start_date: start, end_date: end });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>创建排期</DialogTitle>
      <DialogContent>
        <TextField fullWidth size="small" label="排期名称" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="如：XXX 项目初步排期" sx={{ mt: 1, mb: 2 }} />
        <Stack direction="row" spacing={1}>
          <TextField fullWidth size="small" type="date" label="开始日期" InputLabelProps={{ shrink: true }} value={start} onChange={(e) => setStart(e.target.value)} />
          <TextField fullWidth size="small" type="date" label="结束日期" InputLabelProps={{ shrink: true }} value={end} onChange={(e) => setEnd(e.target.value)} />
        </Stack>
        <Typography variant="caption" sx={{ color: "text.secondary", mt: 1, display: "block" }}>
          时间轴将以「季度 + 月」为单位，创建后可以再调整时间段。
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button variant="contained" onClick={handleCreate}>创建</Button>
      </DialogActions>
    </Dialog>
  );
}

/** 删除排期确认弹窗 */
function DeleteScheduleDialog({ open, schedule, onClose, onConfirm }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>删除排期</DialogTitle>
      <DialogContent>
        <Typography variant="body2">
          确定删除排期「{schedule?.title}」吗？该排期下的全部轨道、进度条、关键节点与参照线将一并删除，且不可恢复。
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button color="error" variant="contained" onClick={onConfirm}>删除</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function QuickSchedulePage() {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [titleDraft, setTitleDraft] = useState("");

  const loadAll = useCallback(async () => {
    try {
      const r = await api.quickSchedules.list();
      const list = r.data || [];
      const details = await Promise.all(
        list.map((s) => api.quickSchedules.get(s.id).then((d) => d.data))
      );
      setSchedules(details);
      // 默认展开最近编辑的一条
      if (details.length > 0) setExpandedIds(new Set([details[0].id]));
      else setExpandedIds(new Set());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // 更新某条排期（支持直接传入新 detail，或传入 (prev)=>next 函数做乐观更新）
  const updateSchedule = useCallback((id, updater) => {
    setSchedules((prev) =>
      prev.map((s) => (s.id === id ? (typeof updater === "function" ? updater(s) : updater) : s))
    );
  }, []);

  const toggle = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allExpanded = schedules.length > 0 && schedules.every((s) => expandedIds.has(s.id));
  const toggleAll = () => {
    setExpandedIds(allExpanded ? new Set() : new Set(schedules.map((s) => s.id)));
  };

  const handleCreate = async (data) => {
    try {
      const r = await api.quickSchedules.create(data);
      const detail = r.data;
      setSchedules((prev) => [detail, ...prev]);
      setExpandedIds((prev) => new Set(prev).add(detail.id));
      setCreateOpen(false);
    } catch (err) {
      alert(err.message || "创建失败");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.quickSchedules.remove(deleteTarget.id);
      setSchedules((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      setExpandedIds((prev) => {
        const next = new Set(prev);
        next.delete(deleteTarget.id);
        return next;
      });
    } catch (err) {
      alert(err.message || "删除失败");
    } finally {
      setDeleteTarget(null);
    }
  };

  const commitTitle = async (s) => {
    setEditingId(null);
    const t = titleDraft.trim();
    if (t && t !== s.title) {
      try {
        const r = await api.quickSchedules.update(s.id, { title: t });
        updateSchedule(s.id, r.data);
      } catch (err) {
        alert(err.message || "重命名失败");
      }
    }
  };

  return (
    <Box sx={{ p: 3, height: "calc(100dvh - 64px)", display: "flex", flexDirection: "column" }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <PageHeader title="快速排期" subtitle="多项目排期计划，可折叠/展开管理；拖拽即可调整进度与关键节点" />
        <Box sx={{ display: "flex", gap: 1 }}>
          {schedules.length > 0 && (
            <Button variant="outlined" onClick={toggleAll}>{allExpanded ? "全部折叠" : "全部展开"}</Button>
          )}
          <Button variant="contained" onClick={() => setCreateOpen(true)}>＋ 创建排期</Button>
        </Box>
      </Box>

      {loading ? (
        <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "text.secondary" }}>
          <Typography variant="body2">加载中…</Typography>
        </Box>
      ) : schedules.length === 0 ? (
        <Box
          sx={{
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            border: "1px dashed", borderColor: "divider", borderRadius: 2, color: "text.secondary", gap: 1.5,
          }}
        >
          <Typography variant="body1">还没有排期，点击右上角「创建排期」开始</Typography>
          <Button variant="outlined" size="small" onClick={() => setCreateOpen(true)}>创建排期</Button>
        </Box>
      ) : (
        <Box sx={{ flex: 1, overflowY: "auto", minHeight: 0, WebkitOverflowScrolling: "touch", display: "flex", flexDirection: "column", gap: 1.5, pr: 0.5 }}>
          {schedules.map((s, idx) => {
            const expanded = expandedIds.has(s.id);
            const accent = ACCENT[idx % ACCENT.length];
            return (
              <Box
                key={s.id}
                sx={{
                  border: "1px solid", borderColor: "divider", borderRadius: 2,
                  bgcolor: "background.paper", borderLeft: `4px solid ${accent}`,
                  overflow: "hidden", boxShadow: expanded ? "0 1px 4px rgba(0,0,0,0.06)" : "none",
                }}
              >
                <Box
                  sx={{ p: 1.5, display: "flex", alignItems: "center", gap: 1, cursor: "pointer", userSelect: "none" }}
                  onClick={() => toggle(s.id)}
                >
                  <Box
                    component="span"
                    sx={{ fontSize: "1rem", color: "text.secondary", width: 20, textAlign: "center" }}
                  >
                    {expanded ? "▾" : "▸"}
                  </Box>
                  {editingId === s.id ? (
                    <TextField
                      autoFocus
                      size="small"
                      value={titleDraft}
                      onChange={(e) => setTitleDraft(e.target.value)}
                      onBlur={() => commitTitle(s)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitTitle(s);
                        else if (e.key === "Escape") setEditingId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      sx={{ flex: 1, "& .MuiInputBase-input": { fontWeight: 700, fontSize: "1rem" } }}
                    />
                  ) : (
                    <Typography
                      variant="subtitle1"
                      sx={{
                        fontWeight: 700, flex: 1, overflow: "hidden", textOverflow: "ellipsis",
                        whiteSpace: "nowrap", cursor: "text", "&:hover": { color: "primary.main" },
                      }}
                      onClick={(e) => { e.stopPropagation(); setEditingId(s.id); setTitleDraft(s.title); }}
                    >
                      {s.title}
                    </Typography>
                  )}
                  <Tooltip title="删除排期">
                    <IconButton
                      size="small"
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(s); }}
                      sx={{ color: "error.main" }}
                    >
                      <Box component="span" sx={{ fontSize: "0.8rem", fontWeight: 700 }}>✕</Box>
                    </IconButton>
                  </Tooltip>
                </Box>
                {expanded && (
                  <Box sx={{ p: 1.5, pt: 0 }}>
                    <ScheduleGantt schedule={s} onChange={(d) => updateSchedule(s.id, d)} />
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      )}

      <CreateScheduleDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreate={handleCreate} />
      <DeleteScheduleDialog open={Boolean(deleteTarget)} schedule={deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={confirmDelete} />
    </Box>
  );
}
