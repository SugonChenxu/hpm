import { useState } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button, Box, Snackbar, Alert,
} from "@mui/material";
import api from "../../api/client";

/**
 * 当前登录用户修改自己的密码（需输入原密码）。
 * 同时被 Layout 顶栏「修改密码」按钮与用户管理页「修改我的密码」复用。
 */
export default function ChangePasswordDialog({ open, onClose }) {
  const [oldPassword, setOld] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [snack, setSnack] = useState(null);

  const reset = () => {
    setOld("");
    setNew("");
    setConfirm("");
    setErr("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const submit = async () => {
    setErr("");
    if (!oldPassword || !newPassword) {
      setErr("原密码和新密码均必填");
      return;
    }
    if (newPassword.length < 6) {
      setErr("新密码至少 6 位");
      return;
    }
    if (newPassword !== confirm) {
      setErr("两次输入的新密码不一致");
      return;
    }
    setSubmitting(true);
    try {
      await api.users.changeOwnPassword(oldPassword, newPassword);
      setSnack({ severity: "success", text: "密码修改成功" });
      reset();
      setTimeout(() => onClose(), 800);
    } catch (e) {
      setErr(e.message || "修改失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
        <DialogTitle>修改我的密码</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <TextField
              label="原密码" type="password" size="small" fullWidth
              value={oldPassword} onChange={(e) => setOld(e.target.value)} autoFocus
            />
            <TextField
              label="新密码" type="password" size="small" fullWidth
              value={newPassword} onChange={(e) => setNew(e.target.value)}
              helperText="至少 6 位"
            />
            <TextField
              label="确认新密码" type="password" size="small" fullWidth
              value={confirm} onChange={(e) => setConfirm(e.target.value)}
            />
            {err && <Alert severity="error" sx={{ py: 0 }}>{err}</Alert>}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>取消</Button>
          <Button onClick={submit} variant="contained" disabled={submitting}>
            {submitting ? "保存中…" : "确认修改"}
          </Button>
        </DialogActions>
      </Dialog>
      {snack && (
        <Snackbar
          open autoHideDuration={3000} onClose={() => setSnack(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert severity={snack.severity} variant="filled" onClose={() => setSnack(null)}>
            {snack.text}
          </Alert>
        </Snackbar>
      )}
    </>
  );
}
