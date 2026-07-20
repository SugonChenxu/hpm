import { useEffect, useState, useCallback, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import {
  Box,
  Card,
  Typography,
  Chip,
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
import PageHeader from "../components/common/PageHeader";
import PageLoading from "../components/common/PageLoading";
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

function SortableProjectCard({ project, tasks, faults, onEdit, onDelete, onPhaseChange }) {
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
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onDelete(project); }}
        >
          <DeleteOutline sx={{ fontSize: 18, color: "text.disabled" }} />
        </IconButton>
        <ProjectCard project={project} tasks={tasks} faults={faults} onEdit={onEdit} onPhaseChange={onPhaseChange} />
      </Box>
    </div>
  );
}

export default function DashboardPage() {
  const [projects, setProjects] = useState([]);
  const [tasksByProject, setTasksByProject] = useState({});
  const [faultsByProject, setFaultsByProject] = useState({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ status: "", search: "" });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [editProject, setEditProject] = useState(null);
  const { openCreateDialog } = useOutletContext();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.projects.list(filter),
      api.tasks.list({}).catch(() => ({ data: [] })),
    ])
      .then(([projectsRes, tasksRes]) => {
        const projectList = projectsRes.data || [];
        const allTasks = tasksRes.data || [];
        const grouped = {};
        allTasks.forEach((t) => {
          if (t.project_id != null) {
            if (!grouped[t.project_id]) grouped[t.project_id] = [];
            grouped[t.project_id].push(t);
          }
        });
        setProjects(projectList);
        setTasksByProject(grouped);
        setLoading(false);
        // 并行拉取每个项目的故障概览（关联 Mantis）
        loadFaults(projectList);
      })
      .catch(() => setLoading(false));
  }, [filter]);

  const loadFaults = useCallback((projectList) => {
    if (!projectList || !projectList.length) return;
    Promise.allSettled(
      projectList.map((p) =>
        api.projects
          .faults(p.id)
          .then((r) => ({ id: p.id, data: r }))
          .catch((e) => ({ id: p.id, data: { linked: false, error: e?.message } }))
      )
    ).then((results) => {
      const map = {};
      results.forEach((res) => {
        if (res.status === "fulfilled") map[res.value.id] = res.value.data;
      });
      setFaultsByProject((prev) => ({ ...prev, ...map }));
    });
  }, []);

  useEffect(() => { load(); }, [filter]);

  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setProjects((prev) => {
      const oldIndex = prev.findIndex((p) => p.id === active.id);
      const newIndex = prev.findIndex((p) => p.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      const reordered = arrayMove(prev, oldIndex, newIndex);
      // 持久化排序到后端
      api.projects.reorder(reordered.map((p) => p.id)).catch(() => {});
      return reordered;
    });
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.projects.archive(deleteTarget.id);
      setDeleteTarget(null);
      load();
    } catch {} finally { setDeleting(false); }
  };

  const handleEdit = useCallback((project) => { setEditProject(project); }, []);
  const handleEditClose = useCallback(() => { setEditProject(null); }, []);
  const handleEditCreated = useCallback(() => { load(); }, [load]);
  const handlePhaseChange = useCallback(async (projectId, phase) => {
    try {
      await api.projects.update(projectId, { current_phase: phase });
      load();
    } catch (e) {
      console.error("更新阶段失败", e);
    }
  }, [load]);

  const activeCount = useMemo(
    () => projects.filter((p) => p.status === "进行中").length,
    [projects]
  );

  return (
    <Box>
      <PageHeader title="项目概览" subtitle="管理和跟踪所有硬件项目">
        <Button variant="contained" startIcon={<Add />} onClick={openCreateDialog}>新建项目</Button>
      </PageHeader>

      <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: "wrap" }}>
        <TextField
          size="small" label="搜索" placeholder="代号或名称"
          value={filter.search}
          onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
          sx={{ width: 200 }}
        />
        <TextField
          size="small" select label="状态"
          value={filter.status}
          onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value }))}
          sx={{ width: 130 }}
        >
          <MenuItem value="">全部</MenuItem>
          <MenuItem value="进行中">进行中</MenuItem>
          <MenuItem value="已结项">已结项</MenuItem>
          <MenuItem value="已归档">已归档</MenuItem>
        </TextField>
        <Box sx={{ flexGrow: 1 }} />
        <Box sx={{ display: "flex", gap: 1.5, alignItems: "center" }}>
          <Chip icon={<Flag />} label={`总数 ${projects.length}`} variant="outlined" />
          <Chip label={`进行中 ${activeCount}`} color="primary" variant="outlined" />
        </Box>
      </Box>

      {loading ? (
        <PageLoading />
      ) : projects.length === 0 ? (
        <Card sx={{ textAlign: "center", py: 8 }}>
          <Typography color="text.secondary">暂无项目，点击「新建项目」开始</Typography>
        </Card>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={projects.map((p) => p.id)} strategy={rectSortingStrategy}>
            <Box sx={{
              display: "grid",
              gridTemplateColumns: { xs: "repeat(1, minmax(0, 1fr))", sm: "repeat(2, minmax(0, 1fr))", md: "repeat(3, minmax(0, 1fr))" },
              gap: 2,
            }}>
              {projects.map((p) => (
                <SortableProjectCard
                  key={p.id} project={p}
                  tasks={tasksByProject[p.id] || []}
                  faults={faultsByProject[p.id]}
                  onEdit={handleEdit} onDelete={setDeleteTarget}
                  onPhaseChange={handlePhaseChange}
                />
              ))}
            </Box>
          </SortableContext>
        </DndContext>
      )}

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>确认删除项目</DialogTitle>
        <DialogContent>
          <DialogContentText>
            确定要删除项目「{deleteTarget?.code} {deleteTarget?.name}」及其全部关联数据（阶段、任务、子任务、故障、物料、会议、周报）吗？此操作不可撤销。
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>取消</Button>
          <Button onClick={handleDelete} color="error" variant="contained" disabled={deleting}>
            {deleting ? "删除中..." : "永久删除"}
          </Button>
        </DialogActions>
      </Dialog>

      <CreateProjectDialog
        open={!!editProject} onClose={handleEditClose} onCreated={handleEditCreated}
        project={editProject} hideTemplate
      />
    </Box>
  );
}
