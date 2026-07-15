import { useState, useEffect } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, List, ListItemButton, ListItemIcon, ListItemText,
  Checkbox, Alert, Typography,
} from "@mui/material";
import { detectCycle } from "../../utils/schedule-date";

/**
 * 前置任务多选对话框
 * 列出当前项目所有排期任务（排除自身和会导致环的任务）
 */
export default function PredecessorDialog({
  open,
  task,
  tasks,
  onClose,
  onSave,
}) {
  const [selected, setSelected] = useState([]);
  const [cycleWarning, setCycleWarning] = useState("");

  // 初始化选中状态
  useEffect(() => {
    if (task) {
      let preds = [];
      try {
        preds = JSON.parse(task.predecessor_ids || "[]");
      } catch {
        preds = [];
      }
      setSelected(preds);
      setCycleWarning("");
    }
  }, [task, open]);

  if (!task) return null;

  // 排除自身
  const candidates = tasks.filter((t) => t.id !== task.id);

  const handleToggle = (candidateId) => {
    setCycleWarning("");
    let newSelected;
    if (selected.includes(candidateId)) {
      newSelected = selected.filter((id) => id !== candidateId);
    } else {
      newSelected = [...selected, candidateId];
    }

    // 循环依赖检测
    if (detectCycle(tasks, task.id, newSelected)) {
      setCycleWarning("此选择会产生循环依赖，无法保存");
      return;
    }

    setSelected(newSelected);
  };

  const handleSave = () => {
    onSave(task.id, selected);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        前置任务设置 — {task.name || "未命名任务"}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          选择一个或多个前置任务。当前任务开始日期将设为所有前置任务的最晚结束日期 + 1 天。
        </Typography>

        {cycleWarning && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {cycleWarning}
          </Alert>
        )}

        {candidates.length === 0 ? (
          <Typography color="text.secondary">暂无其他任务可选</Typography>
        ) : (
          <List dense>
            {candidates.map((c) => (
              <ListItemButton key={c.id} onClick={() => handleToggle(c.id)} dense>
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <Checkbox
                    edge="start"
                    checked={selected.includes(c.id)}
                    tabIndex={-1}
                    disableRipple
                    size="small"
                  />
                </ListItemIcon>
                <ListItemText
                  primary={`${c.task_type === "节点任务" ? "◆ " : ""}${c.name || "（未命名）"}`}
                  secondary={`${c.task_type} · 结束: ${c.planned_end || "-"} · 工期: ${c.duration_days}天`}
                />
              </ListItemButton>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={!!cycleWarning}
        >
          确认
        </Button>
      </DialogActions>
    </Dialog>
  );
}
