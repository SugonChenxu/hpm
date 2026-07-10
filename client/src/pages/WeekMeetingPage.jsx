import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Box, Typography, Button, IconButton, CircularProgress, Dialog,
  DialogTitle, DialogContent, DialogActions, TextField, MenuItem,
  Tooltip, Snackbar, Alert, Popper, ClickAwayListener, Paper,
} from "@mui/material";
import { ChevronLeft, ChevronRight, Add, DeleteOutline } from "@mui/icons-material";
import api from "../api/client";

/** 6天: 周一~周六（不含周日） */
const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六"];

/** 统一槽位高度，所有卡片和格子共用 */
const SLOT_HEIGHT = 28;

const TIME_SLOTS = [];
for (let h = 9; h <= 20; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, "0")}:00`);
  TIME_SLOTS.push(`${String(h).padStart(2, "0")}:30`);
}
TIME_SLOTS.push("21:00"); // 结束边界

const TIME_OPTIONS = TIME_SLOTS.slice(0, -1); // 09:00 ~ 20:30 作为开始时间
const END_TIME_OPTIONS = TIME_SLOTS.slice(1); // 09:30 ~ 21:00 作为结束时间

/** 获取本周一日期字符串 YYYY-MM-DD */
function getMonday(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1));
  return d.toISOString().slice(0, 10);
}

/** 周一日期 → 显示范围 "7/6 - 7/11"（周一~周六） */
function weekRange(mondayStr) {
  const d = new Date(mondayStr);
  const end = new Date(d);
  end.setDate(end.getDate() + 5); // +5 = 周六
  return `${d.getMonth() + 1}/${d.getDate()} - ${end.getMonth() + 1}/${end.getDate()}`;
}

/** 时间 → 行索引(0-based, 09:00=0, 09:30=1, ...) */
function timeToSlotIndex(time) {
  const [h, m] = time.split(":").map(Number);
  return (h - 9) * 2 + (m >= 30 ? 1 : 0);
}

/** 会议卡片在 grid 中的行数(跨度) */
function meetingSpan(start, end) {
  return timeToSlotIndex(end) - timeToSlotIndex(start);
}

export default function WeekMeetingPage() {
  const [weekKey, setWeekKey] = useState(getMonday(new Date()));
  const [data, setData] = useState({ meetings: [], outputs: [], recurring: [] });
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [outputs, setOutputs] = useState({});
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" });
  const [form, setForm] = useState({ weekday: "周一", start_time: "09:00", end_time: "10:00", title: "" });

  /** 行内 Popper 新建会议状态 */
  const [popper, setPopper] = useState({
    open: false,
    anchorEl: null,
    weekday: "周一",
    startTime: "09:00",
    endTime: "10:00",
    title: "",
  });

  /** 拖拽状态 — ref 用于全局 mouseup 读取最新值，state 用于重新渲染高亮 */
  const dragRef = useRef({ active: false, day: null, startIdx: -1, endIdx: -1, anchorEl: null });
  const [dragState, setDragState] = useState({ active: false, day: null, startIdx: -1, endIdx: -1 });

  /** 防止 Popper 的 blur 和 ClickAwayListener 重复触发创建 */
  const addingRef = useRef(false);

  /** Popper 刚弹出时阻止 ClickAwayListener 关闭（mouseup 后的 click 事件会误触发） */
  const justOpenedRef = useRef(false);

  /** TextField 引用，用于延迟聚焦（替代 autoFocus） */
  const inputRef = useRef(null);

  const load = useCallback(() => {
    setLoading(true);
    api.weekMeetings.list(weekKey)
      .then((res) => {
        setData(res.data);
        const outMap = {};
        (res.data.outputs || []).forEach((o) => { outMap[o.weekday] = o.content; });
        WEEKDAYS.forEach((d) => { if (!(d in outMap)) outMap[d] = ""; });
        setOutputs(outMap);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [weekKey]);

  useEffect(() => { load(); }, [load]);

  // 所有会议(自定义 + 项目例会)
  const allMeetings = useMemo(() => {
    const custom = data.meetings.map((m) => ({ ...m, source: "custom" }));
    return [...custom, ...data.recurring];
  }, [data]);

  // 按 weekday 分组
  const meetingsByDay = useMemo(() => {
    const map = {};
    WEEKDAYS.forEach((d) => { map[d] = []; });
    allMeetings.forEach((m) => {
      if (map[m.weekday]) map[m.weekday].push(m);
    });
    return map;
  }, [allMeetings]);

  // === Dialog 添加会议（保留为备选） ===
  const handleAdd = async () => {
    if (!form.title.trim()) return;
    try {
      await api.weekMeetings.create({ week_key: weekKey, ...form });
      setSnackbar({ open: true, message: "会议已添加", severity: "success" });
      setAddOpen(false);
      setForm({ weekday: "周一", start_time: "09:00", end_time: "10:00", title: "" });
      load();
    } catch (err) {
      setSnackbar({ open: true, message: err.message, severity: "error" });
    }
  };

  // === 删除会议 ===
  const handleDelete = async (id) => {
    try {
      await api.weekMeetings.remove(id);
      load();
    } catch (err) {
      setSnackbar({ open: true, message: err.message, severity: "error" });
    }
  };

  // === 拖拽选择时间段 ===

  /** mousedown 在空单元格上 → 开始拖拽选择 */
  const handleCellMouseDown = useCallback((event, day, rowIdx) => {
    // 不调用 preventDefault()，否则会阻止后续 Popper 内 TextField 的 autoFocus 生效
    // 文字选中已由 Row 组件的 userSelect: "none" CSS 处理
    dragRef.current = { active: true, day, startIdx: rowIdx, endIdx: rowIdx, anchorEl: event.currentTarget };
    setDragState({ active: true, day, startIdx: rowIdx, endIdx: rowIdx });
  }, []);

  /** mouseenter 在同一列的格子上 → 扩展选择范围 */
  const handleCellMouseEnter = useCallback((day, rowIdx) => {
    if (!dragRef.current.active) return;
    if (dragRef.current.day !== day) return;     // 不允许跨列拖拽
    if (dragRef.current.endIdx === rowIdx) return; // 没有变化，跳过
    dragRef.current.endIdx = rowIdx;
    setDragState((prev) => ({ ...prev, endIdx: rowIdx }));
  }, []);

  /** 全局 mouseup — 确认选择范围，弹出 Popper */
  useEffect(() => {
    const handleMouseUp = () => {
      if (!dragRef.current.active) return;
      const { day, startIdx, endIdx, anchorEl } = dragRef.current;

      // 计算时间范围
      const minIdx = Math.min(startIdx, endIdx);
      const maxIdx = Math.max(startIdx, endIdx);
      // 单击（起点=终点）默认 1 小时（2 个 slot）
      const actualEndIdx =
        startIdx === endIdx
          ? Math.min(startIdx + 2, TIME_SLOTS.length - 1)
          : Math.min(maxIdx + 1, TIME_SLOTS.length - 1);

      const startTime = TIME_SLOTS[minIdx];
      const endTime = TIME_SLOTS[actualEndIdx];

      // 弹出 Popper
      setPopper({
        open: true,
        anchorEl,
        weekday: day,
        startTime,
        endTime,
        title: "",
      });
      // 标记刚弹出，阻止 mouseup 后紧接着的 click 事件触发 ClickAwayListener 关闭
      justOpenedRef.current = true;
      setTimeout(() => { justOpenedRef.current = false; }, 300);

      // 重置拖拽状态
      dragRef.current = { active: false, day: null, startIdx: -1, endIdx: -1, anchorEl: null };
      setDragState({ active: false, day: null, startIdx: -1, endIdx: -1 });
    };
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, []);

  // === 行内 Popper 创建会议（无按钮快速创建） ===

  const handlePopperAdd = async () => {
    if (!popper.title.trim() || addingRef.current) return;
    addingRef.current = true;
    try {
      await api.weekMeetings.create({
        week_key: weekKey,
        weekday: popper.weekday,
        start_time: popper.startTime,
        end_time: popper.endTime,
        title: popper.title,
      });
      setSnackbar({ open: true, message: "会议已添加", severity: "success" });
      setPopper((p) => ({ ...p, open: false, title: "" }));
      load();
    } catch (err) {
      setSnackbar({ open: true, message: err.message, severity: "error" });
    } finally {
      addingRef.current = false;
    }
  };

  /**
   * 关闭 Popper：
   * - 如果已有标题内容 → 自动创建会议
   * - 如果标题为空 → 仅关闭
   */
  const closePopper = () => {
    // Popper 刚弹出时忽略 click away，给用户时间输入
    if (justOpenedRef.current) return;
    if (popper.title.trim() && !addingRef.current) {
      handlePopperAdd();
    } else if (!addingRef.current) {
      setPopper((p) => ({ ...p, open: false }));
    }
  };

  // === Popper 打开时延迟聚焦 TextField ===
  useEffect(() => {
    if (popper.open && inputRef.current) {
      // 延迟聚焦，确保 Popper 已渲染完毕且 click 事件已消化
      const timer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [popper.open]);

  // === 输出物保存 ===
  const handleOutputBlur = async (weekday) => {
    const content = outputs[weekday] || "";
    const payload = { week_key: weekKey, outputs: [{ weekday, content }] };
    try {
      await api.weekMeetings.saveOutputs(payload);
    } catch (err) {
      setSnackbar({ open: true, message: "保存失败", severity: "error" });
    }
  };

  const changeWeek = (delta) => {
    const d = new Date(weekKey);
    d.setDate(d.getDate() + delta * 7);
    setWeekKey(getMonday(d));
  };

  if (loading) {
    return <CircularProgress sx={{ display: "block", mx: "auto", mt: 8 }} />;
  }

  return (
    <Box>
      {/* 顶部栏 */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h5" fontWeight={700}>本周会议</Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <IconButton onClick={() => changeWeek(-1)}><ChevronLeft /></IconButton>
          <Typography variant="body2" sx={{ minWidth: 100, textAlign: "center" }}>
            {weekRange(weekKey)}
          </Typography>
          <IconButton onClick={() => changeWeek(1)}><ChevronRight /></IconButton>
          <Button size="small" onClick={() => setWeekKey(getMonday(new Date()))}>本周</Button>
          <Button variant="contained" startIcon={<Add />} onClick={() => setAddOpen(true)}>添加会议</Button>
        </Box>
      </Box>

      {/* 课表网格 — 7列等宽：时间列 + 6天 */}
      <Box sx={{
        display: "grid",
        gridTemplateColumns: "repeat(7, 1fr)",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1,
        overflow: "hidden",
        fontSize: "0.75rem",
      }}>
        {/* 表头 */}
        <Box sx={{ p: 0.5, bgcolor: "rgba(255,255,255,0.04)", borderBottom: "1px solid", borderColor: "divider" }} />
        {WEEKDAYS.map((d) => (
          <Box key={d} sx={{
            p: 0.5, textAlign: "center", fontWeight: 600, bgcolor: "rgba(255,255,255,0.04)",
            borderBottom: "1px solid", borderLeft: "1px solid", borderColor: "divider",
          }}>
            {d}
          </Box>
        ))}

        {/* 时间行（不含21:00边界） */}
        {TIME_SLOTS.slice(0, -1).map((time, rowIdx) => (
          <Row
            key={`row-${rowIdx}`}
            time={time}
            rowIdx={rowIdx}
            meetingsByDay={meetingsByDay}
            dragState={dragState}
            onDelete={handleDelete}
            onCellMouseDown={handleCellMouseDown}
            onCellMouseEnter={handleCellMouseEnter}
          />
        ))}

        {/* 输出物行 — 表格底部 */}
        <Box sx={{
          p: 0.5, borderTop: "2px solid", borderColor: "divider",
          bgcolor: "rgba(255,255,255,0.04)", display: "flex", alignItems: "flex-start",
          justifyContent: "center", pt: 1.5,
        }}>
          <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ fontSize: "0.72rem" }}>
            输出物
          </Typography>
        </Box>
        {WEEKDAYS.map((d) => (
          <Box key={`out-${d}`} sx={{
            p: 0.5, borderTop: "2px solid", borderLeft: "1px solid",
            borderColor: "divider", bgcolor: "rgba(255,255,255,0.04)",
          }}>
            <TextField
              multiline
              minRows={1}
              maxRows={3}
              size="small"
              fullWidth
              placeholder="输出物..."
              value={outputs[d] || ""}
              onChange={(e) => setOutputs({ ...outputs, [d]: e.target.value })}
              onBlur={() => handleOutputBlur(d)}
              sx={{ "& .MuiInputBase-root": { fontSize: "0.7rem" } }}
            />
          </Box>
        ))}
      </Box>

      {/* 行内会议创建 Popper（无按钮：Enter 或 blur 有内容时自动创建） */}
      <ClickAwayListener onClickAway={closePopper}>
        <Popper
          open={popper.open}
          anchorEl={popper.anchorEl}
          placement="right-start"
          sx={{ zIndex: 1300 }}
        >
          <Paper elevation={8} sx={{ p: 1.5, minWidth: 200, borderRadius: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
              {popper.weekday} {popper.startTime}—{popper.endTime}
            </Typography>
            <TextField
              inputRef={inputRef}
              size="small"
              fullWidth
              placeholder="会议名称"
              value={popper.title}
              onChange={(e) => setPopper((p) => ({ ...p, title: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") handlePopperAdd(); }}
              onBlur={() => {
                // 延迟判断，确保 Enter 键的 handlePopperAdd 先执行
                setTimeout(() => {
                  if (addingRef.current) return;
                  if (popper.title.trim()) {
                    handlePopperAdd();
                  } else {
                    setPopper((p) => ({ ...p, open: false }));
                  }
                }, 150);
              }}
            />
          </Paper>
        </Popper>
      </ClickAwayListener>

      {/* 添加会议对话框（保留为备选） */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>添加会议</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
            <TextField select label="星期" value={form.weekday} onChange={(e) => setForm({ ...form, weekday: e.target.value })}>
              {WEEKDAYS.map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
            </TextField>
            <Box sx={{ display: "flex", gap: 1.5 }}>
              <TextField select label="开始时间" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} sx={{ flex: 1 }}>
                {TIME_OPTIONS.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
              </TextField>
              <TextField select label="结束时间" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} sx={{ flex: 1 }}>
                {END_TIME_OPTIONS.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
              </TextField>
            </Box>
            <TextField label="会议名称" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>取消</Button>
          <Button variant="contained" onClick={handleAdd} disabled={!form.title.trim()}>添加</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        <Alert severity={snackbar.severity} variant="filled">{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}

/**
 * 单行组件 — 时间标签 + 6天格子 + 叠加的会议卡片
 *
 * 支持拖拽选择时间段（mousedown → mousemove → mouseup）：
 * - mousedown 在空单元格上开始拖拽
 * - mouseenter 在同一列的格子上扩展选择
 * - 拖拽中被选中的格子有视觉高亮
 * - mouseup 后弹出 Popper 创建会议
 */
function Row({ time, rowIdx, meetingsByDay, dragState, onDelete, onCellMouseDown, onCellMouseEnter }) {
  return (
    <>
      {/* 时间标签列 */}
      <Box sx={{
        p: 0.5, textAlign: "center", color: "text.secondary",
        borderBottom: "1px solid", borderColor: "divider", fontSize: "0.7rem",
      }}>
        {time}
      </Box>

      {/* 6天格子 */}
      {WEEKDAYS.map((day) => {
        const meetings = (meetingsByDay[day] || []).filter((m) => {
          const startIdx = timeToSlotIndex(m.start_time);
          return startIdx === rowIdx;
        });
        const isEmpty = meetings.length === 0;

        // 判断当前格子是否在拖拽选中范围内
        const inDragRange =
          dragState.active &&
          dragState.day === day &&
          rowIdx >= Math.min(dragState.startIdx, dragState.endIdx) &&
          rowIdx <= Math.max(dragState.startIdx, dragState.endIdx);

        return (
          <Box
            key={`${day}-${rowIdx}`}
            onMouseDown={isEmpty ? (e) => onCellMouseDown(e, day, rowIdx) : undefined}
            onMouseEnter={() => onCellMouseEnter(day, rowIdx)}
            sx={{
              borderBottom: "1px solid",
              borderLeft: "1px solid",
              borderColor: "divider",
              minHeight: SLOT_HEIGHT,
              position: "relative",
              p: 0.25,
              cursor: isEmpty ? "pointer" : "default",
              transition: "background-color 0.15s",
              bgcolor: inDragRange ? "rgba(139,92,246,0.15)" : "transparent",
              "&:hover": (isEmpty && !dragState.active) ? { bgcolor: "action.hover" } : {},
              userSelect: dragState.active ? "none" : undefined,
            }}
          >
            {meetings.map((m) => {
              const span = meetingSpan(m.start_time, m.end_time);
              const isProject = m.source === "project";
              const color = isProject ? (m.theme_color || "#8B5CF6") : "#8B5CF6";
              return (
                <Tooltip key={m.id || m.title} title={m.title} arrow disableInteractive>
                  <Box
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    sx={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      bgcolor: isProject ? `${color}15` : `${color}20`,
                      borderLeft: `3px solid ${color}`,
                      borderRadius: 0.5,
                      p: 0.5,
                      height: `${span * SLOT_HEIGHT}px`,
                      overflow: "hidden",
                      cursor: isProject ? "default" : "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: 0.25,
                      zIndex: 2,
                    }}
                  >
                    <Box sx={{ display: "flex", alignItems: "flex-start", gap: 0.25 }}>
                      <Typography sx={{
                        fontSize: "0.68rem", fontWeight: 600, flex: 1, lineHeight: 1.2,
                        color: color, wordBreak: "break-all",
                      }}>
                        {m.title}
                      </Typography>
                      {!isProject && (
                        <IconButton
                          size="small"
                          sx={{ p: 0, opacity: 0.5, "&:hover": { opacity: 1 } }}
                          onClick={(e) => { e.stopPropagation(); onDelete(m.id); }}
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          <DeleteOutline sx={{ fontSize: 12 }} />
                        </IconButton>
                      )}
                    </Box>
                    <Typography sx={{ fontSize: "0.62rem", color: "text.secondary" }}>
                      {m.start_time}-{m.end_time}
                    </Typography>
                  </Box>
                </Tooltip>
              );
            })}
          </Box>
        );
      })}
    </>
  );
}
