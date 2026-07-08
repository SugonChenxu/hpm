import { Box } from "@mui/material";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import TaskItem from "./TaskItem";

/**
 * 任务卡片 — 包裹 TaskItem，保持原型轻量风格（无阴影卡片）
 */
export default function TaskCard({ task, onToggleComplete, onTaskUpdate }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : "auto",
  };

  return (
    <Box
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
    >
      <TaskItem task={task} onToggleComplete={onToggleComplete} onTaskUpdate={onTaskUpdate} />
    </Box>
  );
}
