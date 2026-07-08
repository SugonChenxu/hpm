import { useState } from "react";
import { Box, Checkbox, Typography, IconButton, CircularProgress } from "@mui/material";
import { DeleteOutline } from "@mui/icons-material";

/**
 * 单个子任务行
 *
 * @param {Object} props
 * @param {Object} props.subtask - {id, title, is_completed, sort_order}
 * @param {Function} props.onToggle - (subtask) => Promise，切换完成状态
 * @param {Function} props.onDelete - (subtaskId) => Promise，删除子任务
 */
export default function SubtaskItem({ subtask, onToggle, onDelete }) {
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    setLoading(true);
    try {
      await onToggle(subtask);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      await onDelete(subtask.id);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        py: 0.25,
        px: 0.5,
        borderRadius: 1,
        "&:hover": { bgcolor: "action.hover" },
        "&:hover .delete-btn": { opacity: 1 },
      }}
    >
      {loading ? (
        <CircularProgress size={16} sx={{ flexShrink: 0 }} />
      ) : (
        <Checkbox
          size="small"
          checked={!!subtask.is_completed}
          onChange={handleToggle}
          sx={{ p: 0.5, flexShrink: 0 }}
        />
      )}
      <Typography
        variant="body2"
        sx={{
          flex: 1,
          textDecoration: subtask.is_completed ? "line-through" : "none",
          color: subtask.is_completed ? "text.disabled" : "text.primary",
          fontSize: "0.8rem",
        }}
      >
        {subtask.title}
      </Typography>
      <IconButton
        className="delete-btn"
        size="small"
        onClick={handleDelete}
        disabled={loading}
        sx={{ opacity: 0, transition: "opacity 0.15s", p: 0.25 }}
      >
        <DeleteOutline sx={{ fontSize: 14 }} />
      </IconButton>
    </Box>
  );
}
