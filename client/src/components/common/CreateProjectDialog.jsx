import { useState, useEffect } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button, MenuItem, Box, CircularProgress, Snackbar, Alert,
} from "@mui/material";
import api from "../../api/client";
import { useProjectContext } from "../../context/ProjectContext";

const PALETTE = [
  "#1E40AF", "#16A34A", "#D97706", "#7C3AED", "#DC2626",
  "#0EA5E9", "#6D28D9", "#EA580C", "#3730A3", "#0D9488",
];

const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const TIME_OPTIONS = [
  "08:00","08:30","09:00","09:30","10:00","10:30","11:00","11:30",
  "12:00","12:30","13:00","13:30","14:00","14:30","15:00","15:30",
  "16:00","16:30","17:00","17:30","18:00","18:30","19:00","19:30","20:00",
];

/** 解析 meeting_time 字符串 "周一 09:00-10:00" → { weekday, start, end } */
function parseMeetingTime(s) {
  if (!s) return { weekday: "", start: "", end: "" };
  const m = s.match(/^(.+?)\s+(\d{2}:\d{2})-(\d{2}:\d{2})$/);
  if (m) return { weekday: m[1], start: m[2], end: m[3] };
  return { weekday: "", start: "", end: "" };
}

/** 合并 meeting_time 三个字段为存储格式 */
function formatMeetingTime(weekday, start, end) {
  if (!weekday) return "";
  if (!start || !end) return weekday;
  return `${weekday} ${start}-${end}`;
}

export default function CreateProjectDialog({ open, onClose, onCreated, project, hideTemplate, existingCount = 0 }) {
  const isEdit = !!project;
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    code: "", name: "", department: "",
    order_number: "", storage_location: "",
    meeting_weekday: "", meeting_start: "", meeting_end: "",
  });
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" });
  const { refreshProjects } = useProjectContext();

  useEffect(() => {
    if (!open) return;
    if (isEdit) {
      const parsed = parseMeetingTime(project.meeting_time);
      setForm({
        code: project.code || "", name: project.name || "",
        department: project.department || "",
        order_number: project.order_number || "",
        storage_location: project.storage_location || "",
        meeting_weekday: parsed.weekday, meeting_start: parsed.start, meeting_end: parsed.end,
      });
    } else {
      setForm({
        code: "", name: "", department: "",
        order_number: "", storage_location: "",
        meeting_weekday: "", meeting_start: "", meeting_end: "",
      });
    }
  }, [open, isEdit, project]);

  const handleSubmit = async () => {
    if (!form.code || !form.name) return;
    setSubmitting(true);
    try {
      const meeting_time = formatMeetingTime(form.meeting_weekday, form.meeting_start, form.meeting_end);
      if (isEdit) {
        await api.projects.update(project.id, {
          code: form.code, name: form.name, department: form.department,
          order_number: form.order_number, storage_location: form.storage_location,
          meeting_time,
        });
        await refreshProjects();
        setSnackbar({ open: true, message: `项目 [${form.code}] ${form.name} 已更新`, severity: "success" });
        if (onCreated) onCreated();
        onClose();
      } else {
        const payload = {
          code: form.code, name: form.name, department: form.department,
          order_number: form.order_number, storage_location: form.storage_location,
          meeting_time,
          theme_color: PALETTE[existingCount % PALETTE.length],
        };
        await api.projects.create(payload);
        await refreshProjects();
        setSnackbar({ open: true, message: `项目 [${form.code}] ${form.name} 创建成功`, severity: "success" });
        if (onCreated) onCreated();
        onClose();
      }
    } catch (err) {
      setSnackbar({ open: true, message: err.message || (isEdit ? "更新失败" : "创建失败"), severity: "error" });
    } finally { setSubmitting(false); }
  };

  const handleCloseSnackbar = () => setSnackbar((s) => ({ ...s, open: false }));

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>{isEdit ? "编辑项目" : "新建项目"}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5, mt: 1 }}>
            <TextField label="项目代号" value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              required helperText="如 HG4-001" autoFocus />
            <TextField label="项目名称" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <TextField label="部门" value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
              helperText="如 硬件研发部" />
            <TextField label="订单号" value={form.order_number}
              onChange={(e) => setForm({ ...form, order_number: e.target.value })}
              helperText="如 ORD-2024-001" />
            <TextField label="库位" value={form.storage_location}
              onChange={(e) => setForm({ ...form, storage_location: e.target.value })}
              helperText="如 A-03" />
            {/* 例会时间：3个下拉 */}
            <Box sx={{ display: "flex", gap: 1.5 }}>
              <TextField select label="例会星期" value={form.meeting_weekday}
                onChange={(e) => setForm({ ...form, meeting_weekday: e.target.value })}
                sx={{ flex: 1 }}>
                <MenuItem value="">不定期</MenuItem>
                {WEEKDAYS.map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
              </TextField>
              <TextField select label="开始时间" value={form.meeting_start}
                onChange={(e) => setForm({ ...form, meeting_start: e.target.value })}
                sx={{ flex: 1 }}>
                <MenuItem value="">无</MenuItem>
                {TIME_OPTIONS.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
              </TextField>
              <TextField select label="结束时间" value={form.meeting_end}
                onChange={(e) => setForm({ ...form, meeting_end: e.target.value })}
                sx={{ flex: 1 }}>
                <MenuItem value="">无</MenuItem>
                {TIME_OPTIONS.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
              </TextField>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={submitting}>取消</Button>
          <Button variant="contained" onClick={handleSubmit}
            disabled={!form.code || !form.name || submitting}>
            {submitting ? (isEdit ? "保存中..." : "创建中...") : (isEdit ? "保存" : "创建")}
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} variant="filled">
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
}
