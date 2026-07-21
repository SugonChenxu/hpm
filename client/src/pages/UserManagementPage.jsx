import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Button, TextField, Dialog, DialogTitle,
  DialogContent, DialogContentText, DialogActions, Snackbar, Alert, Tooltip, Chip,
} from "@mui/material";
import api from "../api/client";
import PageHeader from "../components/common/PageHeader";
import PageLoading from "../components/common/PageLoading";
import ChangePasswordDialog from "../components/common/ChangePasswordDialog";

// 角色中文 + 配色
const ROLE_META = {
  owner: { label: "👑 所有者", color: "warning" },
  admin: { label: "管理员", color: "primary" },
  member: { label: "成员", color: "default" },
};

export default function UserManagementPage() {
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const isAdmin = isOwner || user?.role === "admin";

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [snack, setSnack] = useState(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ username: "", password: "", confirm: "", makeAdmin: false });

  const [resetTarget, setResetTarget] = useState(null);
  const [resetForm, setResetForm] = useState({ password: "", confirm: "" });

  const [changeOwnOpen, setChangeOwnOpen] = useState(false);
  const [confirmDlg, setConfirmDlg] = useState(null);
  const [roleTarget, setRoleTarget] = useState(null);

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

  // 非管理员：入口守卫（侧边栏已隐藏菜单，此处防御直接访问 URL）
  if (loading) return <PageLoading />;
  if (!isAdmin) {
    return (
      <Box sx={{ p: 2 }}>
        <PageHeader title="用户管理" subtitle="账号与权限管理" />
        <Alert severity="warning">你没有访问此页面的权限。如需管理账号，请联系系统所有者。</Alert>
      </Box>
    );
  }

  // ===== 操作可用性判断（三级权限矩阵） =====
  const canReset = (u) => {
    if (u.role === "owner") return false;                 // 不能重置所有者
    if (!isOwner && u.role === "admin") return false;     // admin 不能重置 admin
    return true;
  };
  const canDelete = (u) => {
    if (u.id === user.id) return false;                   // 不能删自己
    if (u.role === "owner") return false;                 // 不能删所有者
    if (!isOwner && u.role === "admin") return false;     // admin 不能删 admin
    return true;
  };
  const canChangeRole = (u) => isOwner && u.role !== "owner";

  // ===== 新增用户 =====
  const submitCreate = async () => {
    const { username, password, confirm, makeAdmin } = createForm;
    if (!username.trim()) { setSnack({ severity: "error", text: "用户名必填" }); return; }
    if (!password || password.length < 6) { setSnack({ severity: "error", text: "密码至少 6 位" }); return; }
    if (password !== confirm) { setSnack({ severity: "error", text: "两次密码不一致" }); return; }
    try {
      const payload = { username: username.trim(), password };
      if (makeAdmin && isOwner) payload.role = "admin"; // 仅 owner 可创建管理员
      await api.users.create(payload);
      setSnack({ severity: "success", text: `已创建用户 ${username.trim()}` });
      setCreateOpen(false);
      setCreateForm({ username: "", password: "", confirm: "", makeAdmin: false });
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

  // ===== 修改角色 =====
  const submitRole = async (role) => {
    if (!roleTarget) return;
    try {
      await api.users.setRole(roleTarget.id, role);
      setSnack({ severity: "success", text: `已将 ${roleTarget.username} 设为${ROLE_META[role].label}` });
      setRoleTarget(null);
      load();
    } catch (e) {
      setSnack({ severity: "error", text: e.message || "修改失败" });
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

  return (
    <Box sx={{ p: 2 }}>
      <PageHeader title="用户管理" subtitle="新增同事账号、分配角色、重置密码、修改自己的密码">
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
              <TableCell sx={{ fontWeight: 700, bgcolor: "grey.50", width: 50 }}>#</TableCell>
              <TableCell sx={{ fontWeight: 700, bgcolor: "grey.50" }}>用户名</TableCell>
              <TableCell sx={{ fontWeight: 700, bgcolor: "grey.50", width: 110 }}>角色</TableCell>
              <TableCell sx={{ fontWeight: 700, bgcolor: "grey.50" }}>创建时间</TableCell>
              <TableCell sx={{ fontWeight: 700, bgcolor: "grey.50", width: 320 }}>操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} sx={{ textAlign: "center", py: 6 }}>
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
                    <TableCell>
                      <Chip
                        label={ROLE_META[u.role]?.label || u.role}
                        size="small"
                        color={ROLE_META[u.role]?.color || "default"}
                        variant={u.role === "member" ? "outlined" : "filled"}
                      />
                    </TableCell>
                    <TableCell sx={{ color: "text.secondary" }}>{u.created_at || "-"}</TableCell>
                    <TableCell>
                      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                        <Tooltip title={!canReset(u) ? "无权重置该用户密码" : ""}>
                          <span>
                            <Button
                              size="small" variant="outlined"
                              disabled={!canReset(u)}
                              onClick={() => {
                                setResetTarget(u);
                                setResetForm({ password: "", confirm: "" });
                              }}
                            >
                              重置密码
                            </Button>
                          </span>
                        </Tooltip>
                        {canChangeRole(u) && (
                          <Button
                            size="small" variant="outlined" color="secondary"
                            onClick={() => setRoleTarget(u)}
                          >
                            修改角色
                          </Button>
                        )}
                        <Tooltip title={!canDelete(u) ? (isSelf ? "不能删除当前登录账号" : "无权删除该用户") : ""}>
                          <span>
                            <Button
                              size="small" color="error" variant="outlined"
                              disabled={!canDelete(u)} onClick={() => handleDelete(u)}
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
            {isOwner && (
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={createForm.makeAdmin}
                  onChange={(e) => setCreateForm((f) => ({ ...f, makeAdmin: e.target.checked }))}
                />
                设为管理员（可管理其他成员账号）
              </label>
            )}
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

      {/* 修改角色对话框（仅 owner） */}
      <Dialog open={!!roleTarget} onClose={() => setRoleTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>修改角色 — {roleTarget?.username}</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <DialogContentText>
            将该用户设为以下角色之一。所有者的角色不可更改。
          </DialogContentText>
          <Box sx={{ display: "flex", gap: 1, mt: 2 }}>
            <Button
              variant={roleTarget?.role === "admin" ? "contained" : "outlined"}
              onClick={() => submitRole("admin")}
            >
              管理员
            </Button>
            <Button
              variant={roleTarget?.role === "member" ? "contained" : "outlined"}
              onClick={() => submitRole("member")}
            >
              成员
            </Button>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRoleTarget(null)}>取消</Button>
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
