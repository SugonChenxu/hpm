import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Box, Typography, Button, IconButton, Dialog, Menu,
  DialogTitle, DialogContent, DialogActions, TextField, MenuItem,
  Tooltip, Snackbar, Alert, Popper, ClickAwayListener, Paper, Checkbox,
} from "@mui/material";
import { ChevronLeft, ChevronRight, Add, DeleteOutline, EditOutlined } from "@mui/icons-material";
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

  const loadMeetingData = useCallback(() => {
    setLoading(true);
    api.weekMeetings.list(weekKey)
      .then((res) => {
        setData(res.data);
        const outMap = {};
        WEEKDAYS.forEach((d) => { outMap[d] = []; });
        (res.data.outputs || []).forEach((o) => {
          if (!outMap[o.weekday]) outMap[o.weekday] = [];
          outMap[o.weekday].push(o);
        });
        setOutputs(outMap);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [weekKey]);

  useEffect(() => { loadMeetingData(); }, [loadMeetingData]);

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

  // === 输出物：逐条 CRUD ===
  const handleAddOutput = useCallback(async (weekday, title) => {
    const trimmed = (title || "").trim();
    if (!trimmed) return;
    const tempId = `temp-${Date.now()}`;
    const optimistic = { id: tempId, week_key: weekKey, weekday, title: trimmed, is_done: 0, sort_order: 999 };
    setOutputs((prev) => ({ ...prev, [weekday]: [...(prev[weekday] || []), optimistic] }));
    try {
      const res = await api.weekMeetings.meetingOutputs.add({ week_key: weekKey, weekday, title: trimmed });
      setOutputs((prev) => ({ ...prev, [weekday]: (prev[weekday] || []).map((o) => (o.id === tempId ? res.data : o)) }));
    } catch (err) {
      setOutputs((prev) => ({ ...prev, [weekday]: (prev[weekday] || []).filter((o) => o.id !== tempId) }));
      setSnackbar({ open: true, message: "添加失败", severity: "error" });
    }
  }, [weekKey]);

  const handleToggleOutput = useCallback(async (item) => {
    const newDone = item.is_done ? 0 : 1;
    // 周期项（虚拟周期项 / 带 cycle 的展示实例）：勾选仅记录「当前周期完成」，upsert 每周实例，不改动模板
    const isRecurring = item.is_recurring || String(item.id).startsWith("recurring_") || !!item.cycle;
    if (isRecurring) {
      const sourceId = item.is_recurring
        ? String(item.id).replace("recurring_", "")
        : (item.source_id || item.id);
      try {
        await api.weekMeetings.meetingOutputs.cycleInstance({
          week_key: weekKey,
          weekday: item.weekday,
          title: item.title,
          cycle: item.cycle || "weekly",
          is_done: newDone,
          source_id: sourceId,
        });
        loadMeetingData(weekKey);
      } catch {
        setSnackbar({ open: true, message: "操作失败", severity: "error" });
      }
      return;
    }
    // 普通一次性项：直接切换完成态
    setOutputs((prev) => ({ ...prev, [item.weekday]: (prev[item.weekday] || []).map((o) => (o.id === item.id ? { ...o, is_done: newDone } : o)) }));
    try {
      await api.weekMeetings.meetingOutputs.update(item.id, { is_done: newDone });
    } catch (err) {
      setOutputs((prev) => ({ ...prev, [item.weekday]: (prev[item.weekday] || []).map((o) => (o.id === item.id ? { ...o, is_done: item.is_done } : o)) }));
      setSnackbar({ open: true, message: "更新失败", severity: "error" });
    }
  }, [weekKey]);

  const handleDeleteOutput = useCallback(async (item) => {
    // 虚拟周期项 → 删除其原模板（停止后续周期）；普通实例/一次性项 → 删除该条
    const isRecurring = item.is_recurring || String(item.id).startsWith("recurring_");
    const targetId = isRecurring ? String(item.id).replace("recurring_", "") : item.id;
    setOutputs((prev) => ({ ...prev, [item.weekday]: (prev[item.weekday] || []).filter((o) => o.id !== item.id) }));
    try {
      await api.weekMeetings.meetingOutputs.remove(targetId);
    } catch (err) {
      loadMeetingData(weekKey);
      setSnackbar({ open: true, message: "删除失败", severity: "error" });
    }
  }, [weekKey]);

  const handleEditOutput = useCallback(async (item, newTitle) => {
    const t = (newTitle || "").trim();
    if (!t) return;
    // 虚拟周期项 → 更新原模板标题；周期实例 → 同步更新来源模板，保持后续周一致；一次性项 → 更新自身
    const isRecurring = item.is_recurring || String(item.id).startsWith("recurring_");
    const targetId = isRecurring ? String(item.id).replace("recurring_", "") : item.id;
    setOutputs((prev) => ({ ...prev, [item.weekday]: (prev[item.weekday] || []).map((o) => (o.id === item.id ? { ...o, title: t } : o)) }));
    try {
      await api.weekMeetings.meetingOutputs.update(targetId, { title: t });
      if (!isRecurring && item.source_id) {
        await api.weekMeetings.meetingOutputs.update(item.source_id, { title: t });
      }
      loadMeetingData(weekKey);
    } catch {
      loadMeetingData(weekKey);
      setSnackbar({ open: true, message: "修改失败", severity: "error" });
    }
  }, [weekKey]);

  const handleSetCycle = useCallback(async (itemId, cycle) => {
    // 虚拟周期项 → 更新其原模板；普通项 → 把自身升级为周期模板
    const allItems = Object.values(outputs).flat();
    const item = allItems.find(o => o.id === itemId);
    const isRecurring = item && (item.is_recurring || String(itemId).startsWith("recurring_"));
    const targetId = isRecurring ? String(itemId).replace("recurring_", "") : itemId;
    try {
      await api.weekMeetings.meetingOutputs.update(targetId, {
        cycle: cycle || "",
        is_template: cycle ? 1 : 0,
      });
      loadMeetingData(weekKey);
    } catch {
      setSnackbar({ open: true, message: "设置周期失败", severity: "error" });
    }
  }, [weekKey, outputs]);

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
            <MeetingOutputList
            items={outputs[d] || []}
            onAdd={(title) => handleAddOutput(d, title)}
            onToggle={handleToggleOutput}
            onDelete={handleDeleteOutput}
            onSetCycle={handleSetCycle}
            onEdit={handleEditOutput}
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
// MeetingOutputList — 某星期格内的逐条输出物列表（对齐 SubtaskItem 风格）
// ============================================================

const CYCLE_OPTIONS = [
  { value: "", label: "" },
  { value: "weekly", label: "1W" },
  { value: "biweekly", label: "2W" },
  { value: "monthly", label: "1M" },
];

const CYCLE_COLORS = { weekly: "#237804", biweekly: "#ad6800", monthly: "#1976d2" };

function MeetingOutputList({ items, onAdd, onToggle, onDelete, onSetCycle, onEdit }) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const addRef = useRef(null);
  const [cycleMenu, setCycleMenu] = useState({ anchor: null, itemId: null });
  const [actionMenu, setActionMenu] = useState({ anchor: null, itemId: null });
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const editRef = useRef(null);
  useEffect(() => { if (adding && addRef.current) addRef.current.focus(); }, [adding]);
  useEffect(() => { if (editingId && editRef.current) editRef.current.focus(); }, [editingId]);

  const startEdit = (it) => {
    setEditingId(it.id);
    setEditText(it.title);
    setActionMenu({ anchor: null, itemId: null });
  };
  const commitEdit = () => {
    const it = (items || []).find(i => i.id === editingId);
    if (it) onEdit(it, editText);
    setEditingId(null);
    setEditText("");
  };

  const submit = () => {
    const t = text.trim();
    if (!t) { setAdding(false); return; }
    onAdd(t);
    setText("");
    // 保持连续添加：不清空 adding，便于继续输入
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25, py: 0.25 }}>
      {(items || []).map((it, idx) => (
        <Box key={it.id} sx={{
          display: "flex", alignItems: "flex-start", gap: 0.5, px: 0.5, borderRadius: 1,
          "&:hover": { bgcolor: "action.hover" },
        }}>
          {/* 左标记区：checkbox + 1W 周期标签（固定宽度，文字区紧接其后） */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.3, flexShrink: 0 }}>
            <Checkbox
              size="small"
              checked={!!it.is_done}
              onChange={() => onToggle(it)}
              sx={{ p: 0.25 }}
            />
            {it.cycle && (
              <Box component="span" sx={{
                fontSize: "0.6rem", px: 0.5, py: 0.05, borderRadius: 0.75, fontWeight: 700,
                lineHeight: 1.5, whiteSpace: "nowrap", userSelect: "none",
                bgcolor: (CYCLE_COLORS[it.cycle] || "#8c8c8c") + "1f",
                color: CYCLE_COLORS[it.cycle] || "#8c8c8c",
              }}>
                {(CYCLE_OPTIONS.find(c => c.value === it.cycle) || {}).label || it.cycle}
              </Box>
            )}
          </Box>
          {/* 内容区：编号与标题同字号同元素，flex:1；换行后第二行对齐到本区左缘（即 1W 列） */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {editingId === it.id ? (
              <TextField
                inputRef={editRef}
                size="small"
                fullWidth
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
                  if (e.key === "Escape") { setEditingId(null); setEditText(""); }
                }}
                sx={{ "& .MuiInputBase-root": { fontSize: "0.72rem" } }}
              />
            ) : (
              <Typography
                onClick={() => startEdit(it)}
                sx={{
                  fontSize: "0.72rem", lineHeight: 1.45, cursor: "pointer",
                  textDecoration: it.is_done ? "line-through" : "none",
                  color: it.is_done ? "text.disabled" : "text.primary",
                  wordBreak: "break-word", "&:hover": { color: "primary.main" },
                }}
              >
                <Box component="span" sx={{ fontWeight: 700, color: it.is_done ? "text.disabled" : "text.secondary", mr: 0.3 }}>{idx + 1}.</Box>
                {it.title}
              </Typography>
            )}
          </Box>
          {/* 最右端 ▶ 展开操作菜单 */}
          <IconButton
            size="small"
            onClick={(e) => setActionMenu({ anchor: e.currentTarget, itemId: it.id })}
            sx={{ p: 0.1, flexShrink: 0, color: "text.secondary" }}
            title="更多操作"
          >
            <ChevronRight sx={{ fontSize: 16 }} />
          </IconButton>
        </Box>
      ))}
      {adding ? (
        <TextField
          inputRef={addRef}
          size="small"
          fullWidth
          value={text}
          placeholder="输入后回车添加"
          onChange={(e) => setText(e.target.value)}
          onBlur={() => { if (!text.trim()) setAdding(false); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); submit(); }
            if (e.key === "Escape") { setText(""); setAdding(false); }
          }}
          sx={{ "& .MuiInputBase-root": { fontSize: "0.7rem" } }}
        />
      ) : (
        <Box
          onClick={() => setAdding(true)}
          sx={{ display: "flex", alignItems: "center", gap: 0.5, px: 0.5, py: 0.25, borderRadius: 1, cursor: "pointer", color: "text.secondary", fontSize: "0.7rem", "&:hover": { bgcolor: "action.hover" } }}
        >
          <Add sx={{ fontSize: 14 }} /> 添加
        </Box>
      )}
      {/* 操作菜单：编辑 / 设置周期 / 删除 */}
      <Menu
        anchorEl={actionMenu.anchor}
        open={!!actionMenu.anchor}
        onClose={() => setActionMenu({ anchor: null, itemId: null })}
      >
        <MenuItem
          onClick={() => { const it = (items || []).find(i => i.id === actionMenu.itemId); if (it) startEdit(it); }}
          sx={{ fontSize: "0.78rem", gap: 1 }}
        >
          <EditOutlined sx={{ fontSize: 16 }} /> 编辑
        </MenuItem>
        <MenuItem
          onClick={() => { const a = actionMenu; setActionMenu({ anchor: null, itemId: null }); setCycleMenu({ anchor: a.anchor, itemId: a.itemId }); }}
          sx={{ fontSize: "0.78rem", gap: 1 }}
        >
          <Box component="span" sx={{ fontSize: 14, lineHeight: 1 }}>⟳</Box> 设置周期
        </MenuItem>
        <MenuItem
          onClick={() => { const it = (items || []).find(i => i.id === actionMenu.itemId); if (it) onDelete(it); setActionMenu({ anchor: null, itemId: null }); }}
          sx={{ fontSize: "0.78rem", gap: 1, color: "error.main" }}
        >
          <DeleteOutline sx={{ fontSize: 16 }} /> 删除
        </MenuItem>
      </Menu>
      {/* 周期选择菜单 */}
      <Menu
        anchorEl={cycleMenu.anchor}
        open={!!cycleMenu.anchor}
        onClose={() => setCycleMenu({ anchor: null, itemId: null })}
      >
        {CYCLE_OPTIONS.map((opt) => (
          <MenuItem
            key={opt.value || "_none"}
            selected={opt.value === (items.find(i => i.id === cycleMenu.itemId) || {}).cycle}
            onClick={() => {
              onSetCycle(cycleMenu.itemId, opt.value);
              setCycleMenu({ anchor: null, itemId: null });
            }}
            sx={{ fontSize: "0.78rem", gap: 1 }}
          >
            {opt.label || "无周期"}
            {opt.value && (
              <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: CYCLE_COLORS[opt.value] }} />
            )}
          </MenuItem>
        ))}
      </Menu>
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
