import { useState, useRef } from "react";
import { Box, Typography, Collapse, CircularProgress, Tooltip, TextField } from "@mui/material";
import PriorityChip, { nextPriority, PRIORITY_MAP } from "./PriorityChip";
import SubtaskList from "./SubtaskList";
import api from "../../api/client";
import dayjs from "dayjs";

function fmtDate(dateStr) {
  if (!dateStr) return null;
  return dayjs(dateStr).format("M/D");
}

/**
 * 任务项 — 状态灯可切换 + 标题可编辑
 */
export default function TaskItem({ task, onToggleComplete, onTaskUpdate }) {
  const [expanded, setExpanded] = useState(false);
  const [subtasks, setSubtasks] = useState([]);
  const [loadingSubtasks, setLoadingSubtasks] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(task.title || "");
  const titleInputRef = useRef(null);
  const [localPriority, setLocalPriority] = useState(null);

  const isCompleted = !!task.completed_at;
  const displayPriority = localPriority || task.priority || "low";
  const priorityColor = PRIORITY_MAP[displayPriority]?.color || "#16A34A";
  const isHighPriority = displayPriority === "urgent" || displayPriority === "high";
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
      } catch (err) { /* ignore */ }
      finally { setLoadingSubtasks(false); }
    }
  };

  /** 点击状态灯切换优先级（乐观更新） */
  const handlePriorityClick = async (e) => {
    e.stopPropagation();
    const newPri = nextPriority(displayPriority);
    setLocalPriority(newPri);
    try {
      await api.tasks.update(task.id, { priority: newPri });
      if (onTaskUpdate) onTaskUpdate(task.id, { priority: newPri });
    } catch { setLocalPriority(null); }
  };

  /** 保存标题 */
  const handleSaveTitle = async () => {
    const trimmed = titleValue.trim();
    if (!trimmed || trimmed === task.title) { setEditingTitle(false); return; }
    try {
      await api.tasks.update(task.id, { title: trimmed });
      if (onTaskUpdate) onTaskUpdate(task.id, { title: trimmed });
    } catch { /* ignore */ }
    setEditingTitle(false);
  };

  const dateLabel = task.due_date ? fmtDate(task.due_date) : task.planned_end ? fmtDate(task.planned_end) : null;

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.75,
          py: 0.5,
          px: 0.75,
          borderRadius: 1,
          bgcolor: "grey.100",
          mb: 0.5,
          cursor: "grab",
        }}
      >
        {/* 优先级灯（左侧，可点击切换） */}
        <PriorityChip priority={displayPriority} onClick={handlePriorityClick} />

        {/* 标题（可编辑） */}
        {editingTitle ? (
          <TextField
            inputRef={titleInputRef}
            size="small"
            variant="standard"
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={handleSaveTitle}
            onKeyDown={(e) => { if (e.key === "Enter") handleSaveTitle(); if (e.key === "Escape") setEditingTitle(false); }}
            autoFocus
            sx={{ flex: 1, "& .MuiInput-input": { fontSize: 12, fontWeight: 500, py: 0 } }}
          />
        ) : (
          <Typography
            variant="body2"
            onClick={() => { setTitleValue(task.title || ""); setTimeout(() => titleInputRef.current?.focus(), 0); setEditingTitle(true); }}
            sx={{
              flex: 1,
              fontSize: 12,
              fontWeight: isHighPriority ? 600 : 500,
              textDecoration: isCompleted ? "line-through" : "none",
              color: isCompleted ? "text.disabled" : (isHighPriority ? priorityColor : "text.primary"),
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              cursor: "text",
            }}
          >
            {task.title}
          </Typography>
        )}

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
              sx={{ fontSize: 12, color: "primary.main", cursor: "pointer", flexShrink: 0, userSelect: "none" }}
            >📋</Typography>
          </Tooltip>
        ) : (
          <Typography
            onClick={(e) => { e.stopPropagation(); handleToggleExpand(); }}
            sx={{ fontSize: 10, color: "text.disabled", cursor: "pointer", flexShrink: 0, userSelect: "none",
              transform: expanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}
          >▶</Typography>
        )}

        {/* 完成勾选框（右侧） */}
        <Box
          onClick={(e) => { e.stopPropagation(); onToggleComplete(task); }}
          sx={{
            width: 14, height: 14, borderRadius: "3px",
            border: "0.5px solid", borderColor: "text.disabled",
            flexShrink: 0, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, color: "white",
            bgcolor: isCompleted ? "#16A34A" : "transparent",
            "&:hover": { borderColor: "primary.main" },
          }}
        >{isCompleted && "✓"}</Box>
      </Box>

      <Collapse in={expanded}>
        <Box sx={{ pl: 4, pr: 1, pb: 0.5 }}>
          {loadingSubtasks ? (
            <CircularProgress size={16} sx={{ my: 1 }} />
          ) : (
            <SubtaskList taskId={task.id} subtasks={subtasks} onSubtasksChange={setSubtasks} />
          )}
        </Box>
      </Collapse>
    </Box>
  );
}
