import { useEffect, useState, useCallback } from "react";
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  Card,
  Button,
  Snackbar,
} from "@mui/material";
import { Add } from "@mui/icons-material";
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

/** 可拖拽的看板卡片包裹组件 */
function SortableKanbanCard({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

/**
 * 项目概览看板页面
 *
 * 展示所有项目的概览卡片，支持：
 * - 响应式网格布局（最小列宽 340px）
 * - 卡片信息聚合（订单号/库位/例会时间/当前阶段/待办摘要）
 * - 右键编辑项目
 * - 新建项目看板（增强表单）
 * - 拖拽排序
 */
export default function TaskKanbanPage() {
  const [projects, setProjects] = useState([]);
  const [tasksByProject, setTasksByProject] = useState(
    /** @type {Map<number, Array>} */ new Map()
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editProject, setEditProject] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  /** 看板卡片拖拽结束：交换 projects 顺序 */
  const handleKanbanDragEnd = useCallback(
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

  /**
   * 并行加载所有项目和任务
   */
  const load = useCallback(() => {
    setLoading(true);
    setError(null);

    Promise.all([api.projects.list({}), api.tasks.list({})])
      .then(([projectsRes, tasksRes]) => {
        const projectsList = projectsRes.data || [];
        const allTasks = tasksRes.data || [];

        // 按 project_id 分组任务
        const grouped = new Map();
        allTasks.forEach((t) => {
          if (t.project_id != null) {
            const arr = grouped.get(t.project_id) || [];
            arr.push(t);
            grouped.set(t.project_id, arr);
          }
        });

        setProjects(projectsList);
        setTasksByProject(grouped);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "加载失败");
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** ProjectCard 右键编辑回调 */
  const handleEditProject = useCallback((project) => {
    setEditProject(project);
  }, []);

  /** 编辑完成后刷新 */
  const handleEditClose = useCallback((saved) => {
    setEditProject(null);
    if (saved) load();
  }, [load]);

  // ---------- 加载态 ----------
  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  // ---------- 渲染 ----------
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
          onClick={() => setCreateOpen(true)}
        >
          新建项目看板
        </Button>
      </Box>

      {/* 错误提示 */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* 空状态：无项目时引导创建 */}
      {projects.length === 0 && (
        <Card
          sx={{
            textAlign: "center",
            py: 8,
            px: 4,
            borderRadius: 3,
            bgcolor: "grey.50",
          }}
        >
          <Typography variant="h6" color="text.secondary" gutterBottom>
            暂无项目看板
          </Typography>
          <Typography variant="body2" color="text.disabled" sx={{ mb: 3 }}>
            创建你的第一个项目看板，开始管理待办任务
          </Typography>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => setCreateOpen(true)}
          >
            新建项目看板
          </Button>
        </Card>
      )}

      {/* 响应式看板网格（可拖拽排列） */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleKanbanDragEnd}
      >
        <SortableContext
          items={projects.map((p) => p.id)}
          strategy={rectSortingStrategy}
        >
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
              gap: 3,
            }}
          >
            {projects.map((p) => (
              <SortableKanbanCard key={p.id} id={p.id}>
                <ProjectCard
                  project={p}
                  tasks={tasksByProject.get(p.id) || []}
                  onEdit={handleEditProject}
                />
              </SortableKanbanCard>
            ))}
          </Box>
        </SortableContext>
      </DndContext>

      {/* 新建项目弹窗 */}
      <CreateProjectDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => load()}
        hideTemplate
        existingCount={projects.length}
      />

      {/* 编辑项目弹窗 */}
      <CreateProjectDialog
        open={editProject !== null}
        project={editProject}
        onClose={() => handleEditClose(false)}
        onCreated={() => handleEditClose(true)}
      />

      {/* 全局错误 Snackbar */}
      <Snackbar
        open={!!error}
        autoHideDuration={4000}
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="error" onClose={() => setError(null)} variant="filled">
          {error}
        </Alert>
      </Snackbar>
    </Box>
  );
}
