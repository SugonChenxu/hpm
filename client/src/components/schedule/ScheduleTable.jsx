import { useState, useCallback } from "react";
import {
  Box, TextField, Chip, Typography,
} from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";
import { calcCompletionStatus, updateStartDate, updateEndDate, updateDuration } from "../../utils/schedule-date";

/**
 * 排期表 — 类 Excel 可编辑表格（支持树形层级展示）
 * 任务名称列根据 depth 字段显示缩进与树形连接线
 */

const TASK_TYPE_COLORS = {
  "阶段任务": "#E3F2FD",
  "节点任务": "#FFF8E1",
  "普通任务": "transparent",
};

/** 根据 depth 计算缩进像素 */
const INDENT_WIDTH = 24; // 每级缩进 24px

export default function ScheduleTable({ tasks, projectId, onContextMenu, onTaskUpdate }) {
  // 编辑状态: { taskId, field }
  const [editCell, setEditCell] = useState(null);
  // 编辑中的值
  const [editValue, setEditValue] = useState("");

  // 开始编辑
  const handleStartEdit = useCallback((taskId, field, currentValue) => {
    // 节点任务特殊字段不可编辑
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    if (task.is_locked === 1 || task.task_type === "节点任务") {
      if (field === "planned_start" || field === "planned_end" || field === "duration_days") {
        return;
      }
    }
    // 阶段任务不可编辑日期/工期
    if (task.task_type === "阶段任务") {
      if (field === "planned_start" || field === "planned_end" || field === "duration_days") {
        return;
      }
    }
    setEditCell({ taskId, field });
    setEditValue(currentValue != null ? String(currentValue) : "");
  }, [tasks]);

  // 保存编辑
  const handleSaveEdit = useCallback(async () => {
    if (!editCell) return;
    const { taskId, field } = editCell;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) {
      setEditCell(null);
      return;
    }

    // 名称列空值不保存
    if (field === "name" && !editValue.trim()) {
      setEditCell(null);
      return;
    }

    let updateData = {};

    if (field === "name") {
      updateData = { name: editValue };
    } else if (field === "planned_start") {
      const d = dayjs(editValue);
      if (d.isValid()) {
        const newStart = d.format("YYYY-MM-DD");
        const updated = updateStartDate(task, newStart);
        updateData = { planned_start: updated.planned_start, planned_end: updated.planned_end };
      }
    } else if (field === "planned_end") {
      const d = dayjs(editValue);
      if (d.isValid()) {
        const newEnd = d.format("YYYY-MM-DD");
        const updated = updateEndDate(task, newEnd);
        updateData = { planned_end: updated.planned_end, duration_days: updated.duration_days };
      }
    } else if (field === "duration_days") {
      const val = parseInt(editValue, 10);
      if (!isNaN(val) && val > 0) {
        const updated = updateDuration(task, val);
        updateData = { duration_days: updated.duration_days, planned_end: updated.planned_end };
      }
    }

    setEditCell(null);
    if (Object.keys(updateData).length > 0) {
      try {
        await onTaskUpdate(taskId, updateData);
      } catch {
        // error handled in parent
      }
    }
  }, [editCell, editValue, tasks, onTaskUpdate]);

  // 日期编辑保存
  const handleDateSave = useCallback(async (taskId, field, newDate) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    let updateData = {};
    if (field === "planned_start") {
      const updated = updateStartDate(task, newDate);
      updateData = { planned_start: updated.planned_start, planned_end: updated.planned_end };
    } else if (field === "planned_end") {
      const updated = updateEndDate(task, newDate);
      updateData = { planned_end: updated.planned_end, duration_days: updated.duration_days };
    }

    setEditCell(null);
    if (Object.keys(updateData).length > 0) {
      try {
        await onTaskUpdate(taskId, updateData);
      } catch {
        // error handled in parent
      }
    }
  }, [tasks, onTaskUpdate]);

  // 渲染前置任务名称
  const renderPredecessors = (task) => {
    let preds = [];
    try {
      preds = JSON.parse(task.predecessor_ids || "[]");
    } catch {
      preds = [];
    }
    if (preds.length === 0) return "-";
    return preds
      .map((pid) => {
        const p = tasks.find((t) => t.id === pid);
        return p ? p.name : `#${pid}`;
      })
      .join("、");
  };

  // 渲染完成情况 Tag
  const renderStatusChip = (task) => {
    const status = calcCompletionStatus(task);
    if (status === "已完成") {
      return <Chip label="已完成" size="small" color="default" sx={{ opacity: 0.6 }} />;
    }
    if (status === "进行中") {
      return <Chip label="进行中" size="small" color="primary" />;
    }
    return <Chip label="未开始" size="small" variant="outlined" />;
  };

  // 行样式
  const getRowStyle = (task) => {
    const status = calcCompletionStatus(task);
    const style = {};

    if (status === "已完成") {
      style.opacity = 0.45;
    }
    if (task.task_type === "阶段任务") {
      style.fontWeight = 700;
      style.backgroundColor = TASK_TYPE_COLORS["阶段任务"];
    }
    if (task.task_type === "节点任务") {
      style.backgroundColor = TASK_TYPE_COLORS["节点任务"];
    }

    return style;
  };

  // 渲染任务名称（含树形缩进）
  const renderTaskName = (task, depth) => {
    const isEditing = editCell?.taskId === task.id && editCell?.field === "name";

    if (isEditing) {
      return (
        <TextField
          autoFocus
          size="small"
          variant="standard"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSaveEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSaveEdit();
            if (e.key === "Escape") setEditCell(null);
          }}
          sx={{ width: "100%", minWidth: 60, ml: `${depth * INDENT_WIDTH}px` }}
          InputProps={{ disableUnderline: false }}
        />
      );
    }

    const indentPadding = depth * INDENT_WIDTH;
    const prefix = depth > 0 ? "└ " : "";
    const nameText = task.name || "（点击编辑）";

    return (
      <Box
        onClick={() => handleStartEdit(task.id, "name", task.name)}
        sx={{
          cursor: "pointer",
          minHeight: 24,
          display: "flex",
          alignItems: "center",
          px: 0.5,
          pl: `${indentPadding + 4}px`,
          "&:hover": { bgcolor: "action.hover" },
        }}
      >
        {prefix}{nameText}
      </Box>
    );
  };

  // 渲染可编辑单元格
  const renderCell = (task, field, displayValue, type = "text") => {
    const isEditing = editCell?.taskId === task.id && editCell?.field === field;

    if (isEditing && type === "text") {
      return (
        <TextField
          autoFocus
          size="small"
          variant="standard"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSaveEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSaveEdit();
            if (e.key === "Escape") setEditCell(null);
          }}
          sx={{ width: "100%", minWidth: 60 }}
          InputProps={{ disableUnderline: false }}
        />
      );
    }

    if (isEditing && type === "number") {
      return (
        <TextField
          autoFocus
          size="small"
          variant="standard"
          type="number"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSaveEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSaveEdit();
            if (e.key === "Escape") setEditCell(null);
          }}
          inputProps={{ min: 1, style: { textAlign: "center" } }}
          sx={{ width: "100%", minWidth: 50 }}
        />
      );
    }

    if (isEditing && type === "date") {
      return (
        <DatePicker
          autoFocus
          value={editValue ? dayjs(editValue) : null}
          onChange={(newVal) => {
            if (newVal && newVal.isValid()) {
              handleDateSave(task.id, field, newVal.format("YYYY-MM-DD"));
            }
          }}
          onClose={() => setEditCell(null)}
          renderInput={(params) => (
            <TextField
              {...params}
              size="small"
              variant="standard"
              sx={{ width: 120 }}
            />
          )}
        />
      );
    }

    return (
      <Box
        onClick={() => {
          if (type !== "readonly") {
            handleStartEdit(task.id, field, displayValue);
          }
        }}
        sx={{
          cursor: type !== "readonly" ? "pointer" : "default",
          minHeight: 24,
          display: "flex",
          alignItems: "center",
          px: 0.5,
          "&:hover": type !== "readonly" ? { bgcolor: "action.hover" } : {},
        }}
      >
        {displayValue}
      </Box>
    );
  };

  if (tasks.length === 0) {
    return (
      <Box sx={{ textAlign: "center", py: 8, color: "text.secondary" }}>
        <Typography variant="h6">该项目的排期数据为空</Typography>
        <Typography variant="body2" sx={{ mt: 1 }}>
          请点击「从模板生成」创建排期计划
        </Typography>
      </Box>
    );
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box sx={{ overflowX: "auto", border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
          <thead>
            <tr style={{ backgroundColor: "#F5F5F5" }}>
              <th style={thStyle("60px")}>序号</th>
              <th style={thStyle("240px")}>任务名称</th>
              <th style={thStyle("130px")}>开始时间</th>
              <th style={thStyle("130px")}>完成时间</th>
              <th style={thStyle("80px")}>工期</th>
              <th style={thStyle("100px")}>完成情况</th>
              <th style={thStyle("160px")}>前置任务</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr
                key={task.id}
                style={{
                  ...getRowStyle(task),
                  borderBottom: "1px solid #e0e0e0",
                }}
                onContextMenu={(e) => onContextMenu(e, task)}
              >
                <td style={tdStyle("60px", "center")}>
                  {task.task_type === "节点任务" ? "◆" : task.task_order}
                </td>
                <td style={tdStyle("240px")}>
                  {renderTaskName(task, task.depth || 0)}
                </td>
                <td style={tdStyle("130px", "center")}>
                  {renderCell(task, "planned_start", task.planned_start || "-", "date")}
                </td>
                <td style={tdStyle("130px", "center")}>
                  {renderCell(task, "planned_end", task.planned_end || "-", "date")}
                </td>
                <td style={tdStyle("80px", "center")}>
                  {renderCell(task, "duration_days", task.duration_days || 1, "number")}
                </td>
                <td style={tdStyle("100px", "center")}>
                  {renderStatusChip(task)}
                </td>
                <td style={tdStyle("160px")}>
                  {renderPredecessors(task)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Box>
    </LocalizationProvider>
  );
}

const thStyle = (width) => ({
  width,
  padding: "8px 12px",
  textAlign: "left",
  fontWeight: 600,
  fontSize: "0.875rem",
  borderBottom: "2px solid #BDBDBD",
  whiteSpace: "nowrap",
  position: "sticky",
  top: 0,
  backgroundColor: "#F5F5F5",
  zIndex: 1,
});

const tdStyle = (width, align) => ({
  width,
  padding: "4px 8px",
  textAlign: align || "left",
  fontSize: "0.875rem",
  borderBottom: "1px solid #e0e0e0",
});
