import { useState, useRef, useCallback } from "react";
import { Box, Typography, TextField } from "@mui/material";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import TaskCard from "./TaskCard";
import useKanbanScroll from "../../hooks/useKanbanScroll";
import api from "../../api/client";

/**
 * 待办栏 — 快速录入 + 拖拽排序列表
 *
 * @param {Object} props
 * @param {Array} props.tasks - 待办任务列表
 * @param {number} props.projectId - 所属项目 ID
 * @param {Function} props.onTasksChange - (newTasks) => void
 * @param {Function} props.onToggleComplete - (task) => Promise
 */
export default function TodoColumn({ tasks, projectId, onTasksChange, onToggleComplete }) {
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [pendingTasks, setPendingTasks] = useState([]);
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const { capture, restore } = useKanbanScroll();

  // 合并 props.tasks + 乐观插入的临时任务（去重）
  const displayTasks = [...tasks];
  pendingTasks.forEach((pt) => {
    if (!displayTasks.find((t) => t.id === pt.id)) {
      displayTasks.push(pt);
    }
  });

  /** 单任务字段更新（优先级、标题等），同步到父组件 */
  const handleTaskUpdate = (taskId, updates) => {
    onTasksChange(tasks.map((t) => (t.id === taskId ? { ...t, ...updates } : t)));
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  const handleAddTask = async () => {
    const trimmed = newTitle.trim();
    if (!trimmed || adding) return;

    setAdding(true);
    const savedScroll = capture(containerRef);

    // 乐观插入
    const tempId = `temp-${Date.now()}`;
    const tempTask = {
      id: tempId,
      project_id: projectId,
      title: trimmed,
      priority: "low",
      kanban_column: "待开始",
      status: "待开始",
      sort_order: tasks.length,
      subtask_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: null,
      deleted_at: null,
    };

    const prevTasks = [...tasks];
    const prevPending = [...pendingTasks];
    onTasksChange([...tasks, tempTask]);
    setPendingTasks([...pendingTasks, tempTask]);
    setNewTitle("");

    try {
      const res = await api.tasks.create({
        project_id: projectId,
        title: trimmed,
        priority: "low",
        kanban_column: "待开始",
      });
      // 替换临时 ID 为真实 ID
      setPendingTasks((prev) => prev.filter((p) => p.id !== tempId));
      onTasksChange(tasks.map((t) => (t.id === tempId ? { ...res.data, subtask_count: 0 } : t)));
    } catch (err) {
      onTasksChange(prevTasks);
      setPendingTasks(prevPending);
      console.error("添加任务失败:", err);
    } finally {
      setAdding(false);
      restore(containerRef, savedScroll);
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }
  };

  const handleDragEnd = useCallback(
    (event) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const savedScroll = capture(containerRef);
      const oldIndex = tasks.findIndex((t) => t.id === active.id);
      const newIndex = tasks.findIndex((t) => t.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const prevTasks = [...tasks];
      const reordered = arrayMove(tasks, oldIndex, newIndex);
      onTasksChange(reordered);

      // 调用 reorder API
      api.tasks
        .reorder(active.id, { sort_order: newIndex, project_id: projectId })
        .then(() => {
          restore(containerRef, savedScroll);
        })
        .catch(() => {
          // 回滚
          onTasksChange(prevTasks);
          restore(containerRef, savedScroll);
        });
    },
    [tasks, projectId, onTasksChange, capture, restore]
  );

  return (
    <Box
      ref={containerRef}
      sx={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* 列头 */}
      <Typography
        variant="caption"
        color="text.secondary"
        fontWeight={500}
        sx={{ fontSize: 12, mb: 0.75 }}
      >
        待办 ({displayTasks.length})
      </Typography>

      {/* 顶部快速录入 */}
      <Box sx={{ mb: 0.75 }}>
        <TextField
          inputRef={inputRef}
          size="small"
          fullWidth
          placeholder="输入任务，回车新增"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAddTask();
            }
          }}
          disabled={adding}
          sx={{
            "& .MuiOutlinedInput-root": {
              bgcolor: "grey.50",
              borderRadius: 1,
              "& fieldset": { borderColor: "divider" },
            },
            "& .MuiInputBase-input": { fontSize: "0.85rem", py: 0.75 },
          }}
        />
      </Box>

      {/* 任务列表（可拖拽） */}
      <Box sx={{ flex: 1, overflowY: "auto" }}>
        {displayTasks.length === 0 ? (
          <Typography
            variant="body2"
            color="text.disabled"
            sx={{ textAlign: "center", py: 2, fontSize: 12 }}
          >
            暂无待办任务
          </Typography>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={displayTasks.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              {displayTasks.map((task) => (
                <TaskCard key={task.id} task={task} onToggleComplete={onToggleComplete} onTaskUpdate={handleTaskUpdate} />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </Box>
    </Box>
  );
}
