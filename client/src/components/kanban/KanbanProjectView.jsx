import { useState, useEffect, useCallback, useRef } from "react";
import { Box, Typography } from "@mui/material";
import TodoColumn from "./TodoColumn";
import DoneColumn from "./DoneColumn";
import CollapsedProjectHeader from "./CollapsedProjectHeader";
import api from "../../api/client";

function collapseKey(projectId) {
  return `kanban-collapsed-${projectId}`;
}

/**
 * 项目双栏看板 — 严格对标原型设计
 *
 * 卡片结构（展开态）：
 * ┌─ 主题色横条（3px）──────────┐
 * │ [HG4-001] 曙光项目  待办3/已完成2│  ← 项目名 + 统计
 * │ ┌─ 待办栏 ─┬─── 已完成栏 ──┐ │
 * │ │ [快速录入] │              │ │
 * │ │ ● 任务1   │ ~~任务2~~    │ │
 * │ └──────────┴──────────────┘ │
 * └─────────────────────────────┘
 */
export default function KanbanProjectView({ tasks, project, stats, onTasksChange, onRefresh }) {
  const initialCollapsed = localStorage.getItem(collapseKey(project?.id)) === "true";
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const prevAllDoneRef = useRef(false);

  const todoTasks = tasks.filter((t) => !t.completed_at && t.deleted_at === null);
  const doneTasks = tasks.filter((t) => !!t.completed_at && t.deleted_at === null);
  const allDone = tasks.length > 0 && todoTasks.length === 0;

  useEffect(() => {
    if (allDone && !prevAllDoneRef.current) {
      setCollapsed(true);
      localStorage.setItem(collapseKey(project?.id), "true");
    }
    prevAllDoneRef.current = allDone;
  }, [allDone, project?.id]);

  const handleTasksChange = useCallback(
    (newTasks) => {
      onTasksChange(newTasks);
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
      if (isCurrentlyCompleted) {
        onTasksChange(
          tasks.map((t) =>
            t.id === task.id
              ? { ...t, completed_at: null, kanban_column: "待开始", status: "待开始" }
              : t
          )
        );
        if (collapsed) {
          setCollapsed(false);
          localStorage.removeItem(collapseKey(project?.id));
        }
      } else {
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
      }
    },
    [tasks, onTasksChange, collapsed, project?.id]
  );

  const handleDelete = useCallback(
    async (taskId) => {
      const prevTasks = [...tasks];
      onTasksChange(tasks.filter((t) => t.id !== taskId));
      try {
        await api.tasks.remove(taskId);
      } catch (err) {
        onTasksChange(prevTasks);
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
    <Box
      sx={{
        background: "#fff",
        borderRadius: "12px",
        border: "0.5px solid",
        borderColor: "divider",
        overflow: "hidden",
      }}
    >
      {/* 主题色横条 */}
      <Box sx={{ height: 3, bgcolor: themeColor }} />

      <Box sx={{ p: "10px 14px 0" }}>
        {/* 项目名 + 统计 */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            mb: 1,
          }}
        >
          <Typography variant="body2" fontWeight={500} sx={{ fontSize: 14 }}>
            {project?.code ? `[${project.code}] ` : ""}
            {project?.name || "项目看板"}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12 }}>
            待办 {todoTasks.length} / 已完成 {doneTasks.length}
          </Typography>
        </Box>

        {/* 双栏布局 */}
        <Box
          sx={{
            display: "flex",
            gap: 1.5,
            alignItems: "stretch",
            minHeight: 200,
          }}
        >
          <TodoColumn
            tasks={todoTasks}
            projectId={project?.id}
            onTasksChange={(newTodos) => {
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
      </Box>
    </Box>
  );
}
