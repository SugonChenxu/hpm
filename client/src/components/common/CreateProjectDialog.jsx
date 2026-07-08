import { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  MenuItem,
  Box,
  CircularProgress,
  Snackbar,
  Alert,
} from "@mui/material";
import api from "../../api/client";
import { useProjectContext } from "../../context/ProjectContext";

const CATEGORIES = [
  "新品", "OEM", "升级", "定制", "派生",
  "部件引入", "独立板卡", "机柜机箱", "产品维护",
];

/** 预设主题色池，创建看板时自动轮换分配 */
const THEME_COLORS = [
  "#1565C0", "#E65100", "#2E7D32", "#6A1B9A",
  "#C62828", "#00838F", "#4E342E", "#37474F",
];

/**
 * Global "Create Project" dialog.
 * Replaces the former /projects/new route page.
 *
 * Props:
 *   open      — whether the dialog is visible
 *   onClose   — called when the dialog is dismissed
 *   onCreated — called with new project id on successful creation
 *   hideTemplate — if true, skip template selector entirely (for kanban use)
 */
export default function CreateProjectDialog({ open, onClose, onCreated, hideTemplate }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    code: "",
    name: "",
    category: "新品",
    template_id: "",
  });
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "success",
  });
  const { refreshProjects } = useProjectContext();

  // Reset form and load templates whenever the dialog opens
  useEffect(() => {
    if (open) {
      setForm({ code: "", name: "", category: "新品", template_id: "" });
      if (hideTemplate) { setLoading(false); return; }
      setLoading(true);
      api.templates
        .list()
        .then((r) => {
          setTemplates(r.data || []);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!form.code || !form.name) return;
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        template_id: form.template_id ? Number(form.template_id) : null,
      };
      // 看板模式：自动分配主题色
      if (hideTemplate) {
        payload.theme_color = THEME_COLORS[Math.floor(Math.random() * THEME_COLORS.length)];
      }
      const res = await api.projects.create(payload);
      await refreshProjects();
      setSnackbar({
        open: true,
        message: `项目 [${form.code}] ${form.name} 创建成功`,
        severity: "success",
      });
      if (onCreated) {
        onCreated(res.data?.id);
      }
      onClose();
    } catch (err) {
      setSnackbar({
        open: true,
        message: err.message || "创建失败",
        severity: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseSnackbar = () =>
    setSnackbar((s) => ({ ...s, open: false }));

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>新建项目</DialogTitle>
        <DialogContent>
          {loading ? (
            <CircularProgress sx={{ display: "block", mx: "auto", my: 4 }} />
          ) : (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                gap: 2.5,
                mt: 1,
              }}
            >
              <TextField
                label="项目代号"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                required
                helperText="如 HG4-001"
                autoFocus
              />
              <TextField
                label="项目名称"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
              <TextField
                select
                label="项目类别"
                value={form.category}
                onChange={(e) =>
                  setForm({ ...form, category: e.target.value })
                }
              >
                {CATEGORIES.map((c) => (
                  <MenuItem key={c} value={c}>
                    {c}
                  </MenuItem>
                ))}
              </TextField>
              {!hideTemplate && (
              <TextField
                select
                label="流程模板"
                value={form.template_id}
                onChange={(e) =>
                  setForm({ ...form, template_id: e.target.value })
                }
                helperText={
                  form.template_id
                    ? "选择模板后将自动创建阶段和门禁点"
                    : "留空则创建空白项目"
                }
              >
                <MenuItem value="">空白模板（手动定义阶段）</MenuItem>
                {templates.map((t) => (
                  <MenuItem key={t.id} value={String(t.id)}>
                    {t.name}
                    {t.is_preset ? " (预设)" : ""}
                  </MenuItem>
                ))}
              </TextField>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={!form.code || !form.name || submitting}
          >
            {submitting ? "创建中..." : "创建"}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={handleCloseSnackbar}
          severity={snackbar.severity}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
}
