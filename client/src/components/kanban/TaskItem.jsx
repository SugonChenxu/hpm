import { useState, useEffect } from "react";
import { Box, Typography, IconButton, Collapse, CircularProgress } from "@mui/material";
import {
  ExpandMore,
  CheckCircleOutline,
  RadioButtonUnchecked,
} from "@mui/icons-material";
import PriorityChip from "./PriorityChip";
import SubtaskList from "./SubtaskList";
import api from "../../api/client";

/**
 * 任务项容器 — 标题行 + 展开子任务 + 完成切换
 *
 * @param {Object} props
 * @param {Object} props.task - 任务对象
 * @param {Function} props.onToggleComplete - (task) => Promise，切换完成状态
 * @param {Object} [props.dragHandleProps] - 拖拽手柄 props（来自 @dnd-kit）
 */
export default function TaskItem({ task, onToggleComplete, dragHandleProps }) {
  const [expanded, setExpanded] = useState(false);
  const [subtasks, setSubtasks] = useState([]);
  const [loadingSubtasks, setLoadingSubtasks] = useState(false);
  const [toggling, setToggling] = useState(false);

  const isCompleted = !!task.completed_at;

  const handleToggleExpand = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && subtasks.length === 0 && (task.subtask_count > 0 || task.subtask_count === undefined)) {
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

  const handleToggleComplete = async () => {
    setToggling(true);
    try {
      await onToggleComplete(task);
    } finally {
      setToggling(false);
    }
  };

  const completedSubtaskCount = subtasks.filter((s) => s.is_completed && !s.deleted_at).length;
  const totalSubtaskCount = subtasks.filter((s) => !s.deleted_at).length;

  return (
    <Box>
      {/* 标题行 */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          py: 0.5,
        }}
      >
        {/* 拖拽手柄 */}
        {dragHandleProps && (
          <Box
            {...dragHandleProps}
            sx={{
              cursor: "grab",
              display: "flex",
              alignItems: "center",
              color: "text.disabled",
              "&:active": { cursor: "grabbing" },
              px: 0.25,
            }}
          >
            <Typography sx={{ fontSize: "0.85rem", lineHeight: 1, letterSpacing: "-2px", userSelect: "none" }}>
              ⠿
            </Typography>
          </Box>
        )}

        {/* 展开箭头 */}
        <IconButton
          size="small"
          onClick={handleToggleExpand}
          sx={{
            p: 0.25,
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.2s",
            flexShrink: 0,
          }}
        >
          <ExpandMore sx={{ fontSize: 18 }} />
        </IconButton>

        {/* 完成按钮 */}
        <IconButton
          size="small"
          onClick={handleToggleComplete}
          disabled={toggling}
          sx={{ p: 0.25, flexShrink: 0 }}
        >
          {toggling ? (
            <CircularProgress size={18} />
          ) : isCompleted ? (
            <CheckCircleOutline sx={{ fontSize: 18, color: "success.main" }} />
          ) : (
            <RadioButtonUnchecked sx={{ fontSize: 18, color: "text.disabled" }} />
          )}
        </IconButton>

        {/* 优先级 */}
        <PriorityChip priority={task.priority} />

        {/* 标题 */}
        <Typography
          variant="body2"
          sx={{
            flex: 1,
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

        {/* 子任务计数 */}
        {totalSubtaskCount > 0 && (
          <Typography variant="caption" color="text.disabled" sx={{ flexShrink: 0, ml: 0.5 }}>
            {completedSubtaskCount}/{totalSubtaskCount}
          </Typography>
        )}
      </Box>

      {/* 子任务展开面板 */}
      <Collapse in={expanded}>
        <Box sx={{ pl: 8, pr: 1, pb: 0.5 }}>
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
