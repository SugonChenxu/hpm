import { useState, useEffect, useCallback, useRef } from "react";
import { Box, Typography } from "@mui/material";
import TodoColumn from "./TodoColumn";
import DoneColumn from "./DoneColumn";
import CollapsedProjectHeader from "./CollapsedProjectHeader";
import KanbanStatsBar from "./KanbanStatsBar";
import api from "../../api/client";

/**
 * 获取 localStorage 折叠状态键
 * @param {number} projectId
 * @returns {string}
 */
function collapseKey(projectId) {
  return `kanban-collapsed-${projectId}`;
}

/**
 * 项目双栏看板 — TodoColumn + DoneColumn
 *
 * @param {Object} props
 * @param {Array} props.tasks - 任务列表
 * @param {Object} props.project - 项目对象
 * @param {Object} props.stats - 看板统计 {total, todo, done, subtasks_total, subtasks_done}
 * @param {Function} props.onTasksChange - (newTasks) => void
 * @param {Function} props.onRefresh - () => void，完全刷新数据
 */
export default function KanbanProjectView({ tasks, project, stats, onTasksChange, onRefresh }) {
  const initialCollapsed = localStorage.getItem(collapseKey(project?.id)) === "true";
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const prevAllDoneRef = useRef(false);

  const todoTasks = tasks.filter((t) => !t.completed_at && t.deleted_at === null);
  const doneTasks = tasks.filter((t) => !!t.completed_at && t.deleted_at === null);
  const allDone = tasks.length > 0 && todoTasks.length === 0;

  // 全部完成 → 自动折叠
  useEffect(() => {
    if (allDone && !prevAllDoneRef.current) {
      setCollapsed(true);
      localStorage.setItem(collapseKey(project?.id), "true");
    }
    prevAllDoneRef.current = allDone;
  }, [allDone, project?.id]);

  // 新增或取消完成时自动展开
  const handleTasksChange = useCallback(
    (newTasks) => {
      onTasksChange(newTasks);

      // 如果有新增的待办任务或取消完成，自动展开
      const newTodoTasks = newTasks.filter((t) => !t.completed_at && t.deleted_at === null);
      if (newTodoTasks.length > 0 && collapsed) {
        setCollapsed(false);
        localStorage.removeItem(collapseKey(project?.id));
      }
    },
    [onTasksChange, collapsed, project?.id]
  );

  const handleToggleComplete = useCallback(
    async (task) => {
      const prevTasks = [...tasks];
      const isCurrentlyCompleted = !!task.completed_at;

      // 乐观更新
      if (isCurrentlyCompleted) {
        // 取消完成 → 移回待办
        onTasksChange(
          tasks.map((t) =>
            t.id === task.id
              ? { ...t, completed_at: null, kanban_column: "待开始", status: "待开始" }
              : t
          )
        );
        // 自动展开
        if (collapsed) {
          setCollapsed(false);
          localStorage.removeItem(collapseKey(project?.id));
        }
      } else {
        // 完成
        onTasksChange(
          tasks.map((t) =>
            t.id === task.id
              ? { ...t, completed_at: new Date().toISOString(), kanban_column: "已完成", status: "已完成" }
              : t
          )
        );
      }

      try {
        await api.tasks.toggleComplete(task.id);
      } catch (err) {
        onTasksChange(prevTasks);
        console.error("切换完成状态失败:", err);
      }
    },
    [tasks, onTasksChange, collapsed, project?.id]
  );

  const handleDelete = useCallback(
    async (taskId) => {
      const prevTasks = [...tasks];
      // 乐观删除
      onTasksChange(tasks.filter((t) => t.id !== taskId));
      try {
        await api.tasks.remove(taskId);
      } catch (err) {
        onTasksChange(prevTasks);
        console.error("删除任务失败:", err);
      }
    },
    [tasks, onTasksChange]
  );

  const handleExpand = useCallback(() => {
    setCollapsed(false);
    localStorage.removeItem(collapseKey(project?.id));
  }, [project?.id]);

  const themeColor = project?.theme_color || "#1565C0";

  // 折叠态
  if (collapsed) {
    return (
      <CollapsedProjectHeader
        project={project}
        taskCount={doneTasks.length}
        onExpand={handleExpand}
      />
    );
  }

  // 展开态
  return (
    <Box>
      {/* 顶部装饰条 */}
      <Box
        sx={{
          height: 4,
          bgcolor: themeColor,
          borderRadius: "2px 2px 0 0",
          mb: 2,
        }}
      />

      {/* 统计条 */}
      <KanbanStatsBar stats={stats} />

      {/* 空状态 */}
      {tasks.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 6 }}>
          <Typography color="text.secondary">
            请选择项目后添加待办任务
          </Typography>
        </Box>
      ) : (
        /* 双栏布局 */
        <Box
          sx={{
            display: "flex",
            gap: 2,
            alignItems: "stretch",
            minHeight: 400,
          }}
        >
          <TodoColumn
            tasks={todoTasks}
            projectId={project?.id}
            onTasksChange={(newTodos) => {
              // 重建全量任务列表：todo 任务按新顺序排列，done 任务保持原序
              const doneSet = new Set(doneTasks.map((d) => d.id));
              const todoInNewOrder = newTodos.filter((nt) => !doneSet.has(nt.id));
              handleTasksChange([...todoInNewOrder, ...doneTasks]);
            }}
            onToggleComplete={handleToggleComplete}
          />

          <DoneColumn
            tasks={doneTasks}
            onUndo={handleToggleComplete}
            onDelete={handleDelete}
          />
        </Box>
      )}
    </Box>
  );
}
