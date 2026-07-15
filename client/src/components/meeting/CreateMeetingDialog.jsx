import { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Box,
  Typography,
  InputAdornment,
  Alert,
} from "@mui/material";
import { Link as LinkIcon, Add } from "@mui/icons-material";
import api from "../../api/client";
import { useProjectContext } from "../../context/ProjectContext";

const PLATFORMS = [
  { value: "quanshi", label: "全时会议" },
  { value: "tencent", label: "腾讯会议" },
  { value: "manual", label: "手动登记" },
];

// 从全时分享链接解析会议 ID：/summary/m/<ID>?...
function parseQuanshiId(url) {
  const m = String(url || "").match(/\/summary\/m\/([^/?#]+)/);
  return m ? m[1] : "";
}

const emptyForm = {
  project_id: "",
  platform: "quanshi",
  title: "",
  start_time: "",
  end_time: "",
  attendee_count: "",
  minutes_url: "",
  external_id: "",
};

/**
 * CreateMeetingDialog — 新建会议（支持全时/腾讯/手动）
 * 全时会议：粘贴 App 内分享链接，自动解析会议 ID
 */
export default function CreateMeetingDialog({ open, onClose, onCreated }) {
  const { projects } = useProjectContext();
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setForm(emptyForm);
      setError("");
    }
  }, [open]);

  const handleField = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
  };

  // 全时链接变化 → 自动解析会议 ID
  const handleQuanshiUrl = (e) => {
    const url = e.target.value;
    setForm((f) => ({ ...f, minutes_url: url, external_id: parseQuanshiId(url) }));
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      setError("请填写会议标题");
      return;
    }
    if (form.platform === "quanshi" && !form.minutes_url.trim()) {
      setError("请粘贴全时会议分享链接");
      return;
    }

    const payload = {
      project_id: form.project_id ? Number(form.project_id) : null,
      platform: form.platform,
      title: form.title.trim(),
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      attendee_count: form.attendee_count ? Number(form.attendee_count) : null,
    };

    if (form.platform === "quanshi") {
      payload.minutes_url = form.minutes_url.trim();
      payload.external_id = form.external_id || null;
      payload.meeting_code = form.external_id || "";
    }

    try {
      setSubmitting(true);
      setError("");
      await api.meetings.create(payload);
      if (onCreated) await onCreated();
      onClose();
    } catch (e) {
      setError(e.message || "创建失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>新建会议</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          <TextField
            select
            label="所属项目"
            value={form.project_id}
            onChange={handleField("project_id")}
            size="small"
          >
            <MenuItem value="">不关联项目</MenuItem>
            {projects.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.name}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            label="会议平台"
            value={form.platform}
            onChange={handleField("platform")}
            size="small"
          >
            {PLATFORMS.map((p) => (
              <MenuItem key={p.value} value={p.value}>
                {p.label}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            label="会议标题"
            value={form.title}
            onChange={handleField("title")}
            size="small"
            autoFocus
          />

          {form.platform === "quanshi" && (
            <TextField
              label="全时会议分享链接"
              placeholder="https://aiminutes.quanshimeet.cn/summary/m/..."
              value={form.minutes_url}
              onChange={handleQuanshiUrl}
              size="small"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <LinkIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
              helperText={
                form.external_id
                  ? `已解析会议 ID: ${form.external_id}`
                  : "从全时 App 内复制「获取纪要」分享链接粘贴此处"
              }
            />
          )}

          <Box sx={{ display: "flex", gap: 2 }}>
            <TextField
              label="开始时间"
              type="datetime-local"
              value={form.start_time}
              onChange={handleField("start_time")}
              size="small"
              InputLabelProps={{ shrink: true }}
              sx={{ flex: 1 }}
            />
            <TextField
              label="结束时间"
              type="datetime-local"
              value={form.end_time}
              onChange={handleField("end_time")}
              size="small"
              InputLabelProps={{ shrink: true }}
              sx={{ flex: 1 }}
            />
          </Box>

          <TextField
            label="参会人数"
            type="number"
            value={form.attendee_count}
            onChange={handleField("attendee_count")}
            size="small"
            inputProps={{ min: 0 }}
          />

          {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={submitting}>
          取消
        </Button>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? "创建中..." : "创建"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
