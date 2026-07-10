import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Box, Typography, Button, IconButton, Dialog,
  DialogTitle, DialogContent, DialogActions, TextField, MenuItem,
  Tooltip, Snackbar, Alert, Popper, ClickAwayListener, Paper,
} from "@mui/material";
import { ChevronLeft, ChevronRight, Add, DeleteOutline } from "@mui/icons-material";
import api from "../api/client";
import PageHeader from "../components/common/PageHeader";
import PageLoading from "../components/common/PageLoading";

/** 6天: 周一~周六（不含周日） */
const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六"];

/** 统一槽位高度，所有卡片和格子共用 */
const SLOT_HEIGHT = 28;

/** 表头和首列背景色 */
const HEADER_BG = "#F3F4F6";

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
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 周一日期 → 显示范围 "7/6 - 7/11"（周一~周六） */
function weekRange(mondayStr) {
  const [y, m, d] = mondayStr.split("-").map(Number);
  const start = new Date(y, m - 1, d);
  const end = new Date(y, m - 1, d + 5);
  return `${start.getMonth() + 1}/${start.getDate()} - ${end.getMonth() + 1}/${end.getDate()}`;
}

/** 周一日期 → ISO 周号 "2026年 第28周" */
function getWeekNumber(mondayStr) {
  const [y, m, d] = mondayStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const thursday = new Date(y, m - 1, d + 3);
  const yearStart = new Date(thursday.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((thursday - yearStart) / 86400000 + 1) / 7);
  return `${thursday.getFullYear()}年 第${weekNum}周`;
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

/**
 * 行内可编辑输出物组件
 *
 * - 点击空白区域 → 出现输入框
 * - 输入后 Enter/blur → 保存为文本
 * - 再次点击文本 → 切回编辑模式
 */
function InlineOutput({ value, onChange, onSave }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value || "");

  const handleClick = () => {
    setText(value || "");
    setEditing(true);
  };

  const handleSave = () => {
    setEditing(false);
    if (text !== value) {
      onChange(text);
      onSave(text);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === "Escape") {
      setEditing(false);
      setText(value || "");
    }
  };

  if (editing) {
    return (
      <TextField
        multiline
        minRows={1}
        maxRows={3}
        size="small"
        fullWidth
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        sx={{ "& .MuiInputBase-root": { fontSize: "0.7rem" } }}
      />
    );
  }

  return (
    <Box
      onClick={handleClick}
      sx={{
        minHeight: 32,
        p: 0.5,
        borderRadius: 1,
        cursor: "pointer",
        fontSize: "0.7rem",
        color: value ? "text.primary" : "text.disabled",
        fontStyle: value ? "normal" : "italic",
        "&:hover": { bgcolor: "action.hover" },
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
      }}
    >
      {value || "点击添加输出物..."}
    </Box>
  );
}

export default function WeekMeetingPage() {
  const [weekKey, setWeekKey] = useState(getMonday(new Date()));
  const [data, setData] = useState({ meetings: [], outputs: [], recurring: [] });
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [outputs, setOutputs] = useState({});
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" });
  const [form, setForm] = useState({ weekday: "周一", start_time: "09:00", end_time: "10:00", title: "", weeks: 1 });

  /** 行内 Popper 新建会议状态 */
  const [popper, setPopper] = useState({
    open: false,
    anchorEl: null,
    weekday: "周一",
    startTime: "09:00",
    endTime: "10:00",
    title: "",
    weeks: 1,
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
      await api.weekMeetings.create({ week_key: weekKey, ...form, weeks: Number(form.weeks) || 1 });
      const wk = Number(form.weeks) || 1;
      setSnackbar({
        open: true,
        message: wk > 1 ? `会议已添加（持续 ${wk} 周）` : "会议已添加",
        severity: "success",
      });
      setAddOpen(false);
      setForm({ weekday: "周一", start_time: "09:00", end_time: "10:00", title: "", weeks: 1 });
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
    dragRef.current = { active: true, day, startIdx: rowIdx, endIdx: rowIdx, anchorEl: event.currentTarget };
    setDragState({ active: true, day, startIdx: rowIdx, endIdx: rowIdx });
  }, []);

  /** mouseenter 在同一列的格子上 → 扩展选择范围 */
  const handleCellMouseEnter = useCallback((day, rowIdx) => {
    if (!dragRef.current.active) return;
    if (dragRef.current.day !== day) return;
    if (dragRef.current.endIdx === rowIdx) return;
    dragRef.current.endIdx = rowIdx;
    setDragState((prev) => ({ ...prev, endIdx: rowIdx }));
  }, []);

  /** 全局 mouseup — 确认选择范围，弹出 Popper */
  useEffect(() => {
    const handleMouseUp = () => {
      if (!dragRef.current.active) return;
      const { day, startIdx, endIdx, anchorEl } = dragRef.current;

      const minIdx = Math.min(startIdx, endIdx);
      const maxIdx = Math.max(startIdx, endIdx);
      const actualEndIdx =
        startIdx === endIdx
          ? Math.min(startIdx + 2, TIME_SLOTS.length - 1)
          : Math.min(maxIdx + 1, TIME_SLOTS.length - 1);

      const startTime = TIME_SLOTS[minIdx];
      const endTime = TIME_SLOTS[actualEndIdx];

      setPopper({
        open: true,
        anchorEl,
        weekday: day,
        startTime,
        endTime,
        title: "",
        weeks: 1,
      });
      justOpenedRef.current = true;
      setTimeout(() => { justOpenedRef.current = false; }, 300);

      dragRef.current = { active: false, day: null, startIdx: -1, endIdx: -1, anchorEl: null };
      setDragState({ active: false, day: null, startIdx: -1, endIdx: -1 });
    };
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, []);

  // === 行内 Popper 创建会议 ===

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
        weeks: Number(popper.weeks) || 1,
      });
      const wk = Number(popper.weeks) || 1;
      setSnackbar({
        open: true,
        message: wk > 1 ? `会议已添加（持续 ${wk} 周）` : "会议已添加",
        severity: "success",
      });
      setPopper((p) => ({ ...p, open: false, title: "", weeks: 1 }));
      load();
    } catch (err) {
      setSnackbar({ open: true, message: err.message, severity: "error" });
    } finally {
      addingRef.current = false;
    }
  };

  const closePopper = () => {
    if (justOpenedRef.current) return;
    if (addingRef.current) return;
    setPopper((p) => ({ ...p, open: false, title: "", weeks: 1 }));
  };

  useEffect(() => {
    if (popper.open && inputRef.current) {
      const timer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [popper.open]);

  // === 输出物处理 ===
  const handleOutputChange = useCallback((weekday, content) => {
    setOutputs((prev) => ({ ...prev, [weekday]: content }));
  }, []);

  const handleOutputSave = useCallback(async (weekday, content) => {
    const payload = { week_key: weekKey, outputs: [{ weekday, content }] };
    try {
      await api.weekMeetings.saveOutputs(payload);
    } catch (err) {
      setSnackbar({ open: true, message: "保存失败", severity: "error" });
    }
  }, [weekKey]);

  const changeWeek = (delta) => {
    const [y, m, d] = weekKey.split("-").map(Number);
    const date = new Date(y, m - 1, d + delta * 7);
    setWeekKey(getMonday(date));
  };

  if (loading) {
    return <PageLoading />;
  }

  return (
    <Box>
      {/* 顶部栏 */}
      <PageHeader title="会议计划" subtitle="规划与调整各周会议安排">
        <IconButton onClick={() => changeWeek(-1)}><ChevronLeft /></IconButton>
        <Typography variant="body2" sx={{ minWidth: 160, textAlign: "center" }}>
          {weekRange(weekKey)}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ minWidth: 100, textAlign: "center" }}>
          {getWeekNumber(weekKey)}
        </Typography>
        <IconButton onClick={() => changeWeek(1)}><ChevronRight /></IconButton>
        <Button size="small" variant="outlined" onClick={() => setWeekKey(getMonday(new Date()))}>回到本周</Button>
        <Button variant="contained" startIcon={<Add />} onClick={() => setAddOpen(true)}>添加会议</Button>
      </PageHeader>

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
        {/* 表头 — 左上角斜线表头 */}
        <Box sx={{
          p: 0, bgcolor: HEADER_BG, borderBottom: "1px solid",
          borderColor: "divider", position: "relative",
          height: 40, overflow: "hidden",
        }}>
          <Box sx={{ position: "absolute", top: 6, left: 10, fontSize: 10, color: "text.secondary", lineHeight: 1 }}>
            时间
          </Box>
          <Box sx={{ position: "absolute", bottom: 6, right: 10, fontSize: 10, color: "text.secondary", lineHeight: 1 }}>
            星期
          </Box>
          <svg width="100%" height="100%" style={{ position: "absolute", top: 0, left: 0 }}>
            <line x1="0" y1="0" x2="100%" y2="100%" stroke="#D1D5DB" strokeWidth="1" />
          </svg>
        </Box>
        {WEEKDAYS.map((d) => (
          <Box key={d} sx={{
            p: 0.5, textAlign: "center", fontWeight: 600, bgcolor: HEADER_BG,
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
          bgcolor: HEADER_BG, display: "flex", alignItems: "flex-start",
          justifyContent: "center", pt: 1.5,
        }}>
          <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ fontSize: "0.72rem" }}>
            输出物
          </Typography>
        </Box>
        {WEEKDAYS.map((d) => (
          <Box key={`out-${d}`} sx={{
            p: 0.5, borderTop: "2px solid", borderLeft: "1px solid",
            borderColor: "divider", bgcolor: HEADER_BG,
          }}>
            <InlineOutput
              value={outputs[d] || ""}
              onChange={(content) => handleOutputChange(d, content)}
              onSave={(content) => handleOutputSave(d, content)}
            />
          </Box>
        ))}
      </Box>

      {/* 行内会议创建 Popper */}
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
            />
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1 }}>
              <Typography variant="caption" color="text.secondary">持续周数</Typography>
              <TextField
                type="number"
                size="small"
                value={popper.weeks}
                onChange={(e) =>
                  setPopper((p) => ({ ...p, weeks: Math.max(1, Math.min(52, parseInt(e.target.value, 10) || 1)) }))
                }
                onKeyDown={(e) => { if (e.key === "Enter") handlePopperAdd(); }}
                inputProps={{ min: 1, max: 52, style: { width: 44, textAlign: "center" } }}
              />
              <Typography variant="caption" color="text.secondary">周</Typography>
            </Box>
            <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, mt: 1.5 }}>
              <Button size="small" onClick={closePopper}>取消</Button>
              <Button size="small" variant="contained" onClick={handlePopperAdd}>确认</Button>
            </Box>
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
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography variant="caption" color="text.secondary">持续周数</Typography>
              <TextField
                type="number"
                size="small"
                value={form.weeks}
                onChange={(e) =>
                  setForm({ ...form, weeks: Math.max(1, Math.min(52, parseInt(e.target.value, 10) || 1)) })
                }
                inputProps={{ min: 1, max: 52, style: { width: 44, textAlign: "center" } }}
              />
              <Typography variant="caption" color="text.secondary">周</Typography>
            </Box>
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

// ============================================================
// Row — 单行组件：时间标签 + 6天格子 + 叠加的会议卡片
// ============================================================

function Row({ time, rowIdx, meetingsByDay, dragState, onDelete, onCellMouseDown, onCellMouseEnter }) {
  return (
    <>
      {/* 时间标签列 — 带背景色 */}
      <Box sx={{
        p: 0.5, textAlign: "center", color: "text.secondary",
        borderBottom: "1px solid", borderColor: "divider", fontSize: "0.7rem",
        bgcolor: "#F3F4F6",
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

        // 判断当前格子是否被会议卡片覆盖（跨行会议）
        const coveredByMeeting = !isEmpty || (meetingsByDay[day] || []).some((m) => {
          const startIdx = timeToSlotIndex(m.start_time);
          const endIdx = startIdx + meetingSpan(m.start_time, m.end_time);
          return startIdx < rowIdx && rowIdx < endIdx;
        });

        // 判断当前格子是否在拖拽选中范围内
        const inDragRange =
          dragState.active &&
          dragState.day === day &&
          rowIdx >= Math.min(dragState.startIdx, dragState.endIdx) &&
          rowIdx <= Math.max(dragState.startIdx, dragState.endIdx);

        return (
          <Box
            key={`${day}-${rowIdx}`}
            onMouseDown={isEmpty && !coveredByMeeting ? (e) => onCellMouseDown(e, day, rowIdx) : undefined}
            onMouseEnter={() => onCellMouseEnter(day, rowIdx)}
            sx={{
              borderBottom: coveredByMeeting ? "none" : "1px solid",
              borderLeft: "1px solid",
              borderColor: "divider",
              minHeight: SLOT_HEIGHT,
              position: "relative",
              p: 0.25,
              cursor: (isEmpty && !coveredByMeeting) ? "pointer" : "default",
              transition: "background-color 0.15s",
              bgcolor: inDragRange ? "rgba(124,58,237,0.15)" : "transparent",
              "&:hover": (isEmpty && !coveredByMeeting && !dragState.active) ? { bgcolor: "action.hover" } : {},
              userSelect: dragState.active ? "none" : undefined,
            }}
          >
            {meetings.map((m) => {
              const span = meetingSpan(m.start_time, m.end_time);
              const isProject = m.source === "project";
              const color = isProject ? (m.theme_color || "#7C3AED") : "#7C3AED";
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
                        fontSize: "0.72rem", fontWeight: 600, flex: 1, lineHeight: 1.2,
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
                    <Typography sx={{ fontSize: "0.65rem", color: "text.secondary" }}>
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
