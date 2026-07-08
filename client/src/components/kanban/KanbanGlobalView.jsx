import { useCallback } from "react";
import { Box, Typography, Card, CardContent, Chip } from "@mui/material";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import PriorityChip from "./PriorityChip";
import api from "../../api/client";

const COLUMNS = [
  { key: "待开始", label: "待开始", color: "#1565C0" },
  { key: "进行中", label: "进行中", color: "#faad14" },
  { key: "待验证", label: "待验证", color: "#722ed1" },
  { key: "已完成", label: "已完成", color: "#52c41a" },
];

/**
 * 全局四列看板视图（projectId=null 时使用）
 *
 * @param {Object} props
 * @param {Array} props.tasks - 全部任务
 * @param {Function} props.onTasksChange - (newTasks) => void
 */
export default function KanbanGlobalView({ tasks, onTasksChange }) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  const handleDragEnd = useCallback(
    (event) => {
      const { active, over } = event;
      if (!over) return;

      // 判断是否拖到了不同列
      const activeTask = tasks.find((t) => t.id === active.id);
      if (!activeTask) return;

      // over.id 可能是列标识或任务ID
      const overColumn = COLUMNS.find((c) => c.key === over.id);
      const targetColumn = overColumn ? overColumn.key : null;

      // 如果拖到了列标识上，移动任务到该列
      if (targetColumn && targetColumn !== activeTask.kanban_column) {
        const prevTasks = [...tasks];
        onTasksChange(
          tasks.map((t) =>
            t.id === activeTask.id
              ? { ...t, kanban_column: targetColumn, status: targetColumn }
              : t
          )
        );

        api.tasks
          .update(activeTask.id, { kanban_column: targetColumn, status: targetColumn })
          .catch(() => {
            onTasksChange(prevTasks);
          });
      }
    },
    [tasks, onTasksChange]
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <Box sx={{ display: "flex", gap: 2, overflowX: "auto", pb: 2 }}>
        {COLUMNS.map((col) => {
          const colTasks = tasks.filter((t) => t.kanban_column === col.key);
          return (
            <Card
              key={col.key}
              id={col.key}
              sx={{
                minWidth: 250,
                flex: 1,
                bgcolor: "#fafafa",
                borderTop: `3px solid ${col.color}`,
                maxHeight: "calc(100vh - 220px)",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <CardContent sx={{ flex: 1, overflowY: "auto", pb: "8px !important" }}>
                <Typography variant="subtitle2" fontWeight={700} mb={1}>
                  {col.label}{" "}
                  <Chip label={colTasks.length} size="small" sx={{ ml: 0.5 }} />
                </Typography>

                {colTasks.length === 0 ? (
                  <Typography
                    variant="body2"
                    color="text.disabled"
                    sx={{ textAlign: "center", py: 3 }}
                  >
                    暂无任务
                  </Typography>
                ) : (
                  colTasks.map((t) => (
                    <Card
                      key={t.id}
                      data-draggable
                      sx={{
                        mb: 1,
                        p: 1.5,
                        cursor: "grab",
                        "&:active": { cursor: "grabbing" },
                        "&:hover": { boxShadow: 2 },
                      }}
                    >
                      <Typography variant="body2" fontWeight={600} mb={0.5}>
                        {t.title}
                      </Typography>
                      <Box sx={{ display: "flex", gap: 0.5, alignItems: "center", flexWrap: "wrap" }}>
                        <PriorityChip priority={t.priority} />
                        {t.due_date && (
                          <Typography variant="caption" color="text.secondary">
                            {new Date(t.due_date).toLocaleDateString("zh-CN")}
                          </Typography>
                        )}
                        {t.assignee && (
                          <Chip
                            label={t.assignee}
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: "0.65rem", height: 18 }}
                          />
                        )}
                      </Box>
                    </Card>
                  ))
                )}
              </CardContent>
            </Card>
          );
        })}
      </Box>
    </DndContext>
  );
}
