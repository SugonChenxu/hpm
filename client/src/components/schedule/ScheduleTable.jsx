import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import {
  Box, TextField, Chip, Typography, Button, Popover,
  Checkbox, List, ListItemButton, ListItemIcon, ListItemText,
  Card, IconButton, Tooltip,
} from "@mui/material";
import {
  ExpandMore, ChevronRight, Today, Circle,
} from "@mui/icons-material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import { calcCompletionStatus, updateStartDate, updateEndDate, updateDuration, detectCycle } from "../../utils/schedule-date";

/**
 * 排期表 — 类 Excel 可编辑表格（支持树形层级展示）
 * 任务名称列根据 depth 字段显示缩进与树形连接线
 */

const INDENT_WIDTH = 24;

// ==============================
// 列宽配置（可拖拽调整）
// ==============================
const DEFAULT_COL_WIDTHS = {
  order: 60,
  name: 200,
  start: 140,
  end: 140,
  duration: 80,
  status: 100,
  predecessors: 130,
  notes: 160,
};

// ==============================
// 表格样式
// ==============================
const thStyle = (width) => ({
  width,
  padding: "8px 10px",
  textAlign: "left",
  fontWeight: 600,
  fontSize: "0.8rem",
  borderBottom: "2px solid #BDBDBD",
  whiteSpace: "nowrap",
  position: "sticky",
  top: 0,
  backgroundColor: "#F5F5F5",
  zIndex: 1,
  userSelect: "none",
});

const tdStyle = (align) => ({
  padding: "2px 6px",
  textAlign: align || "left",
  fontSize: "0.8rem",
  borderBottom: "1px solid #e8e8e8",
});

export default function ScheduleTable({ tasks, projectId, onContextMenu, onTaskUpdate, onPredecessorSave, onBgColorSave, predTriggerTaskId, onPredTriggerHandled }) {
  // ===================== 状态 =====================
  const [editCell, setEditCell] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [collapsedPhases, setCollapsedPhases] = useState(new Set());
  const [colWidths, setColWidths] = useState({ ...DEFAULT_COL_WIDTHS });

  // 前置任务 Popover
  const [predPopover, setPredPopover] = useState(null);
  const [predSelected, setPredSelected] = useState([]);
  const [predCycleWarn, setPredCycleWarn] = useState("");

  // 外部触发前置任务 Popover（从右键菜单）
  useEffect(() => {
    if (predTriggerTaskId) {
      const task = tasks.find(t => t.id === predTriggerTaskId);
      if (task) {
        savedScrollY.current = window.scrollY;
        let preds = [];
        try { preds = JSON.parse(task.predecessor_ids || "[]"); } catch { preds = []; }
        setPredSelected(preds);
        setPredCycleWarn("");
        // 由于没有 anchor element，使用 null 并设置 virtual anchor
        setPredPopover({ anchor: null, task, virtual: true });
        if (onPredTriggerHandled) onPredTriggerHandled();
      }
    }
  }, [predTriggerTaskId, tasks, onPredTriggerHandled]);

  // 滚动位置保存
  const savedScrollY = useRef(0);

  // 列宽拖拽
  const resizingCol = useRef(null);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);

  // ===================== 折叠状态 =====================
  const toggleCollapse = useCallback((taskId) => {
    setCollapsedPhases(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }, []);

  // 计算可见任务列表（折叠隐藏子任务）
  const visibleTasks = useMemo(() => {
    const hidden = new Set();
    for (const task of tasks) {
      if (task.task_type === "阶段任务" && collapsedPhases.has(task.id)) {
        // 收集该阶段所有子孙任务
        const collectDescendants = (parentId) => {
          for (const t of tasks) {
            if (t.parent_id === parentId) {
              hidden.add(t.id);
              collectDescendants(t.id);
            }
          }
        };
        collectDescendants(task.id);
      }
    }
    return tasks.filter(t => !hidden.has(t.id));
  }, [tasks, collapsedPhases]);

  // 可见任务列表中的序号（数组 index + 1）
  const visibleIndexMap = useMemo(() => {
    const map = new Map();
    visibleTasks.forEach((t, i) => {
      map.set(t.id, i + 1);
    });
    return map;
  }, [visibleTasks]);

  // ===================== 编辑逻辑 =====================
  const handleStartEdit = useCallback((taskId, field, currentValue) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    if (task.is_locked === 1 || task.task_type === "节点任务") {
      if (field === "planned_start" || field === "planned_end" || field === "duration_days") return;
    }
    if (task.task_type === "阶段任务") {
      if (field === "planned_start" || field === "planned_end" || field === "duration_days") return;
    }
    savedScrollY.current = window.scrollY;
    setEditCell({ taskId, field });
    setEditValue(currentValue != null ? String(currentValue) : "");
  }, [tasks]);

  const handleSaveEdit = useCallback(async () => {
    if (!editCell) return;
    const { taskId, field } = editCell;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) { setEditCell(null); return; }

    if (field === "name" && !editValue.trim()) { setEditCell(null); return; }

    let updateData = {};

    if (field === "name") {
      updateData = { name: editValue };
    } else if (field === "notes") {
      updateData = { notes: editValue };
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
      } catch { /* handled in parent */ }
    }
    // 恢复滚动位置
    window.scrollTo(0, savedScrollY.current);
  }, [editCell, editValue, tasks, onTaskUpdate]);

  const handleDateSave = useCallback(async (taskId, field, newDate) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    savedScrollY.current = window.scrollY;

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
      } catch { /* handled in parent */ }
    }
    window.scrollTo(0, savedScrollY.current);
  }, [tasks, onTaskUpdate]);

  // ===================== 前置任务 Popover =====================
  const handlePredClick = useCallback((e, task) => {
    savedScrollY.current = window.scrollY;
    let preds = [];
    try { preds = JSON.parse(task.predecessor_ids || "[]"); } catch { preds = []; }
    setPredSelected(preds);
    setPredCycleWarn("");
    setPredPopover({ anchor: e.currentTarget, task });
  }, []);

  const handlePredToggle = useCallback((candidateId) => {
    const task = predPopover?.task;
    if (!task) return;
    setPredCycleWarn("");
    let newSelected;
    if (predSelected.includes(candidateId)) {
      newSelected = predSelected.filter(id => id !== candidateId);
    } else {
      newSelected = [...predSelected, candidateId];
    }
    if (detectCycle(tasks, task.id, newSelected)) {
      setPredCycleWarn("此选择会产生循环依赖");
      return;
    }
    setPredSelected(newSelected);
  }, [predSelected, predPopover, tasks]);

  const handlePredClose = useCallback(() => {
    setPredPopover(null);
    window.scrollTo(0, savedScrollY.current);
  }, []);

  const handlePredSave = useCallback(async () => {
    const task = predPopover?.task;
    if (!task) return;
    try {
      await onPredecessorSave(task.id, predSelected);
    } catch { /* handled in parent */ }
    setPredPopover(null);
    window.scrollTo(0, savedScrollY.current);
  }, [predPopover, predSelected, onPredecessorSave]);

  // ===================== 列宽拖拽 =====================
  const handleResizeStart = useCallback((colKey, e) => {
    e.preventDefault();
    resizingCol.current = colKey;
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = colWidths[colKey];
    document.addEventListener("mousemove", handleResizeMove);
    document.addEventListener("mouseup", handleResizeEnd);
  }, [colWidths]);

  const handleResizeMove = useCallback((e) => {
    if (!resizingCol.current) return;
    const delta = e.clientX - resizeStartX.current;
    const newWidth = Math.max(40, resizeStartWidth.current + delta);
    setColWidths(prev => ({ ...prev, [resizingCol.current]: newWidth }));
  }, []);

  const handleResizeEnd = useCallback(() => {
    resizingCol.current = null;
    document.removeEventListener("mousemove", handleResizeMove);
    document.removeEventListener("mouseup", handleResizeEnd);
  }, [handleResizeMove]);

  // ===================== 渲染辅助 =====================
  const renderPredecessors = (task) => {
    let preds = [];
    try { preds = JSON.parse(task.predecessor_ids || "[]"); } catch { preds = []; }
    if (preds.length === 0) return "-";
    return preds
      .map((pid) => {
        const p = tasks.find((t) => t.id === pid);
        return p ? (p.name.length > 6 ? p.name.slice(0, 6) + "…" : p.name) : `#${pid}`;
      })
      .join("、");
  };

  const renderStatusChip = (task) => {
    const status = calcCompletionStatus(task);
    if (status === "已完成") {
      return <Chip label="已完成" size="small" variant="outlined" color="default" sx={{ opacity: 0.6 }} />;
    }
    if (status === "进行中") {
      return <Chip label="进行中" size="small" variant="outlined" color="primary" />;
    }
    return <Chip label="未开始" size="small" variant="outlined" />;
  };

  // 计算行背景色（含继承）
  const getBgColor = useCallback((task) => {
    if (task.bg_color) return task.bg_color;
    if (task.parent_id) {
      const parent = tasks.find(t => t.id === task.parent_id);
      if (parent) return parent.bg_color || getBgColor(parent) || "";
    }
    return "";
  }, [tasks]);

  const getRowStyle = (task) => {
    const status = calcCompletionStatus(task);
    const style = {};
    if (status === "已完成") style.opacity = 0.45;
    const bg = getBgColor(task);
    if (bg) style.backgroundColor = bg;
    return style;
  };

  const renderTaskName = (task, depth) => {
    const isEditing = editCell?.taskId === task.id && editCell?.field === "name";
    const isPhase = task.task_type === "阶段任务";

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
            if (e.key === "Escape") { setEditCell(null); window.scrollTo(0, savedScrollY.current); }
          }}
          sx={{ width: "100%", minWidth: 60, ml: `${depth * INDENT_WIDTH}px` }}
          InputProps={{ disableUnderline: false }}
        />
      );
    }

    const indentPadding = depth * INDENT_WIDTH;
    const isCollapsed = collapsedPhases.has(task.id);

    return (
      <Box
        onClick={() => handleStartEdit(task.id, "name", task.name)}
        sx={{
          cursor: "pointer",
          minHeight: 28,
          display: "flex",
          alignItems: "center",
          px: 0.5,
          pl: `${indentPadding + 4}px`,
          fontWeight: isPhase ? 700 : 400,
          "&:hover": { bgcolor: "action.hover" },
        }}
      >
        {isPhase && (
          <IconButton
            size="small"
            onClick={(e) => { e.stopPropagation(); toggleCollapse(task.id); }}
            sx={{ p: 0, mr: 0.5, minWidth: 18 }}
          >
            {isCollapsed ? <ChevronRight fontSize="small" /> : <ExpandMore fontSize="small" />}
          </IconButton>
        )}
        {!isPhase && depth > 0 && (
          <Typography component="span" sx={{ mr: 0.5, color: "text.secondary", fontSize: "0.75rem" }}>
            └
          </Typography>
        )}
        {task.task_type === "节点任务" && (
          <Typography component="span" sx={{ mr: 0.5, color: "warning.main", fontSize: "0.75rem" }}>
            ◆
          </Typography>
        )}
        {task.name || "（点击编辑）"}
      </Box>
    );
  };

  const renderCell = (task, field, displayValue, type = "text") => {
    const isEditing = editCell?.taskId === task.id && editCell?.field === field;

    if (isEditing && (type === "text" || type === "notes")) {
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
            if (e.key === "Escape") { setEditCell(null); window.scrollTo(0, savedScrollY.current); }
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
            if (e.key === "Escape") { setEditCell(null); window.scrollTo(0, savedScrollY.current); }
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
          onClose={() => { setEditCell(null); window.scrollTo(0, savedScrollY.current); }}
          dayOfWeekFormatter={(day) => day}
          slotProps={{
            textField: {
              size: "small",
              variant: "standard",
              sx: { width: 120 },
            },
            layout: { sx: { fontSize: "0.875rem" } },
          }}
        />
      );
    }

    // 日期显示 —— 添加「今天」快捷按钮
    if (type === "date") {
      return (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 0.5,
            cursor: "pointer",
            minHeight: 28,
            "&:hover": { bgcolor: "action.hover" },
          }}
        >
          <Typography
            variant="body2"
            onClick={() => handleStartEdit(task.id, field, displayValue)}
            sx={{ cursor: "pointer", flex: 1, textAlign: "center" }}
          >
            {displayValue}
          </Typography>
          <Tooltip title="设为今天">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                savedScrollY.current = window.scrollY;
                handleDateSave(task.id, field, dayjs().format("YYYY-MM-DD"));
              }}
              sx={{ p: 0, minWidth: 20, opacity: 0.4, "&:hover": { opacity: 1 } }}
            >
              <Today fontSize="inherit" sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        </Box>
      );
    }

    // 前置任务列 — 可点击打开 Popover
    if (field === "predecessors") {
      return (
        <Box
          onClick={(e) => handlePredClick(e, task)}
          sx={{
            cursor: "pointer",
            minHeight: 28,
            display: "flex",
            alignItems: "center",
            px: 0.5,
            "&:hover": { bgcolor: "action.hover" },
            fontSize: "0.8rem",
          }}
        >
          {renderPredecessors(task)}
        </Box>
      );
    }

    return (
      <Box
        onClick={() => {
          if (type !== "readonly") handleStartEdit(task.id, field, displayValue);
        }}
        sx={{
          cursor: type !== "readonly" ? "pointer" : "default",
          minHeight: 28,
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

  // ===================== 列头渲染 =====================
  const renderHeader = (colKey, label, width) => (
    <th
      style={{
        ...thStyle(`${width}px`),
        position: "relative",
      }}
    >
      {label}
      <Box
        component="span"
        onMouseDown={(e) => handleResizeStart(colKey, e)}
        sx={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: 6,
          cursor: "col-resize",
          "&:hover": { bgcolor: "primary.light" },
          zIndex: 2,
        }}
      />
    </th>
  );

  // ===================== 空状态 =====================
  if (visibleTasks.length === 0 && tasks.length === 0) {
    return (
      <Card elevation={1} sx={{ borderRadius: 2, p: 6, textAlign: "center", bgcolor: "#FAFBFC" }}>
        <Typography variant="h6" color="text.secondary" gutterBottom>
          📋 该项目的排期数据为空
        </Typography>
        <Typography variant="body2" color="text.secondary">
          请点击「从模板生成」创建排期计划
        </Typography>
      </Card>
    );
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="zh-cn">
      <Card elevation={1} sx={{ borderRadius: 2, overflow: "hidden" }}>
        <Box sx={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              minWidth: Object.values(colWidths).reduce((a, b) => a + b, 0),
              tableLayout: "fixed",
            }}
          >
            <colgroup>
              {Object.entries(colWidths).map(([key, w]) => (
                <col key={key} style={{ width: `${w}px` }} />
              ))}
            </colgroup>
            <thead>
              <tr style={{ backgroundColor: "#F5F5F5" }}>
                {renderHeader("order", "序号", colWidths.order)}
                {renderHeader("name", "任务名称", colWidths.name)}
                {renderHeader("start", "开始时间", colWidths.start)}
                {renderHeader("end", "完成时间", colWidths.end)}
                {renderHeader("duration", "工期", colWidths.duration)}
                {renderHeader("status", "完成情况", colWidths.status)}
                {renderHeader("predecessors", "前置任务", colWidths.predecessors)}
                {renderHeader("notes", "备注", colWidths.notes)}
              </tr>
            </thead>
            <tbody>
              {visibleTasks.map((task, idx) => {
                const depth = task.depth || 0;
                const isPhase = task.task_type === "阶段任务";
                const isNode = task.task_type === "节点任务";
                const seqNum = idx + 1;

                let rowBg = "transparent";
                if (isPhase) rowBg = "#E8F0FE";
                else if (isNode) rowBg = "#FFF8E1";
                const customBg = getBgColor(task);
                if (customBg) rowBg = customBg;

                return (
                  <tr
                    key={task.id}
                    style={{
                      ...getRowStyle(task),
                      backgroundColor: rowBg,
                      borderBottom: "1px solid #e0e0e0",
                    }}
                    onContextMenu={(e) => onContextMenu(e, task)}
                    className="schedule-row"
                  >
                    <td style={tdStyle("center")}>
                      {isNode ? (
                        <Typography component="span" sx={{ color: "warning.main", fontSize: "0.75rem" }}>◆</Typography>
                      ) : (
                        <Typography variant="body2" fontWeight={isPhase ? 700 : 400}>
                          {seqNum}
                        </Typography>
                      )}
                    </td>
                    <td style={tdStyle("left")}>
                      {renderTaskName(task, depth)}
                    </td>
                    <td style={tdStyle("center")}>
                      {renderCell(task, "planned_start", task.planned_start || "-", "date")}
                    </td>
                    <td style={tdStyle("center")}>
                      {renderCell(task, "planned_end", task.planned_end || "-", "date")}
                    </td>
                    <td style={tdStyle("center")}>
                      {renderCell(task, "duration_days", task.duration_days || 1, "number")}
                    </td>
                    <td style={tdStyle("center")}>
                      {renderStatusChip(task)}
                    </td>
                    <td style={tdStyle("left")}>
                      {renderCell(task, "predecessors", "", "readonly")}
                    </td>
                    <td style={tdStyle("left")}>
                      {renderCell(task, "notes", task.notes || "", "notes")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Box>
      </Card>

      {/* 前置任务 Popover */}
      <Popover
        open={Boolean(predPopover)}
        anchorEl={predPopover?.virtual ? null : predPopover?.anchor}
        anchorReference={predPopover?.virtual ? "anchorPosition" : "anchorEl"}
        anchorPosition={predPopover?.virtual ? { top: (typeof window !== "undefined" ? window.scrollY : 0) + 200, left: 400 } : undefined}
        onClose={handlePredClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{ paper: { sx: { maxHeight: 400 } } }}
      >
        <Box sx={{ p: 2, minWidth: 280 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            前置任务设置 — {predPopover?.task?.name || ""}
          </Typography>
          {predCycleWarn && (
            <Typography color="error" variant="caption" sx={{ display: "block", mb: 1 }}>
              {predCycleWarn}
            </Typography>
          )}
          <List dense sx={{ maxHeight: 250, overflow: "auto" }}>
            {tasks
              .filter(t => t.id !== predPopover?.task?.id)
              .map((c) => (
                <ListItemButton key={c.id} onClick={() => handlePredToggle(c.id)} dense>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <Checkbox
                      edge="start"
                      checked={predSelected.includes(c.id)}
                      size="small"
                      tabIndex={-1}
                    />
                  </ListItemIcon>
                  <ListItemText
                    primary={c.name || "（未命名）"}
                    secondary={`${c.task_type} · ${c.planned_end || "-"}`}
                  />
                </ListItemButton>
              ))}
          </List>
          <Box sx={{ display: "flex", gap: 1, mt: 1, justifyContent: "flex-end" }}>
            <Button size="small" onClick={handlePredClose}>取消</Button>
            <Button size="small" variant="contained" onClick={handlePredSave} disabled={!!predCycleWarn}>
              确定
            </Button>
          </Box>
        </Box>
      </Popover>
    </LocalizationProvider>
  );
}
