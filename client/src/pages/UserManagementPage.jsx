import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Button, TextField, Dialog, DialogTitle,
  DialogContent, DialogContentText, DialogActions, Snackbar, Alert, Tooltip,
} from "@mui/material";
import api from "../api/client";
import PageHeader from "../components/common/PageHeader";
import PageLoading from "../components/common/PageLoading";
import ChangePasswordDialog from "../components/common/ChangePasswordDialog";

export default function UserManagementPage() {
  const { user } = useAuth();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [snack, setSnack] = useState(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ username: "", password: "", confirm: "" });

  const [resetTarget, setResetTarget] = useState(null);
  const [resetForm, setResetForm] = useState({ password: "", confirm: "" });

  const [changeOwnOpen, setChangeOwnOpen] = useState(false);
  const [confirmDlg, setConfirmDlg] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.users.list();
      setUsers(res.data || []);
    } catch {
      setSnack({ severity: "error", text: "加载用户列表失败" });
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ===== 新增用户 =====
  const submitCreate = async () => {
    const { username, password, confirm } = createForm;
    if (!username.trim()) { setSnack({ severity: "error", text: "用户名必填" }); return; }
    if (!password || password.length < 6) { setSnack({ severity: "error", text: "密码至少 6 位" }); return; }
    if (password !== confirm) { setSnack({ severity: "error", text: "两次密码不一致" }); return; }
    try {
      await api.users.create({ username: username.trim(), password });
      setSnack({ severity: "success", text: `已创建用户 ${username.trim()}` });
      setCreateOpen(false);
      setCreateForm({ username: "", password: "", confirm: "" });
      load();
    } catch (e) {
      setSnack({ severity: "error", text: e.message || "创建失败" });
    }
  };

  // ===== 重置密码 =====
  const submitReset = async () => {
    if (!resetTarget) return;
    const { password, confirm } = resetForm;
    if (!password || password.length < 6) { setSnack({ severity: "error", text: "密码至少 6 位" }); return; }
    if (password !== confirm) { setSnack({ severity: "error", text: "两次密码不一致" }); return; }
    try {
      await api.users.resetPassword(resetTarget.id, password);
      setSnack({ severity: "success", text: `已重置 ${resetTarget.username} 的密码` });
      setResetTarget(null);
      setResetForm({ password: "", confirm: "" });
    } catch (e) {
      setSnack({ severity: "error", text: e.message || "重置失败" });
    }
  };

  // ===== 删除 =====
  const handleDelete = (u) => {
    setConfirmDlg({
      title: "确认删除用户",
      text: `确定删除用户「${u.username}」吗？该账号下的历史数据将变为无主状态，操作不可撤销。`,
      onOk: async () => {
        setConfirmDlg(null);
        try {
          await api.users.remove(u.id);
          setSnack({ severity: "success", text: `已删除用户 ${u.username}` });
          load();
        } catch (e) {
          setSnack({ severity: "error", text: e.message || "删除失败" });
        }
      },
    });
  };

  if (loading) return <PageLoading />;

  return (
    <Box sx={{ p: 2 }}>
      <PageHeader title="用户管理" subtitle="新增同事账号、重置密码、修改自己的密码">
        <Button variant="outlined" onClick={() => setChangeOwnOpen(true)} sx={{ gap: 0.5 }}>
          🔑 修改我的密码
        </Button>
        <Button variant="contained" onClick={() => setCreateOpen(true)} sx={{ gap: 0.5 }}>
          ＋ 新增用户
        </Button>
      </PageHeader>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, bgcolor: "grey.50", width: 60 }}>#</TableCell>
              <TableCell sx={{ fontWeight: 700, bgcolor: "grey.50" }}>用户名</TableCell>
              <TableCell sx={{ fontWeight: 700, bgcolor: "grey.50" }}>创建时间</TableCell>
              <TableCell sx={{ fontWeight: 700, bgcolor: "grey.50", width: 220 }}>操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} sx={{ textAlign: "center", py: 6 }}>
                  <Typography color="text.secondary">暂无用户</Typography>
                </TableCell>
              </TableRow>
            ) : (
              users.map((u, idx) => {
                const isSelf = u.id === user?.id;
                return (
                  <TableRow key={u.id} hover>
                    <TableCell sx={{ color: "text.secondary" }}>{idx + 1}</TableCell>
                    <TableCell>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        {u.username}
                        {isSelf && (
                          <Typography variant="caption" color="primary" sx={{ fontWeight: 600 }}>
                            (我)
                          </Typography>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell sx={{ color: "text.secondary" }}>{u.created_at || "-"}</TableCell>
                    <TableCell>
                      <Box sx={{ display: "flex", gap: 1 }}>
                        <Button
                          size="small" variant="outlined"
                          onClick={() => {
                            setResetTarget(u);
                            setResetForm({ password: "", confirm: "" });
                          }}
                        >
                          重置密码
                        </Button>
                        <Tooltip title={isSelf ? "不能删除当前登录账号" : ""}>
                          <span>
                            <Button
                              size="small" color="error" variant="outlined"
                              disabled={isSelf} onClick={() => handleDelete(u)}
                            >
                              删除
                            </Button>
                          </span>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* 新增用户对话框 */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>新增用户</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <TextField label="用户名" size="small" fullWidth autoFocus
              value={createForm.username}
              onChange={(e) => setCreateForm((f) => ({ ...f, username: e.target.value }))} />
            <TextField label="初始密码" type="password" size="small" fullWidth
              value={createForm.password} helperText="至少 6 位"
              onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))} />
            <TextField label="确认密码" type="password" size="small" fullWidth
              value={createForm.confirm}
              onChange={(e) => setCreateForm((f) => ({ ...f, confirm: e.target.value }))} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>取消</Button>
          <Button onClick={submitCreate} variant="contained">创建</Button>
        </DialogActions>
      </Dialog>

      {/* 重置密码对话框 */}
      <Dialog open={!!resetTarget} onClose={() => setResetTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>重置密码 — {resetTarget?.username}</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <TextField label="新密码" type="password" size="small" fullWidth autoFocus
              value={resetForm.password} helperText="至少 6 位"
              onChange={(e) => setResetForm((f) => ({ ...f, password: e.target.value }))} />
            <TextField label="确认新密码" type="password" size="small" fullWidth
              value={resetForm.confirm}
              onChange={(e) => setResetForm((f) => ({ ...f, confirm: e.target.value }))} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetTarget(null)}>取消</Button>
          <Button onClick={submitReset} variant="contained">确认重置</Button>
        </DialogActions>
      </Dialog>

      {/* 修改我的密码对话框（共享组件） */}
      <ChangePasswordDialog open={changeOwnOpen} onClose={() => setChangeOwnOpen(false)} />

      {/* 删除确认 */}
      {confirmDlg && (
        <Dialog open onClose={() => setConfirmDlg(null)}>
          <DialogTitle>{confirmDlg.title}</DialogTitle>
          <DialogContent>
            <DialogContentText>{confirmDlg.text}</DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmDlg(null)}>取消</Button>
            <Button onClick={confirmDlg.onOk} color="error" variant="contained">确认删除</Button>
          </DialogActions>
        </Dialog>
      )}

      {/* Snackbar */}
      {snack && (
        <Snackbar open autoHideDuration={4000} onClose={() => setSnack(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
          <Alert severity={snack.severity} variant="filled" onClose={() => setSnack(null)}>
            {snack.text}
          </Alert>
        </Snackbar>
      )}
    </Box>
  );
}
