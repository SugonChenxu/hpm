import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import {
  Box,
  Card,
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

/**
 * 可拖拽的项目卡片包裹组件
 *
 * 结合 dnd-kit 排序与点击导航、删除按钮。
 * - 左键点击卡片 → 导航到项目排期页
 * - 右键点击卡片 → 打开编辑菜单（由 ProjectCard 内部处理）
 * - 点击删除按钮 → 打开删除确认弹窗
 *
 * @param {object}  props
 * @param {object}  props.project   - 项目数据对象
 * @param {Array}   props.tasks     - 该项目的待办任务数组
 * @param {Function} props.onEdit    - 编辑回调 (project) => void
 * @param {Function} props.onNavigate - 导航回调 (project) => void
 * @param {Function} props.onDelete   - 删除回调 (project) => void
 */
function SortableProjectCard({ project, tasks, onEdit, onNavigate, onDelete }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: project.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Box
        sx={{ position: "relative", cursor: "pointer" }}
        onClick={() => onNavigate(project)}
      >
        {/* 删除按钮：阻止 pointerDown 冒泡以免触发拖拽 */}
        <IconButton
          size="small"
          sx={{ position: "absolute", top: 4, right: 4, zIndex: 2 }}
          onPointerDown={(e) => e.stopPropagation()}
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

/**
 * 项目概览页面
 *
 * 功能：
 * - 搜索 / 状态筛选 / 类别筛选
 * - 统计栏（总数 / 进行中数量）
 * - ProjectCard 卡片展示（彩色边框、信息聚合、待办预览）
 * - 拖拽排序（@dnd-kit，拖拽后仅更新本地顺序）
 * - 右键编辑（CreateProjectDialog 编辑模式）
 * - 点击卡片导航到项目排期页
 * - 删除确认弹窗
 * - 新建项目按钮（使用 outlet context 的 openCreateDialog）
 */
export default function DashboardPage() {
  const [projects, setProjects] = useState([]);
  const [tasksByProject, setTasksByProject] = useState({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({
    status: "",
    category: "",
    search: "",
  });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [editProject, setEditProject] = useState(null);

  const navigate = useNavigate();
  const { openCreateDialog } = useOutletContext();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  /**
   * 加载项目列表 + 全部任务（按 project_id 分组）
   *
   * 使用 Promise.all 并行请求项目和任务：
   * - 项目列表按当前筛选条件请求
   * - 任务一次性拉取全部，再在前端按 project_id 分组
   * - 任务请求失败不影响项目列表展示（catch 降级为空数组）
   */
  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.projects.list(filter),
      api.tasks.list({}).catch(() => ({ data: [] })),
    ])
      .then(([projectsRes, tasksRes]) => {
        const projectList = projectsRes.data || [];
        const allTasks = tasksRes.data || [];

        // 按 project_id 分组任务
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
      })
      .catch(() => setLoading(false));
  }, [filter]);

  useEffect(() => {
    load();
  }, [filter]);

  /** 拖拽结束：更新本地 projects 数组顺序 */
  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setProjects((prev) => {
      const oldIndex = prev.findIndex((p) => p.id === active.id);
      const newIndex = prev.findIndex((p) => p.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }, []);

  /** 删除项目 */
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.projects.archive(deleteTarget.id);
      setDeleteTarget(null);
      load();
    } catch {
      /* 忽略错误 */
    } finally {
      setDeleting(false);
    }
  };

  /** 导航到项目排期页 */
  const handleNavigate = useCallback(
    (project) => {
      navigate(`/plans?projectId=${project.id}`);
    },
    [navigate]
  );

  /** 编辑项目回调（由 ProjectCard 右键菜单触发） */
  const handleEdit = useCallback((project) => {
    setEditProject(project);
  }, []);

  /** 编辑弹窗关闭 */
  const handleEditClose = useCallback(() => {
    setEditProject(null);
  }, []);

  /** 编辑成功后刷新项目列表 */
  const handleEditCreated = useCallback(() => {
    load();
  }, [load]);

  const activeCount = useMemo(
    () => projects.filter((p) => p.status === "进行中").length,
    [projects]
  );

  return (
    <Box>
      {/* 顶部栏：标题 + 新建按钮 */}
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
            {/*
              使用 CSS Grid 而非 MUI Grid，确保 SortableProjectCard
              是 grid 的直接子元素——dnd-kit 的 transform 直接作用于
              grid item，拖拽时视觉位置正确。
              响应式列数等价于 xs=12 sm=6 md=4。
            */}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "repeat(1, 1fr)",
                  sm: "repeat(2, 1fr)",
                  md: "repeat(3, 1fr)",
                },
                gap: 2,
              }}
            >
              {projects.map((p) => (
                <SortableProjectCard
                  key={p.id}
                  project={p}
                  tasks={tasksByProject[p.id] || []}
                  onEdit={handleEdit}
                  onNavigate={handleNavigate}
                  onDelete={setDeleteTarget}
                />
              ))}
            </Box>
          </SortableContext>
        </DndContext>
      )}

      {/* 删除确认弹窗 */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>确认删除项目</DialogTitle>
        <DialogContent>
          <DialogContentText>
            确定要删除项目「{deleteTarget?.code} {deleteTarget?.name}
            」及其全部关联数据（阶段、任务、子任务、故障、物料、会议、周报）吗？
            此操作不可撤销。
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setDeleteTarget(null)}
            disabled={deleting}
          >
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

      {/* 编辑项目弹窗（右键编辑触发） */}
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
