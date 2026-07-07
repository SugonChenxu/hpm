import { useState, useEffect, useCallback } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, List, ListItemButton, ListItemText, ListItemIcon,
  Typography, CircularProgress, Alert, Divider,
} from "@mui/material";
import { History, Restore } from "@mui/icons-material";
import api from "../../api/client";

/**
 * 版本历史对话框
 * 列出所有已保存版本，支持查看详情和恢复
 */
export default function VersionHistoryDialog({
  open,
  projectId,
  onClose,
  onRestore,
}) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [restoring, setRestoring] = useState(null);

  const loadVersions = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.schedule.versions(projectId);
      setVersions(res.data || []);
    } catch (err) {
      setError(err.message || "加载版本历史失败");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (open) {
      loadVersions();
    }
  }, [open, loadVersions]);

  const handleRestore = async (version) => {
    setRestoring(version.id);
    try {
      await onRestore(version.id);
      onClose();
    } catch {
      setError("恢复失败");
    } finally {
      setRestoring(null);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <History /> 版本历史
      </DialogTitle>
      <DialogContent>
        {loading && <CircularProgress sx={{ display: "block", mx: "auto", my: 4 }} />}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
            {error}
          </Alert>
        )}

        {!loading && versions.length === 0 && (
          <Typography color="text.secondary" sx={{ textAlign: "center", py: 4 }}>
            暂无已保存的版本
          </Typography>
        )}

        {!loading && versions.length > 0 && (
          <List dense>
            {versions.map((v, idx) => (
              <div key={v.id}>
                {idx > 0 && <Divider />}
                <ListItemButton>
                  <ListItemIcon>
                    <Restore fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primary={v.version_name}
                    secondary={`保存时间: ${v.created_at || "-"}`}
                  />
                  <Button
                    size="small"
                    color="warning"
                    variant="outlined"
                    onClick={() => handleRestore(v)}
                    disabled={restoring === v.id}
                  >
                    {restoring === v.id ? "恢复中..." : "恢复此版本"}
                  </Button>
                </ListItemButton>
              </div>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>关闭</Button>
      </DialogActions>
    </Dialog>
  );
}
