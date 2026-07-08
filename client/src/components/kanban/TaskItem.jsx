import { useState } from "react";
import { Box, Typography, Collapse, CircularProgress, Tooltip } from "@mui/material";
import PriorityChip from "./PriorityChip";
import SubtaskList from "./SubtaskList";
import api from "../../api/client";
import dayjs from "dayjs";

/** 格式化截止日期为 M/D */
function fmtDate(dateStr) {
  if (!dateStr) return null;
  return dayjs(dateStr).format("M/D");
}

/**
 * 任务项 — 对标原型：优先级灯 + 标题 + 日期 + 子任务指示器
 */
export default function TaskItem({ task, onToggleComplete }) {
  const [expanded, setExpanded] = useState(false);
  const [subtasks, setSubtasks] = useState([]);
  const [loadingSubtasks, setLoadingSubtasks] = useState(false);

  const isCompleted = !!task.completed_at;
  const subtaskCount = task.subtask_count || 0;
  const completedSubtaskCount = subtasks.filter((s) => s.is_completed && !s.deleted_at).length;
  const totalSubtaskCount = subtasks.filter((s) => !s.deleted_at).length || subtaskCount;

  const handleToggleExpand = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && subtasks.length === 0 && subtaskCount > 0) {
      setLoadingSubtasks(true);
      try {
        const res = await api.tasks.subtasks.list(task.id);
        setSubtasks(res.data);
      } catch (err) {
        console.error("加载子任务失败:", err);
      } finally {
        setLoadingSubtasks(false);
      }
    }
  };

  const dateLabel = task.due_date ? fmtDate(task.due_date) : task.planned_end ? fmtDate(task.planned_end) : null;

  return (
    <Box>
      {/* 主体行：优先级灯 + 标题 + 日期 + 子任务/展开 */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.75,
          py: 0.5,
          px: 0.75,
          borderRadius: 1,
          bgcolor: "grey.50",
          mb: 0.5,
          cursor: "grab",
        }}
      >
        {/* 勾选框 */}
        <Box
          onClick={(e) => { e.stopPropagation(); onToggleComplete(task); }}
          sx={{
            width: 14,
            height: 14,
            borderRadius: "3px",
            border: "0.5px solid",
            borderColor: "text.disabled",
            flexShrink: 0,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            color: "white",
            bgcolor: isCompleted ? "#52c41a" : "transparent",
            "&:hover": { borderColor: "primary.main" },
          }}
        >
          {isCompleted && "✓"}
        </Box>

        {/* 优先级灯 */}
        <PriorityChip priority={task.priority} />

        {/* 标题 */}
        <Typography
          variant="body2"
          sx={{
            flex: 1,
            fontSize: 12,
            fontWeight: 500,
            textDecoration: isCompleted ? "line-through" : "none",
            color: isCompleted ? "text.disabled" : "text.primary",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {task.title}
        </Typography>

        {/* 日期 */}
        {dateLabel && (
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11, flexShrink: 0 }}>
            {dateLabel}
          </Typography>
        )}

        {/* 子任务指示器 */}
        {totalSubtaskCount > 0 ? (
          <Tooltip title={`${completedSubtaskCount || 0}/${totalSubtaskCount}`}>
            <Typography
              onClick={(e) => { e.stopPropagation(); handleToggleExpand(); }}
              sx={{ fontSize: 12, color: "#1565C0", cursor: "pointer", flexShrink: 0, userSelect: "none" }}
            >
              📋
            </Typography>
          </Tooltip>
        ) : (
          <Typography
            onClick={(e) => { e.stopPropagation(); handleToggleExpand(); }}
            sx={{
              fontSize: 10,
              color: "text.disabled",
              cursor: "pointer",
              flexShrink: 0,
              transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 0.15s",
              userSelect: "none",
            }}
          >
            ▶
          </Typography>
        )}
      </Box>

      {/* 子任务展开面板 */}
      <Collapse in={expanded}>
        <Box sx={{ pl: 4, pr: 1, pb: 0.5 }}>
          {loadingSubtasks ? (
            <CircularProgress size={16} sx={{ my: 1 }} />
          ) : (
            <SubtaskList
              taskId={task.id}
              subtasks={subtasks}
              onSubtasksChange={setSubtasks}
            />
          )}
        </Box>
      </Collapse>
    </Box>
  );
}
