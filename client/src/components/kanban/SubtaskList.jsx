import { useState, useRef, useEffect } from "react";
import { Box, TextField, Typography } from "@mui/material";
import SubtaskItem from "./SubtaskItem";
import api from "../../api/client";

/**
 * 子任务列表容器
 *
 * @param {Object} props
 * @param {number} props.taskId - 所属任务 ID
 * @param {Array} props.subtasks - 子任务数组
 * @param {Function} props.onSubtasksChange - (newSubtasks) => void，更新父组件子任务列表
 */
export default function SubtaskList({ taskId, subtasks, onSubtasksChange }) {
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const inputRef = useRef(null);

  // 自动聚焦输入框
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [subtasks.length]);

  const handleAdd = async () => {
    const trimmed = newTitle.trim();
    if (!trimmed || adding) return;

    setAdding(true);
    // 乐观插入：使用临时 ID
    const tempId = `temp-${Date.now()}`;
    const optimisticSubtask = {
      id: tempId,
      task_id: taskId,
      title: trimmed,
      is_completed: 0,
      sort_order: subtasks.length,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
    };

    const prevSubtasks = [...subtasks];
    onSubtasksChange([...subtasks, optimisticSubtask]);
    setNewTitle("");

    try {
      const res = await api.tasks.subtasks.create(taskId, { title: trimmed });
      // 用服务端数据替换乐观条目
      onSubtasksChange((prev) => prev.map((s) => (s.id === tempId ? res.data : s)));
    } catch (err) {
      // 回滚
      onSubtasksChange(prevSubtasks);
      console.error("添加子任务失败:", err);
    } finally {
      setAdding(false);
      // 保持光标在输入框
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }
  };

  const handleToggle = async (subtask) => {
    const prevSubtasks = [...subtasks];
    // 乐观更新
    onSubtasksChange(
      subtasks.map((s) =>
        s.id === subtask.id ? { ...s, is_completed: s.is_completed ? 0 : 1 } : s
      )
    );
    try {
      await api.tasks.subtasks.update(subtask.id, {
        is_completed: subtask.is_completed ? 0 : 1,
      });
    } catch (err) {
      // 回滚
      onSubtasksChange(prevSubtasks);
      console.error("切换子任务状态失败:", err);
    }
  };

  const handleDelete = async (subtaskId) => {
    const prevSubtasks = [...subtasks];
    // 乐观删除
    onSubtasksChange(subtasks.filter((s) => s.id !== subtaskId));
    try {
      await api.tasks.subtasks.remove(subtaskId);
    } catch (err) {
      // 回滚
      onSubtasksChange(prevSubtasks);
      console.error("删除子任务失败:", err);
    }
  };

  const activeSubtasks = subtasks.filter((s) => s.deleted_at === null);
  const completedCount = activeSubtasks.filter((s) => s.is_completed).length;

  return (
    <Box sx={{ mt: 1 }}>
      {/* 进度提示 */}
      {activeSubtasks.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
          子任务 ({completedCount}/{activeSubtasks.length})
        </Typography>
      )}

      {/* 子任务列表 */}
      {activeSubtasks.map((s) => (
        <SubtaskItem
          key={s.id}
          subtask={s}
          onToggle={handleToggle}
          onDelete={handleDelete}
        />
      ))}

      {/* 快速录入 */}
      <TextField
        inputRef={inputRef}
        size="small"
        fullWidth
        placeholder="添加子任务，回车确认"
        value={newTitle}
        onChange={(e) => setNewTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleAdd();
          }
        }}
        disabled={adding}
        sx={{
          mt: 0.5,
          "& .MuiInputBase-root": { fontSize: "0.8rem" },
          "& .MuiInputBase-input": { py: 0.5 },
        }}
      />
    </Box>
  );
}
