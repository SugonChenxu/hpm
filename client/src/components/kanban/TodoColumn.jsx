import { useState, useRef, useCallback, useEffect } from "react";
import { Box, Typography, TextField } from "@mui/material";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import TaskCard from "./TaskCard";
import useKanbanScroll from "../../hooks/useKanbanScroll";
import api from "../../api/client";

/**
 * 待办栏 — 本地 state 驱动，输入即显示，无延迟
 */
export default function TodoColumn({ tasks, projectId, onTasksChange, onToggleComplete }) {
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [localTasks, setLocalTasks] = useState(tasks);
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const { capture, restore } = useKanbanScroll();

  // 当外部 tasks 变化时同步（非拖拽/新增操作时）
  const tasksRef = useRef(tasks);
  useEffect(() => {
    if (tasks !== tasksRef.current) {
      tasksRef.current = tasks;
      // 合并外部 tasks：保留 localTasks 中独有的（乐观插入），其余用外部
      const externalIds = new Set(tasks.map((t) => t.id));
      const localOnly = localTasks.filter((t) => typeof t.id === "string" && t.id.startsWith("temp-") && !externalIds.has(t.id));
      setLocalTasks([...tasks, ...localOnly]);
    }
  }, [tasks]);

  const handleTaskUpdate = (taskId, updates) => {
    setLocalTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...updates } : t)));
    onTasksChange(tasks.map((t) => (t.id === taskId ? { ...t, ...updates } : t)));
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleAddTask = async () => {
    const trimmed = newTitle.trim();
    if (!trimmed || adding) return;
    setAdding(true);
    const savedScroll = capture(containerRef);
    const tempId = `temp-${Date.now()}`;
    const tempTask = { id: tempId, project_id: projectId, title: trimmed, priority: "low", kanban_column: "待开始", status: "待开始", sort_order: localTasks.length, subtask_count: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), completed_at: null, deleted_at: null };

    // 立即加到本地列表
    setLocalTasks((prev) => [...prev, tempTask]);
    setNewTitle("");
    // 同步通知父组件
    onTasksChange([...tasks, tempTask]);

    try {
      const res = await api.tasks.create({ project_id: projectId, title: trimmed, priority: "low", kanban_column: "待开始" });
      // 替换临时 ID
      setLocalTasks((prev) => prev.map((t) => (t.id === tempId ? { ...res.data, subtask_count: 0 } : t)));
      onTasksChange(tasks.map((t) => (t.id === tempId ? { ...res.data, subtask_count: 0 } : t)));
    } catch (err) {
      // 回滚
      setLocalTasks((prev) => prev.filter((t) => t.id !== tempId));
      console.error("添加任务失败:", err);
    } finally {
      setAdding(false);
      restore(containerRef, savedScroll);
      inputRef.current?.focus();
    }
  };

  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const savedScroll = capture(containerRef);
    const oldIndex = localTasks.findIndex((t) => t.id === active.id);
    const newIndex = localTasks.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(localTasks, oldIndex, newIndex);
    setLocalTasks(reordered);
    onTasksChange(reordered);
    api.tasks.reorder(active.id, { sort_order: newIndex, project_id: projectId }).catch(() => {});
    restore(containerRef, savedScroll);
  }, [localTasks, projectId, onTasksChange, capture, restore]);

  return (
    <Box ref={containerRef} sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
      <Typography variant="caption" color="text.secondary" fontWeight={500} sx={{ fontSize: 12, mb: 0.75 }}>
        待办 ({localTasks.length})
      </Typography>
      <Box sx={{ mb: 0.75 }}>
        <TextField inputRef={inputRef} size="small" fullWidth placeholder="输入任务，回车新增" value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddTask(); } }}
          disabled={adding}
          sx={{ "& .MuiOutlinedInput-root": { bgcolor: "grey.50", borderRadius: 1, "& fieldset": { borderColor: "divider" } }, "& .MuiInputBase-input": { fontSize: "0.85rem", py: 0.75 } }} />
      </Box>
      <Box sx={{ flex: 1, overflowY: "auto" }}>
        {localTasks.length === 0 ? (
          <Typography variant="body2" color="text.disabled" sx={{ textAlign: "center", py: 2, fontSize: 12 }}>暂无待办任务</Typography>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={localTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              {localTasks.map((task) => (
                <TaskCard key={task.id} task={task} onToggleComplete={onToggleComplete} onTaskUpdate={handleTaskUpdate} />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </Box>
    </Box>
  );
}
