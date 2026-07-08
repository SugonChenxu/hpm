import { useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Chip,
  CircularProgress,
  Button,
  TextField,
  MenuItem,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from "@mui/material";
import { Add, Flag, DeleteOutline } from "@mui/icons-material";
import api from "../api/client";

const STATUS_COLORS = { 进行中: "primary", 已结项: "success", 已归档: "default" };

export default function DashboardPage() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ status: "", category: "", search: "" });
  const navigate = useNavigate();
  const { openCreateDialog } = useOutletContext();
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = () => {
    setLoading(true);
    api.projects.list(filter).then(r => { setProjects(r.data); setLoading(false); }).catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filter]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.projects.archive(deleteTarget.id);
      setDeleteTarget(null);
      load();
    } catch {} finally { setDeleting(false); }
  };

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 3,
        }}
      >
        <Typography variant="h5" fontWeight={700}>
          项目仪表盘
        </Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={openCreateDialog}
        >
          新建项目
        </Button>
      </Box>

      <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: "wrap" }}>
        <TextField
          size="small"
          label="搜索"
          placeholder="代号或名称"
          value={filter.search}
          onChange={(e) =>
            setFilter((f) => ({ ...f, search: e.target.value }))
          }
          sx={{ width: 200 }}
        />
        <TextField
          size="small"
          select
          label="状态"
          value={filter.status}
          onChange={(e) =>
            setFilter((f) => ({ ...f, status: e.target.value }))
          }
          sx={{ width: 130 }}
        >
          <MenuItem value="">全部</MenuItem>
          <MenuItem value="进行中">进行中</MenuItem>
          <MenuItem value="已结项">已结项</MenuItem>
          <MenuItem value="已归档">已归档</MenuItem>
        </TextField>
        <TextField
          size="small"
          select
          label="类别"
          value={filter.category}
          onChange={(e) =>
            setFilter((f) => ({ ...f, category: e.target.value }))
          }
          sx={{ width: 130 }}
        >
          <MenuItem value="">全部</MenuItem>
          {[
            "新品",
            "OEM",
            "升级",
            "定制",
            "派生",
            "部件引入",
            "独立板卡",
            "机柜机箱",
            "产品维护",
          ].map((c) => (
            <MenuItem key={c} value={c}>
              {c}
            </MenuItem>
          ))}
        </TextField>
        <Box sx={{ flexGrow: 1 }} />
        <StatsBar projects={projects} />
      </Box>

      {loading ? (
        <CircularProgress sx={{ display: "block", mx: "auto", mt: 8 }} />
      ) : projects.length === 0 ? (
        <Card sx={{ textAlign: "center", py: 8 }}>
          <Typography color="text.secondary">
            暂无项目，点击「新建项目」开始
          </Typography>
        </Card>
      ) : (
        <Grid container spacing={2}>
          {projects.map((p) => (
            <Grid item xs={12} sm={6} md={4} key={p.id}>
              <Card
                sx={{ cursor: "pointer", "&:hover": { boxShadow: 4 }, position: "relative" }}
                onClick={() => navigate(`/plans?projectId=${p.id}`)}
              >
                <IconButton
                  size="small"
                  sx={{ position: "absolute", top: 4, right: 4, zIndex: 1 }}
                  onClick={(e) => { e.stopPropagation(); setDeleteTarget(p); }}
                >
                  <DeleteOutline sx={{ fontSize: 18, color: "text.disabled" }} />
                </IconButton>
                <CardContent>
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                    }}
                  >
                    <Box>
                      <Typography variant="subtitle2" color="text.secondary">
                        {p.code}
                      </Typography>
                      <Typography variant="h6" fontWeight={700}>
                        {p.name}
                      </Typography>
                    </Box>
                    <Chip
                      label={p.status}
                      color={STATUS_COLORS[p.status] || "default"}
                      size="small"
                    />
                  </Box>
                  <Box sx={{ display: "flex", gap: 1, mt: 1.5 }}>
                    <Chip label={p.category} size="small" variant="outlined" />
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ mt: 0.5 }}
                    >
                      更新于{" "}
                      {new Date(p.updated_at).toLocaleDateString("zh-CN")}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* 删除确认弹窗 */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>确认删除项目</DialogTitle>
        <DialogContent>
          <DialogContentText>
            确定要删除项目「{deleteTarget?.code} {deleteTarget?.name}」及其全部关联数据（阶段、任务、子任务、故障、物料、会议、周报）吗？
            此操作不可撤销。
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>取消</Button>
          <Button onClick={handleDelete} color="error" variant="contained" disabled={deleting}>
            {deleting ? "删除中..." : "永久删除"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function StatsBar({ projects }) {
  const active = projects.filter((p) => p.status === "进行中").length;
  return (
    <Box sx={{ display: "flex", gap: 1.5 }}>
      <Chip
        icon={<Flag />}
        label={`总数 ${projects.length}`}
        variant="outlined"
      />
      <Chip
        label={`进行中 ${active}`}
        color="primary"
        variant="outlined"
      />
    </Box>
  );
}
