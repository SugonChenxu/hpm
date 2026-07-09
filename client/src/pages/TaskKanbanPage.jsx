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
import KanbanProjectView from "../components/kanban/KanbanProjectView";
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
 * 多项目看板网格页面
 *
 * 展示所有项目的看板卡片，支持：
 * - 响应式网格布局（最小列宽 540px）
 * - 每项目独立 KanbanProjectView（双栏：待办 + 已完成）
 * - 全部完成自动折叠
 * - 新建项目看板（弹窗）
 * - 空状态引导
 */
export default function TaskKanbanPage() {
  const [projects, setProjects] = useState([]);
  const [tasksByProject, setTasksByProject] = useState(
    /** @type {Map<number, Array>} */ new Map()
  );
  const [statsMap, setStatsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);

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
   * 并行加载所有项目、所有任务，再为每个项目获取看板统计
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

        // 无项目时直接结束
        if (projectsList.length === 0) {
          setStatsMap({});
          setLoading(false);
          return;
        }

        // 并行获取所有项目的看板统计
        return Promise.all(
          projectsList.map((p) =>
            api.projects
              .kanbanStats(p.id)
              .then((r) => ({ id: p.id, stats: r.data }))
              .catch(() => ({ id: p.id, stats: null }))
          )
        ).then((statsResults) => {
          const map = {};
          statsResults.forEach(({ id, stats }) => {
            map[id] = stats;
          });
          setStatsMap(map);
          setLoading(false);
        });
      })
      .catch((err) => {
        setError(err.message || "加载失败");
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * 单个项目的任务变更回调
   * KanbanProjectView 内部乐观更新后回传完整任务列表
   */
  const handleProjectTasksChange = useCallback((projectId, newTasks) => {
    setTasksByProject((prev) => {
      const next = new Map(prev);
      next.set(projectId, newTasks);
      return next;
    });
  }, []);

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
          每日待办
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
              gridTemplateColumns: "repeat(auto-fill, minmax(540px, 1fr))",
              gap: 3,
            }}
          >
            {projects.map((p) => (
              <SortableKanbanCard key={p.id} id={p.id}>
                <KanbanProjectView
                  tasks={tasksByProject.get(p.id) || []}
                  project={p}
                  stats={statsMap[p.id]}
                  onTasksChange={(newTasks) =>
                    handleProjectTasksChange(p.id, newTasks)
                  }
                  onRefresh={load}
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
