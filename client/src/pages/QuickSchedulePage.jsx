import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Box, Typography, Button, TextField, Dialog, DialogTitle, DialogContent,
  DialogActions, IconButton, Tooltip, Stack, Chip, MenuItem, Select,
  FormControl, InputLabel, alpha,
} from "@mui/material";
import dayjs from "dayjs";
import api from "../api/client";
import PageHeader from "../components/common/PageHeader";

const MONTH_WIDTH = 72;
const ROW_HEIGHT = 64;
const HEADER_HEIGHT = 72;
const LABEL_WIDTH = 160;
const MIN_SCHEDULE_MONTHS = 6;

const SYMBOLS = [
  { key: "circle", label: "圆点" },
  { key: "star", label: "星星" },
  { key: "triangle", label: "三角" },
  { key: "square", label: "方块" },
  { key: "diamond", label: "菱形" },
  { key: "flag", label: "旗帜" },
];

const PRESET_COLORS = [
  "#D32F2F", "#E65100", "#FBC02D", "#388E3C",
  "#1565C0", "#6A1B9A", "#00838F", "#455A64",
];

function fmt(d) {
  return dayjs(d).format("YYYY-MM-DD");
}

function buildMonths(startDate, endDate) {
  const months = [];
  let cur = dayjs(startDate).startOf("month");
  const end = dayjs(endDate).endOf("month");
  while (cur.isBefore(end) || cur.isSame(end, "month")) {
    months.push({
      year: cur.year(),
      month: cur.month() + 1,
      key: cur.format("YYYY-MM"),
      start: cur.startOf("month").format("YYYY-MM-DD"),
      end: cur.endOf("month").format("YYYY-MM-DD"),
    });
    cur = cur.add(1, "month");
  }
  return months;
}

function buildQuarters(months) {
  const quarters = [];
  let i = 0;
  while (i < months.length) {
    const m = months[i];
    const q = Math.ceil(m.month / 3);
    const startIdx = i;
    let j = i + 1;
    while (j < months.length) {
      const mj = months[j];
      const qj = Math.ceil(mj.month / 3);
      if (mj.year === m.year && qj === q) j++;
      else break;
    }
    quarters.push({
      label: `${m.year} Q${q}`,
      startIdx,
      count: j - startIdx,
    });
    i = j;
  }
  return quarters;
}

function dateToPixels(date, months) {
  if (months.length === 0) return 0;
  const d = dayjs(date);
  const first = dayjs(months[0].start);
  const lastIdx = months.length - 1;
  const lastEnd = dayjs(months[lastIdx].end);
  if (d.isBefore(first)) return 0;
  if (d.isAfter(lastEnd)) return months.length * MONTH_WIDTH;
  const monthIdx = months.findIndex((m) => d.format("YYYY-MM") === m.key);
  const safeIdx = monthIdx >= 0 ? monthIdx : 0;
  const monthStart = dayjs(months[safeIdx].start);
  const monthEnd = dayjs(months[safeIdx].end);
  const totalDays = monthEnd.diff(monthStart, "day") + 1;
  const passed = d.diff(monthStart, "day");
  return safeIdx * MONTH_WIDTH + (passed / totalDays) * MONTH_WIDTH;
}

function pixelsToDate(px, months) {
  if (months.length === 0) return null;
  if (px <= 0) return months[0].start;
  const total = months.length * MONTH_WIDTH;
  if (px >= total) return months[months.length - 1].end;
  const idx = Math.min(months.length - 1, Math.floor(px / MONTH_WIDTH));
  const offset = px - idx * MONTH_WIDTH;
  const month = months[idx];
  const monthStart = dayjs(month.start);
  const monthEnd = dayjs(month.end);
  const totalDays = monthEnd.diff(monthStart, "day") + 1;
  const days = Math.round((offset / MONTH_WIDTH) * totalDays);
  return fmt(monthStart.add(days, "day"));
}

function MilestoneSymbol({ symbol, color, size = 14 }) {
  const s = size;
  const half = s / 2;
  switch (symbol) {
    case "circle":
      return <circle cx={half} cy={half} r={half - 1} fill={color} />;
    case "square":
      return <rect x={1} y={1} width={s - 2} height={s - 2} fill={color} />;
    case "diamond":
      return <polygon points={`${half},1 ${s - 1},${half} ${half},${s - 1} 1,${half}`} fill={color} />;
    case "triangle":
      return <polygon points={`${half},1 ${s - 1},${s - 1} 1,${s - 1}`} fill={color} />;
    case "star": {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? half - 1 : half / 2;
        const ang = (Math.PI / 5) * i - Math.PI / 2;
        pts.push(`${half + r * Math.cos(ang)},${half + r * Math.sin(ang)}`);
      }
      return <polygon points={pts.join(" ")} fill={color} />;
    }
    case "flag":
      return (
        <>
          <path d={`M${half},${s - 1} L${half},${half / 2}`} stroke={color} strokeWidth={2} />
          <path d={`M${half},${half / 2} L${s - 2},${half * 0.7} L${half},${half}`} fill={color} />
        </>
      );
    default:
      return <circle cx={half} cy={half} r={half - 1} fill={color} />;
  }
}

function TimelineHeader({ months, quarters }) {
  const totalWidth = months.length * MONTH_WIDTH;
  return (
    <Box sx={{ display: "flex", height: HEADER_HEIGHT, position: "sticky", top: 0, zIndex: 5, bgcolor: "background.paper" }}>
      <Box sx={{ width: LABEL_WIDTH, flexShrink: 0, borderRight: "1px solid", borderColor: "divider", borderBottom: "1px solid", borderColor: "divider" }} />
      <Box sx={{ position: "relative", width: totalWidth, height: "100%", borderBottom: "1px solid", borderColor: "divider" }}>
        {quarters.map((q, i) => (
          <Box
            key={`q-${i}`}
            sx={{
              position: "absolute",
              left: q.startIdx * MONTH_WIDTH,
              width: q.count * MONTH_WIDTH,
              height: HEADER_HEIGHT / 2,
              bgcolor: "#A94442",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: "0.8rem",
              borderRight: "1px solid rgba(255,255,255,0.3)",
            }}
          >
            {q.label}
          </Box>
        ))}
        {months.map((m, i) => (
          <Box
            key={m.key}
            sx={{
              position: "absolute",
              left: i * MONTH_WIDTH,
              top: HEADER_HEIGHT / 2,
              width: MONTH_WIDTH,
              height: HEADER_HEIGHT / 2,
              bgcolor: "#D9A6A5",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 600,
              fontSize: "0.75rem",
              borderRight: "1px solid rgba(255,255,255,0.3)",
            }}
          >
            {m.month}月
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function DraggableBar({ bar, months, onUpdate, onEdit }) {
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);
  const startLeftRef = useRef(0);
  const durationRef = useRef(0);

  const left = dateToPixels(bar.start_date, months);
  const right = dateToPixels(bar.end_date, months);
  const width = Math.max(4, right - left);

  const handleMouseDown = (e) => {
    e.stopPropagation();
    setDragging(true);
    startXRef.current = e.clientX;
    startLeftRef.current = left;
    durationRef.current = Math.max(0, dayjs(bar.end_date).diff(dayjs(bar.start_date), "day"));

    const handleMove = (ev) => {
      const dx = ev.clientX - startXRef.current;
      const newLeft = Math.max(0, startLeftRef.current + dx);
      const newStart = pixelsToDate(newLeft, months) || bar.start_date;
      const newEnd = fmt(dayjs(newStart).add(durationRef.current, "day"));
      onUpdate(bar.id, { start_date: newStart, end_date: newEnd });
    };

    const handleUp = () => {
      setDragging(false);
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  return (
    <Tooltip title={`${bar.title || "(未命名)"} · ${bar.start_date} ~ ${bar.end_date}`} arrow placement="top">
      <Box
        onMouseDown={handleMouseDown}
        onDoubleClick={() => onEdit(bar)}
        sx={{
          position: "absolute",
          left,
          width,
          top: 10,
          height: 22,
          bgcolor: bar.color || "#1565C0",
          borderRadius: "4px",
          cursor: dragging ? "grabbing" : "grab",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          display: "flex",
          alignItems: "center",
          px: 0.5,
          zIndex: 2,
          userSelect: "none",
          overflow: "hidden",
          whiteSpace: "nowrap",
        }}
      >
        <Typography
          variant="caption"
          sx={{ color: "#fff", fontWeight: 600, fontSize: "0.65rem", textShadow: "0 1px 1px rgba(0,0,0,0.4)" }}
        >
          {bar.title}
        </Typography>
      </Box>
    </Tooltip>
  );
}

function DraggableMilestone({ ms, months, onUpdate, onEdit }) {
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);
  const startLeftRef = useRef(0);

  const left = dateToPixels(ms.date, months);

  const handleMouseDown = (e) => {
    e.stopPropagation();
    setDragging(true);
    startXRef.current = e.clientX;
    startLeftRef.current = left;

    const handleMove = (ev) => {
      const dx = ev.clientX - startXRef.current;
      const newLeft = Math.max(0, startLeftRef.current + dx);
      const newDate = pixelsToDate(newLeft, months) || ms.date;
      onUpdate(ms.id, { date: newDate });
    };

    const handleUp = () => {
      setDragging(false);
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  return (
    <Tooltip title={`${ms.title || "(未命名)"} · ${ms.date}`} arrow placement="top">
      <Box
        onMouseDown={handleMouseDown}
        onDoubleClick={() => onEdit(ms)}
        sx={{
          position: "absolute",
          left: left - 9,
          top: 36,
          width: 18,
          height: 18,
          cursor: dragging ? "grabbing" : "grab",
          zIndex: 3,
          userSelect: "none",
        }}
      >
        <svg width={18} height={18}>
          <MilestoneSymbol symbol={ms.symbol} color={ms.color} size={18} />
        </svg>
      </Box>
    </Tooltip>
  );
}

function TrackRow({
  track, months,
  onUpdateBar, onUpdateMilestone,
  onAddBar, onAddMilestone,
  onEditBar, onEditMilestone,
  onEditTrack, onDeleteTrack,
}) {
  return (
    <Box sx={{ display: "flex", height: ROW_HEIGHT, borderBottom: "1px dashed", borderColor: "divider" }}>
      <Box
        sx={{
          width: LABEL_WIDTH,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          px: 1.5,
          borderRight: "1px solid",
          borderColor: "divider",
          bgcolor: alpha(track.label_color || "#1565C0", 0.08),
        }}
      >
        <Tooltip title="编辑轨道">
          <Box
            onClick={() => onEditTrack(track)}
            sx={{
              width: 8,
              height: 36,
              borderRadius: "4px",
              bgcolor: track.label_color || "#1565C0",
              mr: 1.5,
              cursor: "pointer",
            }}
          />
        </Tooltip>
        <Typography
          variant="body2"
          sx={{ fontWeight: 700, fontSize: "0.8rem", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          {track.title}
        </Typography>
        <Tooltip title="删除轨道">
          <IconButton size="small" onClick={() => onDeleteTrack(track.id)} sx={{ p: 0.25 }}>
            <Box component="span" sx={{ fontSize: "0.7rem", color: "text.secondary" }}>✕</Box>
          </IconButton>
        </Tooltip>
      </Box>
      <Box sx={{ position: "relative", flex: 1, minWidth: months.length * MONTH_WIDTH }}>
        {months.map((m, i) => (
          <Box
            key={m.key}
            sx={{
              position: "absolute",
              left: i * MONTH_WIDTH,
              top: 0,
              width: MONTH_WIDTH,
              height: "100%",
              borderRight: "1px solid",
              borderColor: "divider",
              bgcolor: i % 2 === 0 ? "transparent" : alpha("#000", 0.02),
            }}
          />
        ))}
        {track.bars.map((bar) => (
          <DraggableBar
            key={bar.id}
            bar={bar}
            months={months}
            onUpdate={onUpdateBar}
            onEdit={onEditBar}
          />
        ))}
        {track.bars.flatMap((bar) =>
          (bar.milestones || []).map((ms) => (
            <DraggableMilestone
              key={ms.id}
              ms={ms}
              months={months}
              onUpdate={onUpdateMilestone}
              onEdit={onEditMilestone}
            />
          ))
        )}
        <Box sx={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", display: "flex", gap: 0.5 }}>
          <Button size="small" variant="outlined" sx={{ fontSize: "0.65rem", minWidth: 0, px: 1, py: 0.25 }} onClick={() => onAddBar(track.id)}>
            ＋条
          </Button>
          <Button size="small" variant="outlined" sx={{ fontSize: "0.65rem", minWidth: 0, px: 1, py: 0.25 }} onClick={() => onAddMilestone(track.id)}>
            ＋节点
          </Button>
        </Box>
      </Box>
    </Box>
  );
}

function EditTrackDialog({ open, track, onClose, onSave, onDelete }) {
  const [title, setTitle] = useState("");
  const [color, setColor] = useState("#1565C0");

  useEffect(() => {
    if (track) {
      setTitle(track.title || "");
      setColor(track.label_color || "#1565C0");
    }
  }, [track]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>编辑轨道</DialogTitle>
      <DialogContent>
        <TextField
          fullWidth size="small" label="轨道名称"
          value={title} onChange={(e) => setTitle(e.target.value)}
          sx={{ mt: 1, mb: 2 }}
        />
        <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 0.5 }}>左侧色标</Typography>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          {PRESET_COLORS.map((c) => (
            <Box
              key={c}
              onClick={() => setColor(c)}
              sx={{
                width: 28, height: 28, borderRadius: "50%", bgcolor: c, cursor: "pointer",
                border: c === color ? "3px solid #000" : "2px solid #fff",
                boxShadow: "0 0 0 1px #ccc",
              }}
            />
          ))}
        </Box>
      </DialogContent>
      <DialogActions sx={{ justifyContent: "space-between" }}>
        <Button color="error" onClick={onDelete}>删除轨道</Button>
        <Box>
          <Button onClick={onClose}>取消</Button>
          <Button variant="contained" onClick={() => onSave({ title, label_color: color })}>保存</Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}

function EditBarDialog({ open, bar, onClose, onSave, onDelete }) {
  const [title, setTitle] = useState("");
  const [color, setColor] = useState("#1565C0");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  useEffect(() => {
    if (bar) {
      setTitle(bar.title || "");
      setColor(bar.color || "#1565C0");
      setStart(bar.start_date || "");
      setEnd(bar.end_date || "");
    }
  }, [bar]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>编辑进度条</DialogTitle>
      <DialogContent>
        <TextField
          fullWidth size="small" label="名称"
          value={title} onChange={(e) => setTitle(e.target.value)}
          sx={{ mt: 1, mb: 2 }}
        />
        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          <TextField size="small" type="date" label="开始" InputLabelProps={{ shrink: true }} value={start} onChange={(e) => setStart(e.target.value)} />
          <TextField size="small" type="date" label="结束" InputLabelProps={{ shrink: true }} value={end} onChange={(e) => setEnd(e.target.value)} />
        </Stack>
        <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 0.5 }}>颜色</Typography>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          {PRESET_COLORS.map((c) => (
            <Box
              key={c}
              onClick={() => setColor(c)}
              sx={{
                width: 28, height: 28, borderRadius: "50%", bgcolor: c, cursor: "pointer",
                border: c === color ? "3px solid #000" : "2px solid #fff",
                boxShadow: "0 0 0 1px #ccc",
              }}
            />
          ))}
        </Box>
      </DialogContent>
      <DialogActions sx={{ justifyContent: "space-between" }}>
        <Button color="error" onClick={onDelete}>删除</Button>
        <Box>
          <Button onClick={onClose}>取消</Button>
          <Button variant="contained" onClick={() => onSave({ title, color, start_date: start, end_date: end })}>保存</Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}

function EditMilestoneDialog({ open, ms, onClose, onSave, onDelete }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [symbol, setSymbol] = useState("circle");
  const [color, setColor] = useState("#D32F2F");

  useEffect(() => {
    if (ms) {
      setTitle(ms.title || "");
      setDate(ms.date || "");
      setSymbol(ms.symbol || "circle");
      setColor(ms.color || "#D32F2F");
    }
  }, [ms]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>编辑关键节点</DialogTitle>
      <DialogContent>
        <TextField
          fullWidth size="small" label="名称"
          value={title} onChange={(e) => setTitle(e.target.value)}
          sx={{ mt: 1, mb: 2 }}
        />
        <TextField
          fullWidth size="small" type="date" label="日期"
          InputLabelProps={{ shrink: true }}
          value={date} onChange={(e) => setDate(e.target.value)}
          sx={{ mb: 2 }}
        />
        <FormControl fullWidth size="small" sx={{ mb: 2 }}>
          <InputLabel>符号</InputLabel>
          <Select value={symbol} label="符号" onChange={(e) => setSymbol(e.target.value)}>
            {SYMBOLS.map((s) => (
              <MenuItem key={s.key} value={s.key}>{s.label}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 0.5 }}>颜色</Typography>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          {PRESET_COLORS.map((c) => (
            <Box
              key={c}
              onClick={() => setColor(c)}
              sx={{
                width: 28, height: 28, borderRadius: "50%", bgcolor: c, cursor: "pointer",
                border: c === color ? "3px solid #000" : "2px solid #fff",
                boxShadow: "0 0 0 1px #ccc",
              }}
            />
          ))}
        </Box>
      </DialogContent>
      <DialogActions sx={{ justifyContent: "space-between" }}>
        <Button color="error" onClick={onDelete}>删除</Button>
        <Box>
          <Button onClick={onClose}>取消</Button>
          <Button variant="contained" onClick={() => onSave({ title, date, symbol, color })}>保存</Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}

function CreateScheduleDialog({ open, onClose, onCreate }) {
  const [title, setTitle] = useState("");
  const [start, setStart] = useState(fmt(dayjs().startOf("year")));
  const [end, setEnd] = useState(fmt(dayjs().add(1, "year").endOf("month")));

  const handleCreate = () => {
    if (!start || !end || start > end) {
      alert("请检查日期范围");
      return;
    }
    onCreate({ title: title || "未命名排期", start_date: start, end_date: end });
    setTitle("");
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>创建排期</DialogTitle>
      <DialogContent>
        <TextField
          fullWidth size="small" label="排期名称"
          value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="如：XXX 项目初步排期"
          sx={{ mt: 1, mb: 2 }}
        />
        <Stack direction="row" spacing={1}>
          <TextField
            fullWidth size="small" type="date" label="开始日期"
            InputLabelProps={{ shrink: true }}
            value={start} onChange={(e) => setStart(e.target.value)}
          />
          <TextField
            fullWidth size="small" type="date" label="结束日期"
            InputLabelProps={{ shrink: true }}
            value={end} onChange={(e) => setEnd(e.target.value)}
          />
        </Stack>
        <Typography variant="caption" sx={{ color: "text.secondary", mt: 1, display: "block" }}>
          时间轴将以「季度 + 月」为单位，创建后可以再调整时间段。
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button variant="contained" onClick={handleCreate}>创建</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function QuickSchedulePage() {
  const [schedules, setSchedules] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTrack, setEditTrack] = useState(null);
  const [editBar, setEditBar] = useState(null);
  const [editMilestone, setEditMilestone] = useState(null);
  const [search, setSearch] = useState("");

  const loadList = useCallback(async () => {
    try {
      const r = await api.quickSchedules.list();
      setSchedules(r.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id) => {
    try {
      const r = await api.quickSchedules.get(id);
      setSchedule(r.data);
      setSelectedId(r.data.id);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const handleCreate = async (data) => {
    try {
      const r = await api.quickSchedules.create(data);
      setSchedules((prev) => [r.data, ...prev]);
      setSelectedId(r.data.id);
      setCreateOpen(false);
    } catch (err) {
      alert(err.message || "创建失败");
    }
  };

  const handleDeleteSchedule = async (id) => {
    if (!window.confirm("确定删除该排期？")) return;
    await api.quickSchedules.remove(id);
    setSchedules((prev) => prev.filter((s) => s.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
      setSchedule(null);
    }
  };

  const handleAddTrack = async () => {
    if (!selectedId) return;
    const title = window.prompt("轨道名称", "新进度");
    if (!title) return;
    const r = await api.quickSchedules.tracks.create(selectedId, { title });
    setSchedule(r.data.schedule);
  };

  const handleUpdateTrack = async (trackId, data) => {
    const r = await api.quickSchedules.tracks.update(selectedId, trackId, data);
    setSchedule(r.data);
    setEditTrack(null);
  };

  const handleDeleteTrack = async (trackId) => {
    if (!window.confirm("确定删除该轨道？")) return;
    const r = await api.quickSchedules.tracks.remove(selectedId, trackId);
    setSchedule(r.data);
    setEditTrack(null);
  };

  const handleAddBar = async (trackId) => {
    if (!schedule) return;
    const title = window.prompt("进度条名称", "");
    if (title === null) return;
    const r = await api.quickSchedules.bars.create(selectedId, {
      track_id: trackId,
      title,
      start_date: schedule.start_date,
      end_date: fmt(dayjs(schedule.start_date).add(1, "month")),
    });
    setSchedule(r.data.schedule);
  };

  const handleUpdateBar = async (barId, data) => {
    setSchedule((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        tracks: prev.tracks.map((t) => ({
          ...t,
          bars: t.bars.map((b) => (b.id === barId ? { ...b, ...data } : b)),
        })),
      };
    });
    try {
      const r = await api.quickSchedules.bars.update(selectedId, barId, data);
      setSchedule(r.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveBarDialog = async (data) => {
    const r = await api.quickSchedules.bars.update(selectedId, editBar.id, data);
    setSchedule(r.data);
    setEditBar(null);
  };

  const handleDeleteBar = async () => {
    const r = await api.quickSchedules.bars.remove(selectedId, editBar.id);
    setSchedule(r.data);
    setEditBar(null);
  };

  const handleAddMilestone = async (trackId) => {
    if (!schedule) return;
    const title = window.prompt("关键节点名称", "");
    if (title === null) return;
    const r = await api.quickSchedules.milestones.create(selectedId, {
      track_id: trackId,
      title,
      date: schedule.start_date,
      symbol: "circle",
      color: "#D32F2F",
    });
    setSchedule(r.data.schedule);
  };

  const handleUpdateMilestone = async (milestoneId, data) => {
    setSchedule((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        tracks: prev.tracks.map((t) => ({
          ...t,
          bars: t.bars.map((b) => ({
            ...b,
            milestones: (b.milestones || []).map((m) => (m.id === milestoneId ? { ...m, ...data } : m)),
          })),
        })),
      };
    });
    try {
      const r = await api.quickSchedules.milestones.update(selectedId, milestoneId, data);
      setSchedule(r.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveMilestoneDialog = async (data) => {
    const r = await api.quickSchedules.milestones.update(selectedId, editMilestone.id, data);
    setSchedule(r.data);
    setEditMilestone(null);
  };

  const handleDeleteMilestone = async () => {
    const r = await api.quickSchedules.milestones.remove(selectedId, editMilestone.id);
    setSchedule(r.data);
    setEditMilestone(null);
  };

  const handleUpdateRange = async () => {
    if (!schedule) return;
    const start = window.prompt("开始日期", schedule.start_date);
    if (start === null) return;
    const end = window.prompt("结束日期", schedule.end_date);
    if (end === null) return;
    const r = await api.quickSchedules.update(schedule.id, { start_date: start, end_date: end });
    setSchedule(r.data);
  };

  const months = useMemo(() => {
    if (!schedule) return [];
    const list = buildMonths(schedule.start_date, schedule.end_date);
    if (list.length < MIN_SCHEDULE_MONTHS) {
      let last = dayjs(list[list.length - 1].end);
      while (list.length < MIN_SCHEDULE_MONTHS) {
        const next = last.add(1, "month").startOf("month");
        list.push({
          year: next.year(),
          month: next.month() + 1,
          key: next.format("YYYY-MM"),
          start: next.startOf("month").format("YYYY-MM-DD"),
          end: next.endOf("month").format("YYYY-MM-DD"),
        });
        last = next;
      }
    }
    return list;
  }, [schedule]);

  const quarters = useMemo(() => buildQuarters(months), [months]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return schedules;
    return schedules.filter((s) => (s.title || "").toLowerCase().includes(q));
  }, [schedules, search]);

  return (
    <Box sx={{ p: 3, height: "calc(100vh - 64px)", display: "flex", flexDirection: "column" }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <PageHeader
          title="快速排期"
          subtitle="会议时快速搭建多轨道项目排期模拟，拖拽即可调整进度与关键节点"
        />
        <Button variant="contained" onClick={() => setCreateOpen(true)}>＋ 创建排期</Button>
      </Box>

      <Box sx={{ flex: 1, display: "flex", gap: 2, minHeight: 0 }}>
        <Box
          sx={{
            width: 260, flexShrink: 0, border: "1px solid", borderColor: "divider",
            borderRadius: 2, display: "flex", flexDirection: "column", bgcolor: "background.paper",
          }}
        >
          <Box sx={{ p: 1.5, borderBottom: "1px solid", borderColor: "divider" }}>
            <TextField
              size="small" fullWidth placeholder="搜索排期…"
              value={search} onChange={(e) => setSearch(e.target.value)}
            />
          </Box>
          <Box sx={{ flex: 1, overflowY: "auto", p: 1 }}>
            {loading ? (
              <Typography variant="body2" sx={{ p: 2, color: "text.secondary", textAlign: "center" }}>加载中…</Typography>
            ) : filtered.length === 0 ? (
              <Typography variant="body2" sx={{ p: 2, color: "text.secondary", textAlign: "center" }}>
                暂无排期，点右上角创建
              </Typography>
            ) : (
              filtered.map((s) => (
                <Box
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  sx={{
                    p: 1.25, mb: 0.75, borderRadius: 1.5, cursor: "pointer",
                    border: "1px solid",
                    borderColor: s.id === selectedId ? "primary.main" : "transparent",
                    bgcolor: s.id === selectedId ? alpha("#7C3AED", 0.08) : "transparent",
                    "&:hover": { bgcolor: s.id === selectedId ? alpha("#7C3AED", 0.12) : "#F3F4F6" },
                  }}
                >
                  <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: "0.85rem", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.title}
                    </Typography>
                    <IconButton
                      size="small"
                      onClick={(e) => { e.stopPropagation(); handleDeleteSchedule(s.id); }}
                      sx={{ p: 0.25 }}
                    >
                      <Box component="span" sx={{ fontSize: "0.7rem", color: "text.secondary" }}>✕</Box>
                    </IconButton>
                  </Stack>
                  <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.3 }}>
                    {s.start_date} ~ {s.end_date}
                  </Typography>
                </Box>
              ))
            )}
          </Box>
        </Box>

        <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          {schedule ? (
            <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, border: "1px solid", borderColor: "divider", borderRadius: 2, bgcolor: "background.paper" }}>
              <Box sx={{ p: 1.5, display: "flex", alignItems: "center", gap: 1, borderBottom: "1px solid", borderColor: "divider", flexWrap: "wrap" }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1 }}>
                  {schedule.title}
                </Typography>
                <Chip
                  size="small"
                  label={`${schedule.start_date} ~ ${schedule.end_date}`}
                  onClick={handleUpdateRange}
                  sx={{ cursor: "pointer" }}
                />
                <Button size="small" variant="outlined" onClick={handleAddTrack}>＋ 新增轨道</Button>
              </Box>

              <Box sx={{ flex: 1, overflow: "auto", minHeight: 0 }}>
                <Box sx={{ minWidth: LABEL_WIDTH + months.length * MONTH_WIDTH }}>
                  <TimelineHeader months={months} quarters={quarters} />
                  {schedule.tracks.length === 0 ? (
                    <Box sx={{ p: 4, textAlign: "center", color: "text.secondary" }}>
                      暂无轨道，点「＋ 新增轨道」开始搭建
                    </Box>
                  ) : (
                    schedule.tracks.map((track) => (
                      <TrackRow
                        key={track.id}
                        track={track}
                        months={months}
                        onUpdateBar={handleUpdateBar}
                        onUpdateMilestone={handleUpdateMilestone}
                        onAddBar={handleAddBar}
                        onAddMilestone={handleAddMilestone}
                        onEditBar={setEditBar}
                        onEditMilestone={setEditMilestone}
                        onEditTrack={setEditTrack}
                        onDeleteTrack={handleDeleteTrack}
                      />
                    ))
                  )}
                </Box>
              </Box>

              <Box sx={{ p: 1, borderTop: "1px solid", borderColor: "divider", display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                <Typography variant="caption" sx={{ color: "text.secondary" }}>提示：</Typography>
                <Typography variant="caption" sx={{ color: "text.secondary" }}>· 拖拽进度条左右移动日期</Typography>
                <Typography variant="caption" sx={{ color: "text.secondary" }}>· 拖拽节点符号调整时间</Typography>
                <Typography variant="caption" sx={{ color: "text.secondary" }}>· 双击可编辑</Typography>
                <Typography variant="caption" sx={{ color: "text.secondary", ml: "auto" }}>共 {schedule.tracks.length} 个轨道 / {schedule.tracks.reduce((s, t) => s + t.bars.length, 0)} 个进度条</Typography>
              </Box>
            </Box>
          ) : (
            <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", border: "1px dashed", borderColor: "divider", borderRadius: 2, color: "text.secondary" }}>
              选择或新建一个排期开始模拟
            </Box>
          )}
        </Box>
      </Box>

      <CreateScheduleDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreate={handleCreate} />
      {editTrack && (
        <EditTrackDialog
          open={!!editTrack}
          track={editTrack}
          onClose={() => setEditTrack(null)}
          onSave={(d) => handleUpdateTrack(editTrack.id, d)}
          onDelete={() => handleDeleteTrack(editTrack.id)}
        />
      )}
      {editBar && (
        <EditBarDialog
          open={!!editBar}
          bar={editBar}
          onClose={() => setEditBar(null)}
          onSave={handleSaveBarDialog}
          onDelete={handleDeleteBar}
        />
      )}
      {editMilestone && (
        <EditMilestoneDialog
          open={!!editMilestone}
          ms={editMilestone}
          onClose={() => setEditMilestone(null)}
          onSave={handleSaveMilestoneDialog}
          onDelete={handleDeleteMilestone}
        />
      )}
    </Box>
  );
}
