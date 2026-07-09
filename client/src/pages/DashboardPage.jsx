import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import {
  Box,
  Grid,
  Card,
  Typography,
  Chip,
  CircularProgress,
  Button,
  TextField,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from "@mui/material";
import { Add, Flag, DeleteOutline } from "@mui/icons-material";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import api from "../api/client";
import ProjectCard from "../components/kanban/ProjectCard";
import CreateProjectDialog from "../components/common/CreateProjectDialog";

/** 可拖拽的卡片包裹组件 */
function SortableProjectCard({ project, tasks, onEdit, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: project.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Box sx={{ position: "relative" }}>
        <IconButton
          size="small"
          sx={{ position: "absolute", top: 4, right: 4, zIndex: 2 }}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(project);
          }}
        >
          <DeleteOutline sx={{ fontSize: 18, color: "text.disabled" }} />
        </IconButton>
        <ProjectCard project={project} tasks={tasks} onEdit={onEdit} />
      </Box>
    </div>
  );
}

export default function DashboardPage() {
  const [projects, setProjects] = useState([]);
  const [tasksByProject, setTasksByProject] = useState({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ status: "", category: "", search: "" });
  const navigate = useNavigate();
  const { openCreateDialog } = useOutletContext();
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [editProject, setEditProject] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  /** 拉取项目列表 */
  const loadProjects = useCallback(() => {
    setLoading(true);
    api.projects
      .list(filter)
      .then((r) => {
        setProjects(r.data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [filter]);

  /** 拉取每个项目的待办任务 */
  const loadTasks = useCallback(async (projectIds) => {
    const results = {};
    await Promise.all(
      projectIds.map(async (pid) => {
        try {
          const r = await api.tasks.list({ project_id: pid });
          results[pid] = r.data || [];
        } catch {
          results[pid] = [];
        }
      })
    );
    setTasksByProject(results);
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // 项目列表加载后，批量拉取待办任务
  useEffect(() => {
    if (projects.length > 0) {
      loadTasks(projects.map((p) => p.id));
    }
  }, [projects, loadTasks]);

  /** 拖拽结束：交换顺序 */
  const handleDragEnd = useCallback(
    (event) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      setProjects((prev) => {
        const oldIndex = prev.findIndex((p) => p.id === active.id);
        const newIndex = prev.findIndex((p) => p.id === over.id);
        if (oldIndex === -1 || newIndex === -1) return prev;
        return arrayMove(prev, oldIndex, newIndex);
      });
    },
    []
  );

  /** 删除项目 */
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.projects.archive(deleteTarget.id);
      setDeleteTarget(null);
      loadProjects();
    } catch {
    } finally {
      setDeleting(false);
    }
  };

  /** 编辑项目回调 */
  const handleEdit = useCallback((project) => {
    setEditProject(project);
  }, []);

  /** 编辑弹窗关闭 */
  const handleEditClose = useCallback(() => {
    setEditProject(null);
  }, []);

  /** 编辑成功后刷新 */
  const handleEditCreated = useCallback(() => {
    loadProjects();
  }, [loadProjects]);

  const activeCount = useMemo(
    () => projects.filter((p) => p.status === "进行中").length,
    [projects]
  );

  return (
    <Box>
      {/* 标题栏 */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 3,
        }}
      >
        <Typography variant="h5" fontWeight={700}>
          项目概览
        </Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={openCreateDialog}
        >
          新建项目
        </Button>
      </Box>

      {/* 筛选栏 */}
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
        {/* 统计栏 */}
        <Box sx={{ display: "flex", gap: 1.5, alignItems: "center" }}>
          <Chip
            icon={<Flag />}
            label={`总数 ${projects.length}`}
            variant="outlined"
          />
          <Chip
            label={`进行中 ${activeCount}`}
            color="primary"
            variant="outlined"
          />
        </Box>
      </Box>

      {/* 项目卡片网格 */}
      {loading ? (
        <CircularProgress sx={{ display: "block", mx: "auto", mt: 8 }} />
      ) : projects.length === 0 ? (
        <Card sx={{ textAlign: "center", py: 8 }}>
          <Typography color="text.secondary">
            暂无项目，点击「新建项目」开始
          </Typography>
        </Card>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={projects.map((p) => p.id)}
            strategy={rectSortingStrategy}
          >
            <Grid container spacing={2}>
              {projects.map((p) => (
                <Grid item xs={12} sm={6} md={4} key={p.id}>
                  <SortableProjectCard
                    project={p}
                    tasks={tasksByProject[p.id] || []}
                    onEdit={handleEdit}
                    onDelete={setDeleteTarget}
                  />
                </Grid>
              ))}
            </Grid>
          </SortableContext>
        </DndContext>
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
          <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>
            取消
          </Button>
          <Button
            onClick={handleDelete}
            color="error"
            variant="contained"
            disabled={deleting}
          >
            {deleting ? "删除中..." : "永久删除"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 编辑项目弹窗 */}
      <CreateProjectDialog
        open={!!editProject}
        onClose={handleEditClose}
        onCreated={handleEditCreated}
        project={editProject}
        hideTemplate
      />
    </Box>
  );
}
