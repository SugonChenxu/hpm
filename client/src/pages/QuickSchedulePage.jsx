import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Box, Typography, Button, TextField, Dialog, DialogTitle, DialogContent,
  DialogActions, IconButton, Tooltip, Stack, Chip, MenuItem, Select,
  FormControl, InputLabel, alpha, Popover,
} from "@mui/material";
import dayjs from "dayjs";
import api from "../api/client";
import PageHeader from "../components/common/PageHeader";

const ROW_HEIGHT = 64;
const HEADER_HEIGHT = 72;
const LABEL_WIDTH = 160;
const MIN_SCHEDULE_MONTHS = 6;
const MIN_MONTH_WIDTH = 24; // 月份过多时兜底最小宽度（避免标签完全挤压）

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

// 关键节点文字颜色（默认黑色优先）
const TEXT_COLORS = [
  "#000000", "#555555", "#D32F2F", "#E65100",
  "#388E3C", "#1565C0", "#6A1B9A", "#00838F",
];

function fmt(d) {
  return dayjs(d).format("YYYY-MM-DD");
}

function clampDate(d, min, max) {
  if (min && d < min) return min;
  if (max && d > max) return max;
  return d;
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
    quarters.push({ label: `${m.year} Q${q}`, startIdx, count: j - startIdx });
    i = j;
  }
  return quarters;
}

function dateToPixels(date, months, monthWidth) {
  if (months.length === 0) return 0;
  const d = dayjs(date);
  const first = dayjs(months[0].start);
  const lastIdx = months.length - 1;
  const lastEnd = dayjs(months[lastIdx].end);
  if (d.isBefore(first)) return 0;
  if (d.isAfter(lastEnd)) return months.length * monthWidth;
  const monthIdx = months.findIndex((m) => d.format("YYYY-MM") === m.key);
  const safeIdx = monthIdx >= 0 ? monthIdx : 0;
  const monthStart = dayjs(months[safeIdx].start);
  const monthEnd = dayjs(months[safeIdx].end);
  const totalDays = monthEnd.diff(monthStart, "day") + 1;
  const passed = d.diff(monthStart, "day");
  return safeIdx * monthWidth + (passed / totalDays) * monthWidth;
}

function pixelsToDate(px, months, monthWidth) {
  if (months.length === 0) return null;
  if (px <= 0) return months[0].start;
  const total = months.length * monthWidth;
  if (px >= total) return months[months.length - 1].end;
  const idx = Math.min(months.length - 1, Math.floor(px / monthWidth));
  const offset = px - idx * monthWidth;
  const month = months[idx];
  const monthStart = dayjs(month.start);
  const monthEnd = dayjs(month.end);
  const totalDays = monthEnd.diff(monthStart, "day") + 1;
  const days = Math.round((offset / monthWidth) * totalDays);
  return fmt(monthStart.add(days, "day"));
}

function MilestoneSymbol({ symbol, color, size = 14 }) {
  const s = size;
  const half = s / 2;
  switch (symbol) {
    case "circle":
      return <circle cx={half} cy={half} r={half - 1} fill={color} />;
    case "square": {
      // 矩形：高度不变（≈s），宽度减小（竖矩形）
      const w = s * 0.58;
      return <rect x={half - w / 2} y={0.5} width={w} height={s - 1} fill={color} />;
    }
    case "diamond":
      return <polygon points={`${half},1 ${s - 1},${half} ${half},${s - 1} 1,${half}`} fill={color} />;
    case "triangle":
      return <polygon points={`${half},0.5 ${s - 0.5},${s - 0.5} 0.5,${s - 0.5}`} fill={color} />;
    case "star": {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? half : half * 0.48;
        const ang = (Math.PI / 5) * i - Math.PI / 2;
        pts.push(`${half + r * Math.cos(ang)},${half + r * Math.sin(ang)}`);
      }
      return <polygon points={pts.join(" ")} fill={color} />;
    }
    case "flag":
      // 旗帜放大：旗杆占满高度，旗面为向右展开的大三角
      return (
        <>
          <path d={`M${half},0.5 L${half},${s - 0.5}`} stroke={color} strokeWidth={2} />
          <polygon points={`${half},0.5 ${s - 0.5},${half * 0.5} ${half},${s * 0.72}`} fill={color} />
        </>
      );
    default:
      return <circle cx={half} cy={half} r={half - 1} fill={color} />;
  }
}

function TimelineHeader({ months, quarters, monthWidth }) {
  const totalWidth = months.length * monthWidth;
  return (
    <Box sx={{ display: "flex", height: HEADER_HEIGHT, position: "sticky", top: 0, zIndex: 5, bgcolor: "background.paper" }}>
      <Box sx={{ width: LABEL_WIDTH, flexShrink: 0, borderRight: "1px solid", borderColor: "divider", borderBottom: "1px solid", borderColor: "divider" }} />
      <Box sx={{ position: "relative", width: totalWidth, height: "100%", borderBottom: "1px solid", borderColor: "divider" }}>
        {quarters.map((q, i) => (
          <Box
            key={`q-${i}`}
            sx={{
              position: "absolute",
              left: q.startIdx * monthWidth,
              width: q.count * monthWidth,
              height: HEADER_HEIGHT / 2,
              bgcolor: "#A94442",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: "0.75rem",
              whiteSpace: "nowrap",
              overflow: "hidden",
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
              left: i * monthWidth,
              top: HEADER_HEIGHT / 2,
              width: monthWidth,
              height: HEADER_HEIGHT / 2,
              bgcolor: "#D9A6A5",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 600,
              fontSize: "0.7rem",
              whiteSpace: "nowrap",
              overflow: "hidden",
              borderRight: "1px solid rgba(255,255,255,0.3)",
            }}
          >
            {monthWidth < 34 ? m.month : `${m.month}月`}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

/** 箭头直线：轨道主体，两端可拖拽调整起止，线体可拖拽平移 */
function ArrowBar({ bar, months, monthWidth, minDate, maxDate, onUpdate, onEdit }) {
  const [dragging, setDragging] = useState(false);
  const dragModeRef = useRef("move");
  const startXRef = useRef(0);
  const startLeftRef = useRef(0);
  const rightRef = useRef(0);

  const left = dateToPixels(bar.start_date, months, monthWidth);
  const right = dateToPixels(bar.end_date, months, monthWidth);
  const width = Math.max(24, right - left);
  const color = bar.color || "#1565C0";

  const startDrag = (mode, e) => {
    e.stopPropagation();
    setDragging(true);
    dragModeRef.current = mode;
    startXRef.current = e.clientX;
    startLeftRef.current = left;
    rightRef.current = right;

    const handleMove = (ev) => {
      const dx = ev.clientX - startXRef.current;
      if (dragModeRef.current === "start") {
        const newLeft = Math.max(0, startLeftRef.current + dx);
        const newStart = clampDate(pixelsToDate(newLeft, months, monthWidth), minDate, bar.end_date);
        onUpdate(bar.id, { start_date: newStart });
      } else if (dragModeRef.current === "end") {
        const newRight = startLeftRef.current + width + dx;
        const newEnd = clampDate(pixelsToDate(newRight, months, monthWidth), bar.start_date, maxDate);
        onUpdate(bar.id, { end_date: newEnd });
      } else {
        const newLeft = Math.max(0, startLeftRef.current + dx);
        let newStart = pixelsToDate(newLeft, months, monthWidth);
        const duration = dayjs(bar.end_date).diff(dayjs(bar.start_date), "day");
        let newEnd = fmt(dayjs(newStart).add(duration, "day"));
        if (maxDate && newEnd > maxDate) {
          newEnd = maxDate;
          newStart = clampDate(fmt(dayjs(newEnd).subtract(duration, "day")), minDate, maxDate);
        }
        onUpdate(bar.id, { start_date: newStart, end_date: newEnd });
      }
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
        sx={{
          position: "absolute",
          left,
          width,
          top: 0,
          height: ROW_HEIGHT,
          zIndex: 2,
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        {/* 线体：点击区 10px 高（27~37），视觉线 2px 居中，中线 32，与节点符号中心对齐 */}
        <Box
          onMouseDown={(e) => startDrag("move", e)}
          onDoubleClick={() => onEdit(bar)}
          sx={{ position: "absolute", left: 8, right: 12, top: 27, height: 10, pointerEvents: "auto" }}
        >
          <Box sx={{ position: "absolute", left: 0, right: 0, top: 4, height: 2, bgcolor: color }} />
        </Box>
        <Box
          onMouseDown={(e) => startDrag("start", e)}
          sx={{
            position: "absolute", left: 0, top: 27, width: 14, height: 10,
            cursor: "ew-resize", display: "flex", alignItems: "center", justifyContent: "center",
            pointerEvents: "auto",
          }}
        >
          <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: color, border: "2px solid #fff", boxShadow: "0 0 0 1px rgba(0,0,0,0.2)" }} />
        </Box>
        {/* 右端箭头：绝对 top 25，箭头尖中线 32（svg display:block 消除 baseline 偏移） */}
        <Box
          onMouseDown={(e) => startDrag("end", e)}
          sx={{ position: "absolute", right: 0, top: 25, width: 16, height: 14, cursor: "ew-resize", pointerEvents: "auto" }}
        >
          <svg width={16} height={14} style={{ display: "block" }}>
            <polygon points="1,1 16,7 1,13" fill={color} />
          </svg>
        </Box>
      </Box>
    </Tooltip>
  );
}

/** 普通矩形进度条：整条平移 */
function RectBar({ bar, months, monthWidth, minDate, maxDate, onUpdate, onEdit }) {
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);
  const startLeftRef = useRef(0);
  const durationRef = useRef(0);

  const left = dateToPixels(bar.start_date, months, monthWidth);
  const right = dateToPixels(bar.end_date, months, monthWidth);
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
      let newStart = pixelsToDate(newLeft, months, monthWidth) || bar.start_date;
      newStart = clampDate(newStart, minDate, maxDate);
      let newEnd = fmt(dayjs(newStart).add(durationRef.current, "day"));
      if (maxDate && newEnd > maxDate) {
        newEnd = maxDate;
        newStart = clampDate(fmt(dayjs(newEnd).subtract(durationRef.current, "day")), minDate, maxDate);
      }
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
          top: 23, // 中心 32，与轨道名称文字中心、箭头直线对齐
          height: 18,
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
        <Typography variant="caption" sx={{ color: "#fff", fontWeight: 600, fontSize: "0.62rem", textShadow: "0 1px 1px rgba(0,0,0,0.4)" }}>
          {bar.title}
        </Typography>
      </Box>
    </Tooltip>
  );
}

function DraggableMilestone({ ms, months, monthWidth, minDate, maxDate, onUpdate, onEdit }) {
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);
  const startLeftRef = useRef(0);

  const left = dateToPixels(ms.date, months, monthWidth);

  const handleMouseDown = (e) => {
    e.stopPropagation();
    setDragging(true);
    startXRef.current = e.clientX;
    startLeftRef.current = left;

    const handleMove = (ev) => {
      const dx = ev.clientX - startXRef.current;
      const newLeft = Math.max(0, startLeftRef.current + dx);
      const newDate = clampDate(pixelsToDate(newLeft, months, monthWidth), minDate, maxDate) || ms.date;
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
          left: left - 40,
          top: 23, // 符号 18px 高，top 23 → 中心 32，与轨道线中线对齐
          width: 80,
          height: 44,
          cursor: dragging ? "grabbing" : "grab",
          zIndex: 3,
          userSelect: "none",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <svg width={18} height={18} style={{ flexShrink: 0 }}>
          <MilestoneSymbol symbol={ms.symbol} color={ms.color} size={18} />
        </svg>
        <Typography
          variant="caption"
          sx={{
            mt: 0.5,
            fontSize: "0.6rem",
            fontWeight: 600,
            lineHeight: 1.15,
            color: ms.text_color || "#000000",
            textAlign: "center",
            whiteSpace: "nowrap",
            maxWidth: 80,
            overflow: "hidden",
            textOverflow: "ellipsis",
            pointerEvents: "none",
          }}
        >
          {ms.title}
        </Typography>
      </Box>
    </Tooltip>
  );
}

function TrackRow({
  track, months, monthWidth, minDate, maxDate,
  onUpdateBar, onUpdateMilestone,
  onAddMilestone,
  onEditBar, onEditMilestone,
  onUpdateTrack, onDeleteTrack,
  dragTrackId, dragOverTrackId,
  onDragStart, onDragOver, onDrop, onDragEnd,
}) {
  const totalWidth = months.length * monthWidth;
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(track.title);
  const [colorAnchor, setColorAnchor] = useState(null);

  const commitName = () => {
    setEditingName(false);
    const t = nameDraft.trim();
    if (t && t !== track.title) onUpdateTrack(track.id, { title: t });
  };

  return (
    <Box sx={{ display: "flex", height: ROW_HEIGHT, borderBottom: "1px dashed", borderColor: "divider" }}>
      <Box
        draggable={!editingName}
        onDragStart={(e) => onDragStart(e, track.id)}
        onDragOver={(e) => onDragOver(e, track.id)}
        onDrop={(e) => onDrop(track.id)}
        onDragEnd={onDragEnd}
        sx={{
          width: LABEL_WIDTH,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          px: 1.5,
          borderRight: "1px solid",
          borderColor: "divider",
          cursor: "grab",
          opacity: dragTrackId === track.id ? 0.5 : 1,
          bgcolor: dragOverTrackId === track.id
            ? alpha(track.label_color || "#1565C0", 0.22)
            : alpha(track.label_color || "#1565C0", 0.08),
        }}
      >
        <Tooltip title="修改颜色">
          <Box
            onClick={(e) => setColorAnchor(e.currentTarget)}
            sx={{
              width: 10, height: 36, borderRadius: "4px",
              bgcolor: track.label_color || "#1565C0", mr: 1.5, cursor: "pointer",
              "&:hover": { boxShadow: "0 0 0 2px rgba(0,0,0,0.15)" },
            }}
          />
        </Tooltip>
        <Popover
          open={Boolean(colorAnchor)}
          anchorEl={colorAnchor}
          onClose={() => setColorAnchor(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        >
          <Box sx={{ p: 1, display: "flex", gap: 0.5 }}>
            {PRESET_COLORS.map((c) => (
              <Box
                key={c}
                onClick={() => { onUpdateTrack(track.id, { label_color: c }); setColorAnchor(null); }}
                sx={{
                  width: 24, height: 24, borderRadius: "50%", bgcolor: c, cursor: "pointer",
                  border: c === track.label_color ? "3px solid #000" : "2px solid #fff",
                  boxShadow: "0 0 0 1px #ccc",
                }}
              />
            ))}
          </Box>
        </Popover>
        {editingName ? (
          <TextField
            autoFocus
            size="small"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitName();
              else if (e.key === "Escape") setEditingName(false);
            }}
            sx={{ flex: 1, "& .MuiInputBase-input": { fontSize: "0.8rem", fontWeight: 700, py: 0.25 } }}
          />
        ) : (
          <Typography
            variant="body2"
            onClick={() => { setNameDraft(track.title); setEditingName(true); }}
            sx={{
              fontWeight: 700, fontSize: "0.8rem", flex: 1,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              cursor: "text", "&:hover": { color: "primary.main" },
            }}
          >
            {track.title}
          </Typography>
        )}
        <Tooltip title="删除轨道">
          <IconButton size="small" onClick={() => onDeleteTrack(track.id)} sx={{ p: 0.25 }}>
            <Box component="span" sx={{ fontSize: "0.7rem", color: "text.secondary" }}>✕</Box>
          </IconButton>
        </Tooltip>
      </Box>
      <Box sx={{ position: "relative", flex: 1, minWidth: totalWidth }}>
        {months.map((m, i) => (
          <Box
            key={m.key}
            sx={{
              position: "absolute",
              left: i * monthWidth,
              top: 0,
              width: monthWidth,
              height: "100%",
              borderRight: "1px solid",
              borderColor: "divider",
              bgcolor: i % 2 === 0 ? "transparent" : alpha("#000", 0.02),
            }}
          />
        ))}
        {track.bars.map((bar) =>
          bar.style === "arrow" ? (
            <ArrowBar
              key={bar.id}
              bar={bar}
              months={months}
              monthWidth={monthWidth}
              minDate={minDate}
              maxDate={maxDate}
              onUpdate={onUpdateBar}
              onEdit={onEditBar}
            />
          ) : (
            <RectBar
              key={bar.id}
              bar={bar}
              months={months}
              monthWidth={monthWidth}
              minDate={minDate}
              maxDate={maxDate}
              onUpdate={onUpdateBar}
              onEdit={onEditBar}
            />
          )
        )}
        {(track.milestones || []).map((ms) => (
          <DraggableMilestone
            key={ms.id}
            ms={ms}
            months={months}
            monthWidth={monthWidth}
            minDate={minDate}
            maxDate={maxDate}
            onUpdate={onUpdateMilestone}
            onEdit={onEditMilestone}
          />
        ))}
        <Box sx={{ position: "absolute", right: 4, bottom: 2, display: "flex", gap: 0.25, zIndex: 6 }}>
          <Button size="small" variant="outlined" sx={{ fontSize: "0.58rem", minWidth: 0, px: 0.5, py: 0, lineHeight: 1.3 }} onClick={() => onAddMilestone(track.id)}>
            ＋节点
          </Button>
        </Box>
      </Box>
    </Box>
  );
}

function EditBarDialog({ open, bar, onClose, onSave, onDelete }) {
  const [title, setTitle] = useState("");
  const [color, setColor] = useState("#1565C0");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [style, setStyle] = useState("bar");

  useEffect(() => {
    if (bar) {
      setTitle(bar.title || "");
      setColor(bar.color || "#1565C0");
      setStart(bar.start_date || "");
      setEnd(bar.end_date || "");
      setStyle(bar.style || "bar");
    }
  }, [bar]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>编辑进度条</DialogTitle>
      <DialogContent>
        <TextField fullWidth size="small" label="名称" value={title} onChange={(e) => setTitle(e.target.value)} sx={{ mt: 1, mb: 2 }} />
        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          <TextField size="small" type="date" label="开始" InputLabelProps={{ shrink: true }} value={start} onChange={(e) => setStart(e.target.value)} />
          <TextField size="small" type="date" label="结束" InputLabelProps={{ shrink: true }} value={end} onChange={(e) => setEnd(e.target.value)} />
        </Stack>
        <FormControl fullWidth size="small" sx={{ mb: 2 }}>
          <InputLabel>样式</InputLabel>
          <Select value={style} label="样式" onChange={(e) => setStyle(e.target.value)}>
            <MenuItem value="bar">矩形进度条</MenuItem>
            <MenuItem value="arrow">带箭头直线</MenuItem>
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
                border: c === color ? "3px solid #000" : "2px solid #fff", boxShadow: "0 0 0 1px #ccc",
              }}
            />
          ))}
        </Box>
      </DialogContent>
      <DialogActions sx={{ justifyContent: "space-between" }}>
        <Button color="error" onClick={onDelete}>删除</Button>
        <Box>
          <Button onClick={onClose}>取消</Button>
          <Button variant="contained" onClick={() => onSave({ title, color, start_date: start, end_date: end, style })}>保存</Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}

function EditMilestoneDialog({ open, ms, defaultDate, onClose, onSave, onDelete }) {
  const isEdit = !!ms;
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [symbol, setSymbol] = useState("circle");
  const [color, setColor] = useState("#D32F2F");
  const [textColor, setTextColor] = useState("#000000");

  useEffect(() => {
    if (open) {
      if (ms) {
        setTitle(ms.title || "");
        setDate(ms.date || "");
        setSymbol(ms.symbol || "circle");
        setColor(ms.color || "#D32F2F");
        setTextColor(ms.text_color || "#000000");
      } else {
        setTitle("");
        setDate(defaultDate || "");
        setSymbol("circle");
        setColor("#D32F2F");
        setTextColor("#000000");
      }
    }
  }, [open, ms, defaultDate]);

  const handleSave = () => {
    if (!date) {
      alert("请选择日期");
      return;
    }
    onSave({ title, date, symbol, color, text_color: textColor });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{isEdit ? "编辑关键节点" : "新增关键节点"}</DialogTitle>
      <DialogContent>
        <TextField fullWidth size="small" label="名称" value={title} onChange={(e) => setTitle(e.target.value)} sx={{ mt: 1, mb: 2 }} />
        <TextField fullWidth size="small" type="date" label="日期" InputLabelProps={{ shrink: true }} value={date} onChange={(e) => setDate(e.target.value)} sx={{ mb: 2 }} />
        <FormControl fullWidth size="small" sx={{ mb: 2 }}>
          <InputLabel>符号</InputLabel>
          <Select value={symbol} label="符号" onChange={(e) => setSymbol(e.target.value)}>
            {SYMBOLS.map((s) => (
              <MenuItem key={s.key} value={s.key}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <svg width={16} height={16}>
                    <MilestoneSymbol symbol={s.key} color="#333" size={16} />
                  </svg>
                  {s.label}
                </Box>
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 0.5 }}>符号颜色</Typography>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
          {PRESET_COLORS.map((c) => (
            <Box
              key={c}
              onClick={() => setColor(c)}
              sx={{
                width: 26, height: 26, borderRadius: "50%", bgcolor: c, cursor: "pointer",
                border: c === color ? "3px solid #000" : "2px solid #fff", boxShadow: "0 0 0 1px #ccc",
              }}
            />
          ))}
        </Box>
        <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 0.5 }}>文字颜色</Typography>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          {TEXT_COLORS.map((c) => (
            <Box
              key={c}
              onClick={() => setTextColor(c)}
              sx={{
                width: 26, height: 26, borderRadius: "50%", bgcolor: c, cursor: "pointer",
                border: c === textColor ? "3px solid #7C3AED" : "2px solid #fff", boxShadow: "0 0 0 1px #ccc",
              }}
            />
          ))}
        </Box>
      </DialogContent>
      <DialogActions sx={{ justifyContent: "space-between" }}>
        {isEdit ? <Button color="error" onClick={onDelete}>删除</Button> : <Box />}
        <Box>
          <Button onClick={onClose}>取消</Button>
          <Button variant="contained" onClick={handleSave}>保存</Button>
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
        <TextField fullWidth size="small" label="排期名称" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="如：XXX 项目初步排期" sx={{ mt: 1, mb: 2 }} />
        <Stack direction="row" spacing={1}>
          <TextField fullWidth size="small" type="date" label="开始日期" InputLabelProps={{ shrink: true }} value={start} onChange={(e) => setStart(e.target.value)} />
          <TextField fullWidth size="small" type="date" label="结束日期" InputLabelProps={{ shrink: true }} value={end} onChange={(e) => setEnd(e.target.value)} />
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

/** 顶部日期字段：点击弹出日历（date input），选择后立即保存 */
function DateFieldPopover({ label, value, onChange }) {
  const [anchor, setAnchor] = useState(null);
  const open = Boolean(anchor);

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{ textTransform: "none", fontVariantNumeric: "tabular-nums", fontWeight: 600, fontSize: "0.8rem" }}
      >
        {label ? `${label} ${value}` : value}
      </Button>
      <Popover
        open={open}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      >
        <Box sx={{ p: 1 }}>
          <TextField
            autoFocus
            size="small"
            type="date"
            value={value}
            onChange={(e) => {
              const v = e.target.value;
              setAnchor(null);
              if (v) onChange(v);
            }}
          />
        </Box>
      </Popover>
    </>
  );
}

export default function QuickSchedulePage() {
  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editBar, setEditBar] = useState(null);
  const [editMilestone, setEditMilestone] = useState(null);
  const [creatingMilestone, setCreatingMilestone] = useState(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [dragTrackId, setDragTrackId] = useState(null);
  const [dragOverTrackId, setDragOverTrackId] = useState(null);

  // 甘特区宽度测量 → 时间轴自适应
  const ganttRef = useRef(null);
  const [ganttWidth, setGanttWidth] = useState(0);

  const loadLatest = useCallback(async () => {
    try {
      const r = await api.quickSchedules.list();
      const list = r.data || [];
      if (list.length > 0) {
        const d = await api.quickSchedules.get(list[0].id);
        setSchedule(d.data);
      } else {
        setSchedule(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLatest();
  }, [loadLatest]);

  // 监听甘特区宽度变化，动态重算时间轴每列宽度
  useEffect(() => {
    const el = ganttRef.current;
    if (!el) return;
    const measure = () => setGanttWidth(el.clientWidth);
    measure();
    let ro;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    }
    return () => ro && ro.disconnect();
  }, [schedule]);

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

  // 自适应月宽：可用宽度减去左侧标签列，平均分给所有月份，全量显示
  const monthWidth = useMemo(() => {
    if (months.length === 0) return 60;
    const avail = ganttWidth - LABEL_WIDTH;
    if (avail <= 0) return MIN_MONTH_WIDTH;
    return Math.max(MIN_MONTH_WIDTH, Math.floor(avail / months.length));
  }, [ganttWidth, months]);

  const handleCreate = async (data) => {
    try {
      const r = await api.quickSchedules.create(data);
      setSchedule(r.data);
      setCreateOpen(false);
    } catch (err) {
      alert(err.message || "创建失败");
    }
  };

  const handleAddTrack = async () => {
    if (!schedule) return;
    const title = window.prompt("轨道名称", "新进度");
    if (!title) return;
    const r = await api.quickSchedules.tracks.create(schedule.id, { title });
    setSchedule(r.data.schedule);
  };

  const handleUpdateTrack = async (trackId, data) => {
    const r = await api.quickSchedules.tracks.update(schedule.id, trackId, data);
    setSchedule(r.data);
  };

  const handleDeleteTrack = async (trackId) => {
    if (!window.confirm("确定删除该轨道？")) return;
    const r = await api.quickSchedules.tracks.remove(schedule.id, trackId);
    setSchedule(r.data);
  };

  const handleDragStart = (e, trackId) => {
    setDragTrackId(trackId);
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", String(trackId)); } catch { /* ignore */ }
  };

  const handleDragOver = (e, trackId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverTrackId !== trackId) setDragOverTrackId(trackId);
  };

  const handleDrop = async (targetTrackId) => {
    const fromId = dragTrackId;
    setDragTrackId(null);
    setDragOverTrackId(null);
    if (!fromId || fromId === targetTrackId || !schedule) return;

    const tracks = [...schedule.tracks];
    const fromIdx = tracks.findIndex((t) => t.id === fromId);
    const toIdx = tracks.findIndex((t) => t.id === targetTrackId);
    if (fromIdx < 0 || toIdx < 0) return;

    const [moved] = tracks.splice(fromIdx, 1);
    tracks.splice(toIdx, 0, moved);
    const reordered = tracks.map((t, i) => ({ ...t, sort_order: i }));
    setSchedule({ ...schedule, tracks: reordered });

    // 后台逐个持久化 sort_order（乐观重排已生效）
    for (const t of reordered) {
      try {
        await api.quickSchedules.tracks.update(schedule.id, t.id, { sort_order: t.sort_order });
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleDragEnd = () => {
    setDragTrackId(null);
    setDragOverTrackId(null);
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
      const r = await api.quickSchedules.bars.update(schedule.id, barId, data);
      setSchedule(r.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveBarDialog = async (data) => {
    const r = await api.quickSchedules.bars.update(schedule.id, editBar.id, data);
    setSchedule(r.data);
    setEditBar(null);
  };

  const handleDeleteBar = async () => {
    const r = await api.quickSchedules.bars.remove(schedule.id, editBar.id);
    setSchedule(r.data);
    setEditBar(null);
  };

  const handleAddMilestone = (trackId) => {
    if (!schedule) return;
    setCreatingMilestone(trackId);
  };

  const handleCreateMilestone = async (data) => {
    const r = await api.quickSchedules.milestones.create(schedule.id, {
      track_id: creatingMilestone,
      title: data.title,
      date: data.date,
      symbol: data.symbol,
      color: data.color,
      text_color: data.text_color,
    });
    setSchedule(r.data.schedule);
    setCreatingMilestone(null);
  };

  const handleUpdateMilestone = async (milestoneId, data) => {
    setSchedule((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        tracks: prev.tracks.map((t) => ({
          ...t,
          milestones: (t.milestones || []).map((m) => (m.id === milestoneId ? { ...m, ...data } : m)),
        })),
      };
    });
    try {
      const r = await api.quickSchedules.milestones.update(schedule.id, milestoneId, data);
      setSchedule(r.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveMilestoneDialog = async (data) => {
    const r = await api.quickSchedules.milestones.update(schedule.id, editMilestone.id, data);
    setSchedule(r.data);
    setEditMilestone(null);
  };

  const handleDeleteMilestone = async () => {
    const r = await api.quickSchedules.milestones.remove(schedule.id, editMilestone.id);
    setSchedule(r.data);
    setEditMilestone(null);
  };

  const handleUpdateStart = async (start) => {
    if (!schedule) return;
    if (start > schedule.end_date) {
      alert("开始日期不能晚于结束日期");
      return;
    }
    const r = await api.quickSchedules.update(schedule.id, { start_date: start });
    setSchedule(r.data);
  };

  const handleUpdateEnd = async (end) => {
    if (!schedule) return;
    if (end < schedule.start_date) {
      alert("结束日期不能早于开始日期");
      return;
    }
    const r = await api.quickSchedules.update(schedule.id, { end_date: end });
    setSchedule(r.data);
  };

  const commitTitle = async () => {
    setEditingTitle(false);
    const t = titleDraft.trim();
    if (t && t !== schedule.title) {
      const r = await api.quickSchedules.update(schedule.id, { title: t });
      setSchedule(r.data);
    }
  };

  return (
    <Box sx={{ p: 3, height: "calc(100vh - 64px)", display: "flex", flexDirection: "column" }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <PageHeader title="快速排期" subtitle="会议时快速搭建多轨道项目排期模拟，拖拽即可调整进度与关键节点" />
        <Button variant="contained" onClick={() => setCreateOpen(true)}>＋ 创建排期</Button>
      </Box>

      {schedule ? (
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, border: "1px solid", borderColor: "divider", borderRadius: 2, bgcolor: "background.paper" }}>
          <Box sx={{ p: 1.5, display: "flex", alignItems: "center", gap: 1, borderBottom: "1px solid", borderColor: "divider", flexWrap: "wrap" }}>
            {editingTitle ? (
              <TextField
                autoFocus
                size="small"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitTitle();
                  else if (e.key === "Escape") setEditingTitle(false);
                }}
                sx={{ flex: 1, minWidth: 160, "& .MuiInputBase-input": { fontWeight: 700, fontSize: "1rem" } }}
              />
            ) : (
              <Typography
                variant="subtitle1"
                onClick={() => { setTitleDraft(schedule.title); setEditingTitle(true); }}
                sx={{ fontWeight: 700, flex: 1, cursor: "text", "&:hover": { color: "primary.main" } }}
              >
                {schedule.title}
              </Typography>
            )}
            <DateFieldPopover label="开始" value={schedule.start_date} onChange={handleUpdateStart} />
            <Typography variant="body2" sx={{ color: "text.secondary" }}>~</Typography>
            <DateFieldPopover label="结束" value={schedule.end_date} onChange={handleUpdateEnd} />
            <Button size="small" variant="outlined" onClick={handleAddTrack}>＋ 新增轨道</Button>
          </Box>

          <Box ref={ganttRef} sx={{ flex: 1, overflowY: "auto", overflowX: "hidden", minHeight: 0 }}>
            <Box sx={{ minWidth: LABEL_WIDTH + months.length * monthWidth }}>
              <TimelineHeader months={months} quarters={quarters} monthWidth={monthWidth} />
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
                    monthWidth={monthWidth}
                    minDate={schedule.start_date}
                    maxDate={schedule.end_date}
                    onUpdateBar={handleUpdateBar}
                    onUpdateMilestone={handleUpdateMilestone}
                    onAddMilestone={handleAddMilestone}
                    onEditBar={setEditBar}
                    onEditMilestone={setEditMilestone}
                    onUpdateTrack={handleUpdateTrack}
                    onDeleteTrack={handleDeleteTrack}
                    dragTrackId={dragTrackId}
                    dragOverTrackId={dragOverTrackId}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onDragEnd={handleDragEnd}
                  />
                ))
              )}
            </Box>
          </Box>

          <Box sx={{ p: 1, borderTop: "1px solid", borderColor: "divider", display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>提示：</Typography>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>· 拖拽直线两端调整起止日期</Typography>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>· 拖拽节点符号沿轨道调整时间</Typography>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>· 双击可编辑</Typography>
            <Typography variant="caption" sx={{ color: "text.secondary", ml: "auto" }}>共 {schedule.tracks.length} 个轨道</Typography>
          </Box>
        </Box>
      ) : (
        <Box
          sx={{
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            border: "1px dashed", borderColor: "divider", borderRadius: 2, color: "text.secondary", gap: 1.5,
          }}
        >
          {loading ? (
            <Typography variant="body2">加载中…</Typography>
          ) : (
            <>
              <Typography variant="body1">还没有排期，点击右上角「创建排期」开始</Typography>
              <Button variant="outlined" size="small" onClick={() => setCreateOpen(true)}>创建排期</Button>
            </>
          )}
        </Box>
      )}

      <CreateScheduleDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreate={handleCreate} />
      {editBar && (
        <EditBarDialog open={!!editBar} bar={editBar} onClose={() => setEditBar(null)} onSave={handleSaveBarDialog} onDelete={handleDeleteBar} />
      )}
      {editMilestone && (
        <EditMilestoneDialog open={!!editMilestone} ms={editMilestone} onClose={() => setEditMilestone(null)} onSave={handleSaveMilestoneDialog} onDelete={handleDeleteMilestone} />
      )}
      <EditMilestoneDialog
        open={creatingMilestone !== null}
        ms={null}
        defaultDate={schedule ? schedule.start_date : ""}
        onClose={() => setCreatingMilestone(null)}
        onSave={handleCreateMilestone}
      />
    </Box>
  );
}
