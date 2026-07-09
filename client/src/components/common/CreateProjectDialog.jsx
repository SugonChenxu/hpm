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

/** 预设主题色板，创建看板时按项目数取模自动分配 */
const PALETTE = [
  "#1565C0", "#2E7D32", "#ED6C02", "#6A1B9A", "#C62828",
  "#00838F", "#4A148C", "#E65100", "#283593", "#00695C",
];

/**
 * Create / Edit Project dialog.
 *
 * Props:
 *   open          — whether the dialog is visible
 *   onClose       — called when the dialog is dismissed
 *   onCreated     — called on successful creation/update
 *   hideTemplate  — if true, skip template selector (for kanban use)
 *   project       — if provided, dialog is in edit mode
 *   existingCount — number of existing projects (for auto theme_color)
 */
export default function CreateProjectDialog({
  open,
  onClose,
  onCreated,
  hideTemplate,
  project,
  existingCount = 0,
}) {
  const isEdit = !!project;

  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    code: "",
    name: "",
    category: "新品",
    template_id: "",
    department: "",
    order_number: "",
    storage_location: "",
    meeting_time: "",
    theme_color: "",
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
      if (isEdit) {
        // 编辑模式：预填项目数据
        setForm({
          code: project.code || "",
          name: project.name || "",
          category: project.category || "新品",
          template_id: "",
          department: project.department || "",
          order_number: project.order_number || "",
          storage_location: project.storage_location || "",
          meeting_time: project.meeting_time || "",
          theme_color: project.theme_color || PALETTE[0],
        });
        setLoading(false);
        return;
      }

      // 创建模式：重置表单
      setForm({
        code: "",
        name: "",
        category: "新品",
        template_id: "",
        department: "",
        order_number: "",
        storage_location: "",
        meeting_time: "",
        theme_color: PALETTE[existingCount % PALETTE.length],
      });

      if (hideTemplate) {
        setLoading(false);
        return;
      }
      setLoading(true);
      api.templates
        .list()
        .then((r) => {
          setTemplates(r.data || []);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [open, isEdit, project, hideTemplate, existingCount]);

  const handleSubmit = async () => {
    if (!form.code || !form.name) return;
    setSubmitting(true);
    try {
      if (isEdit) {
        // 编辑模式
        await api.projects.update(project.id, {
          code: form.code,
          name: form.name,
          category: form.category,
          department: form.department,
          order_number: form.order_number,
          storage_location: form.storage_location,
          meeting_time: form.meeting_time,
          theme_color: form.theme_color,
        });
        await refreshProjects();
        setSnackbar({
          open: true,
          message: `项目 [${form.code}] ${form.name} 已更新`,
          severity: "success",
        });
        if (onCreated) onCreated();
        onClose();
      } else {
        // 创建模式
        const payload = {
          code: form.code,
          name: form.name,
          category: form.category,
          template_id: form.template_id ? Number(form.template_id) : null,
          department: form.department,
          order_number: form.order_number,
          storage_location: form.storage_location,
          meeting_time: form.meeting_time,
          theme_color: form.theme_color || PALETTE[existingCount % PALETTE.length],
        };
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
      }
    } catch (err) {
      setSnackbar({
        open: true,
        message: err.message || (isEdit ? "更新失败" : "创建失败"),
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
        <DialogTitle>{isEdit ? "编辑项目" : "新建项目"}</DialogTitle>
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

              {/* 新增字段 */}
              <TextField
                label="部门"
                value={form.department}
                onChange={(e) =>
                  setForm({ ...form, department: e.target.value })
                }
                helperText="如 硬件研发部"
              />
              <TextField
                label="订单号"
                value={form.order_number}
                onChange={(e) =>
                  setForm({ ...form, order_number: e.target.value })
                }
                helperText="如 ORD-2024-001"
              />
              <TextField
                label="库位"
                value={form.storage_location}
                onChange={(e) =>
                  setForm({ ...form, storage_location: e.target.value })
                }
                helperText="如 A-03"
              />
              <TextField
                label="例会时间"
                value={form.meeting_time}
                onChange={(e) =>
                  setForm({ ...form, meeting_time: e.target.value })
                }
                helperText="如 每周一 10:00"
              />

              {/* 主题色选择 */}
              <TextField
                select
                label="主题色"
                value={form.theme_color}
                onChange={(e) =>
                  setForm({ ...form, theme_color: e.target.value })
                }
              >
                {PALETTE.map((color) => (
                  <MenuItem key={color} value={color}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Box
                        sx={{
                          width: 16,
                          height: 16,
                          borderRadius: "50%",
                          bgcolor: color,
                        }}
                      />
                      {color}
                    </Box>
                  </MenuItem>
                ))}
              </TextField>

              {!hideTemplate && !isEdit && (
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
            {submitting ? (isEdit ? "保存中..." : "创建中...") : (isEdit ? "保存" : "创建")}
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
