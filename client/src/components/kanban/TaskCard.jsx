import { Card, Box } from "@mui/material";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import TaskItem from "./TaskItem";

/**
 * 任务卡片 — 包裹 TaskItem，集成 @dnd-kit sortable 拖拽能力
 *
 * @param {Object} props
 * @param {Object} props.task - 任务对象
 * @param {Function} props.onToggleComplete - 切换完成状态回调
 */
export default function TaskCard({ task, onToggleComplete }) {
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
    position: "relative",
  };

  const dragHandleProps = { ...attributes, ...listeners };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      sx={{
        mb: 0.5,
        boxShadow: isDragging ? 4 : 0,
        border: "1px solid",
        borderColor: isDragging ? "primary.main" : "divider",
        bgcolor: isDragging ? "action.hover" : "background.paper",
        transition: "box-shadow 0.2s, border-color 0.2s",
        "&:hover": {
          boxShadow: 1,
        },
      }}
    >
      <Box sx={{ px: 1, py: 0.25 }}>
        <TaskItem
          task={task}
          onToggleComplete={onToggleComplete}
          dragHandleProps={dragHandleProps}
        />
      </Box>
    </Card>
  );
}
