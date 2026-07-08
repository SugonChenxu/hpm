import { useState, useRef, useCallback } from "react";
import { Box, Typography, TextField } from "@mui/material";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import TaskCard from "./TaskCard";
import useKanbanScroll from "../../hooks/useKanbanScroll";
import api from "../../api/client";

export default function TodoColumn({ tasks, projectId, onTasksChange, onToggleComplete }) {
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [localTasks, setLocalTasks] = useState(() => tasks);
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const { capture, restore } = useKanbanScroll();
  const tasksKeyRef = useRef(JSON.stringify(tasks.map((t) => t.id).sort()));

  // 只在外部任务 ID 列表真正变化时同步（比如完成了/删除了/从外部刷新）
  const tasksFingerprint = JSON.stringify(tasks.map((t) => t.id).sort());
  if (tasksFingerprint !== tasksKeyRef.current) {
    tasksKeyRef.current = tasksFingerprint;
    const externalIds = new Set(tasks.map((t) => t.id));
    setLocalTasks((prev) => {
      const temps = prev.filter((t) => typeof t.id === "string" && t.id.startsWith("temp-") && !externalIds.has(t.id));
      return [...tasks, ...temps];
    });
  }

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
    const tempTask = { id: tempId, project_id: projectId, title: trimmed, priority: "low", kanban_column: "待开始", status: "待开始", sort_order: 0, subtask_count: 0, completed_at: null, deleted_at: null };

    setLocalTasks((prev) => [...prev, tempTask]);
    setNewTitle("");

    try {
      const res = await api.tasks.create({ project_id: projectId, title: trimmed, priority: "low", kanban_column: "待开始" });
      setLocalTasks((prev) => prev.map((t) => (t.id === tempId ? { ...res.data, subtask_count: 0 } : t)));
      if (onTasksChange) onTasksChange([...tasks, { ...res.data, subtask_count: 0 }]);
    } catch (err) {
      setLocalTasks((prev) => prev.filter((t) => t.id !== tempId));
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
    const oldIdx = localTasks.findIndex((t) => t.id === active.id);
    const newIdx = localTasks.findIndex((t) => t.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(localTasks, oldIdx, newIdx);
    setLocalTasks(reordered);
    if (onTasksChange) onTasksChange(reordered);
    api.tasks.reorder(active.id, { sort_order: newIdx, project_id: projectId }).catch(() => {});
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
