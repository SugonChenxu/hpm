import { useState, useEffect, useCallback, useRef } from "react";
import { Box, Typography, TextField, Collapse, IconButton } from "@mui/material";
import { ExpandMore, ExpandLess } from "@mui/icons-material";
import TodoColumn from "./TodoColumn";
import DoneColumn from "./DoneColumn";
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
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(project?.name || "");
  const nameInputRef = useRef(null);

  useEffect(() => { setNameValue(project?.name || ""); }, [project?.name]);

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

  const themeColor = project?.theme_color || "#1E40AF";

  /** 手动切换折叠（持久化） */
  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    if (next) localStorage.setItem(collapseKey(project?.id), "true");
    else localStorage.removeItem(collapseKey(project?.id));
  };

  /** 保存项目名称 */
  const handleSaveName = async () => {
    const trimmed = nameValue.trim();
    if (!trimmed || trimmed === project?.name) { setEditingName(false); return; }
    try {
      await api.projects.update(project.id, { name: trimmed });
      if (onRefresh) onRefresh();
    } catch { /* ignore */ }
    setEditingName(false);
  };

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
        {/* 项目名 + 统计 + 折叠按钮 */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            mb: 1,
            gap: 1,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flex: 1, minWidth: 0 }}>
            {editingName ? (
              <TextField
                inputRef={nameInputRef}
                size="small"
                variant="standard"
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onBlur={handleSaveName}
                onKeyDown={(e) => { if (e.key === "Enter") handleSaveName(); if (e.key === "Escape") setEditingName(false); }}
                autoFocus
                sx={{ flex: 1, "& .MuiInput-input": { fontSize: 14, fontWeight: 500, py: 0 } }}
              />
            ) : (
              <Typography
                variant="body2"
                fontWeight={500}
                sx={{ fontSize: 14, cursor: "pointer", "&:hover": { color: "primary.main" } }}
                onClick={() => { setNameValue(project?.name || ""); setTimeout(() => nameInputRef.current?.focus(), 0); setEditingName(true); }}
              >
                {project?.code ? `[${project.code}] ` : ""}
                {project?.name || "项目看板"}
              </Typography>
            )}
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexShrink: 0 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12 }}>
              待办 {todoTasks.length} / 已完成 {doneTasks.length}
            </Typography>
            <IconButton size="small" onClick={toggleCollapsed} sx={{ p: 0.25 }}>
              {collapsed ? <ExpandMore sx={{ fontSize: 16 }} /> : <ExpandLess sx={{ fontSize: 16 }} />}
            </IconButton>
          </Box>
        </Box>

        {/* 双栏布局（可折叠动画） */}
        <Collapse in={!collapsed} timeout={300} unmountOnExit>
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
        </Collapse>
      </Box>
    </Box>
  );
}
