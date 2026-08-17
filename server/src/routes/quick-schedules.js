/**
 * 快速排期模块路由
 *
 * 用于会议时快速进行项目排期模拟，以甘特图形式展示多条进度与关键节点。
 * 数据按 owner_id 隔离。
 */

import { Router } from "express";
import db from "../db.js";

const router = Router();

const SYMBOLS = new Set(["circle", "star", "triangle", "square", "diamond", "flag"]);
const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

function normalizeDate(d) {
  if (!d) return null;
  const s = String(d).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function safeColor(c, fallback = "#1565C0") {
  const s = String(c || fallback);
  return HEX_COLOR_RE.test(s) ? s : fallback;
}

function safeSymbol(s) {
  return SYMBOLS.has(String(s)) ? String(s) : "circle";
}

function buildScheduleDetail(scheduleId, ownerId) {
  const schedule = db
    .prepare("SELECT * FROM quick_schedules WHERE id = ? AND owner_id = ?")
    .get(scheduleId, ownerId);
  if (!schedule) return null;

  const tracks = db
    .prepare(
      "SELECT * FROM quick_schedule_tracks WHERE schedule_id = ? AND owner_id = ? ORDER BY sort_order, id"
    )
    .all(scheduleId, ownerId);

  const bars = db
    .prepare(
      "SELECT * FROM quick_schedule_bars WHERE schedule_id = ? AND owner_id = ? ORDER BY sort_order, id"
    )
    .all(scheduleId, ownerId);

  const milestones = db
    .prepare(
      "SELECT * FROM quick_schedule_milestones WHERE schedule_id = ? AND owner_id = ? ORDER BY sort_order, id"
    )
    .all(scheduleId, ownerId);

  const barMap = new Map();
  for (const b of bars) {
    b.milestones = [];
    barMap.set(b.id, b);
  }
  for (const m of milestones) {
    if (m.bar_id && barMap.has(m.bar_id)) {
      barMap.get(m.bar_id).milestones.push(m);
    }
  }

  const trackMap = new Map();
  for (const t of tracks) {
    t.bars = [];
    t.milestones = []; // 该轨道所有节点（含未挂 bar 的独立节点）
    trackMap.set(t.id, t);
  }
  for (const b of bars) {
    if (trackMap.has(b.track_id)) {
      trackMap.get(b.track_id).bars.push(b);
    }
  }
  for (const m of milestones) {
    if (trackMap.has(m.track_id)) {
      trackMap.get(m.track_id).milestones.push(m);
    }
  }

  return { ...schedule, tracks };
}

// ═══════════════════════════════════════════════
// GET /quick-schedules — 列表
// ═══════════════════════════════════════════════
router.get("/quick-schedules", (req, res) => {
  const rows = db
    .prepare(
      "SELECT id, title, start_date, end_date, created_at, updated_at FROM quick_schedules WHERE owner_id = ? ORDER BY updated_at DESC"
    )
    .all(req.userId);
  res.json({ ok: true, data: rows });
});

// ═══════════════════════════════════════════════
// POST /quick-schedules — 创建排期
// Body: { title, start_date, end_date }
// ═══════════════════════════════════════════════
router.post("/quick-schedules", (req, res) => {
  const title = String(req.body.title || "未命名排期").slice(0, 200);
  const start = normalizeDate(req.body.start_date);
  const end = normalizeDate(req.body.end_date);
  if (!start || !end) {
    return res.status(400).json({ ok: false, error: "请提供有效的开始和结束日期" });
  }
  if (start > end) {
    return res.status(400).json({ ok: false, error: "开始日期不能晚于结束日期" });
  }

  const info = db
    .prepare(
      "INSERT INTO quick_schedules (owner_id, title, start_date, end_date) VALUES (?, ?, ?, ?)"
    )
    .run(req.userId, title, start, end);

  const detail = buildScheduleDetail(info.lastInsertRowid, req.userId);
  res.json({ ok: true, data: detail });
});

// ═══════════════════════════════════════════════
// GET /quick-schedules/:id — 详情
// ═══════════════════════════════════════════════
router.get("/quick-schedules/:id", (req, res) => {
  const detail = buildScheduleDetail(req.params.id, req.userId);
  if (!detail) return res.status(404).json({ ok: false, error: "排期不存在" });
  res.json({ ok: true, data: detail });
});

// ═══════════════════════════════════════════════
// PUT /quick-schedules/:id — 更新排期（标题/时间范围）
// ═══════════════════════════════════════════════
router.put("/quick-schedules/:id", (req, res) => {
  const existing = db
    .prepare("SELECT id FROM quick_schedules WHERE id = ? AND owner_id = ?")
    .get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ ok: false, error: "排期不存在" });

  const cur = db.prepare("SELECT title, start_date, end_date FROM quick_schedules WHERE id = ?").get(req.params.id);
  const title = req.body.title !== undefined ? String(req.body.title).slice(0, 200) : cur.title;
  const start = req.body.start_date !== undefined ? normalizeDate(req.body.start_date) : cur.start_date;
  const end = req.body.end_date !== undefined ? normalizeDate(req.body.end_date) : cur.end_date;

  if (!start || !end) {
    return res.status(400).json({ ok: false, error: "请提供有效的开始和结束日期" });
  }
  if (start > end) {
    return res.status(400).json({ ok: false, error: "开始日期不能晚于结束日期" });
  }

  db.prepare(
    "UPDATE quick_schedules SET title = ?, start_date = ?, end_date = ?, updated_at = datetime('now','localtime') WHERE id = ? AND owner_id = ?"
  ).run(title, start, end, req.params.id, req.userId);

  const detail = buildScheduleDetail(req.params.id, req.userId);
  res.json({ ok: true, data: detail });
});

// ═══════════════════════════════════════════════
// DELETE /quick-schedules/:id — 删除排期（级联删除子表）
// ═══════════════════════════════════════════════
router.delete("/quick-schedules/:id", (req, res) => {
  const existing = db
    .prepare("SELECT id FROM quick_schedules WHERE id = ? AND owner_id = ?")
    .get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ ok: false, error: "排期不存在" });

  db.prepare("DELETE FROM quick_schedules WHERE id = ? AND owner_id = ?").run(req.params.id, req.userId);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════
// POST /quick-schedules/:id/tracks — 添加轨道
// Body: { title, label_color }
// ═══════════════════════════════════════════════
router.post("/quick-schedules/:id/tracks", (req, res) => {
  const schedule = db
    .prepare("SELECT * FROM quick_schedules WHERE id = ? AND owner_id = ?")
    .get(req.params.id, req.userId);
  if (!schedule) return res.status(404).json({ ok: false, error: "排期不存在" });

  const max = db
    .prepare("SELECT COALESCE(MAX(sort_order), 0) as m FROM quick_schedule_tracks WHERE schedule_id = ?")
    .get(req.params.id);

  const title = String(req.body.title || "进度条").slice(0, 200);
  const labelColor = safeColor(req.body.label_color, "#1565C0");

  const info = db
    .prepare(
      "INSERT INTO quick_schedule_tracks (schedule_id, owner_id, title, sort_order, label_color) VALUES (?, ?, ?, ?, ?)"
    )
    .run(req.params.id, req.userId, title, max.m + 1, labelColor);

  // 创建轨道后，自动生成一条带箭头直线贯穿整个排期时间段
  const trackId = info.lastInsertRowid;
  db.prepare(
    "INSERT INTO quick_schedule_bars (schedule_id, track_id, owner_id, title, start_date, end_date, color, style, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, 'arrow', 0)"
  ).run(req.params.id, trackId, req.userId, title, schedule.start_date, schedule.end_date, labelColor);

  const detail = buildScheduleDetail(req.params.id, req.userId);
  res.json({ ok: true, data: { track_id: trackId, schedule: detail } });
});

// ═══════════════════════════════════════════════
// PUT /quick-schedules/:id/tracks/:trackId — 更新轨道
// ═══════════════════════════════════════════════
router.put("/quick-schedules/:id/tracks/:trackId", (req, res) => {
  const track = db
    .prepare("SELECT * FROM quick_schedule_tracks WHERE id = ? AND schedule_id = ? AND owner_id = ?")
    .get(req.params.trackId, req.params.id, req.userId);
  if (!track) return res.status(404).json({ ok: false, error: "轨道不存在" });

  const title = req.body.title !== undefined ? String(req.body.title).slice(0, 200) : track.title;
  const labelColor = req.body.label_color !== undefined ? safeColor(req.body.label_color) : track.label_color;
  const sortOrder = req.body.sort_order !== undefined ? Number(req.body.sort_order) : track.sort_order;

  db.prepare(
    "UPDATE quick_schedule_tracks SET title = ?, label_color = ?, sort_order = ?, updated_at = datetime('now','localtime') WHERE id = ?"
  ).run(title, labelColor, sortOrder, req.params.trackId);

  // 轨道色变化时，同步更新该轨道所有箭头直线的颜色（保持视觉一致）
  if (req.body.label_color !== undefined && labelColor !== track.label_color) {
    db.prepare(
      "UPDATE quick_schedule_bars SET color = ?, updated_at = datetime('now','localtime') WHERE track_id = ? AND style = 'arrow'"
    ).run(labelColor, req.params.trackId);
  }

  const detail = buildScheduleDetail(req.params.id, req.userId);
  res.json({ ok: true, data: detail });
});

// ═══════════════════════════════════════════════
// DELETE /quick-schedules/:id/tracks/:trackId — 删除轨道
// ═══════════════════════════════════════════════
router.delete("/quick-schedules/:id/tracks/:trackId", (req, res) => {
  const track = db
    .prepare("SELECT id FROM quick_schedule_tracks WHERE id = ? AND schedule_id = ? AND owner_id = ?")
    .get(req.params.trackId, req.params.id, req.userId);
  if (!track) return res.status(404).json({ ok: false, error: "轨道不存在" });

  db.prepare("DELETE FROM quick_schedule_tracks WHERE id = ?").run(req.params.trackId);
  const detail = buildScheduleDetail(req.params.id, req.userId);
  res.json({ ok: true, data: detail });
});

// ═══════════════════════════════════════════════
// POST /quick-schedules/:id/bars — 添加进度条
// Body: { track_id, title, start_date, end_date, color, style }
// ═══════════════════════════════════════════════
router.post("/quick-schedules/:id/bars", (req, res) => {
  const schedule = db
    .prepare("SELECT * FROM quick_schedules WHERE id = ? AND owner_id = ?")
    .get(req.params.id, req.userId);
  if (!schedule) return res.status(404).json({ ok: false, error: "排期不存在" });

  const track = db
    .prepare("SELECT id FROM quick_schedule_tracks WHERE id = ? AND schedule_id = ? AND owner_id = ?")
    .get(req.body.track_id, req.params.id, req.userId);
  if (!track) return res.status(400).json({ ok: false, error: "轨道不存在" });

  const start = normalizeDate(req.body.start_date) || schedule.start_date;
  const end = normalizeDate(req.body.end_date) || schedule.end_date;
  if (start > end) {
    return res.status(400).json({ ok: false, error: "开始日期不能晚于结束日期" });
  }

  const max = db
    .prepare("SELECT COALESCE(MAX(sort_order), 0) as m FROM quick_schedule_bars WHERE track_id = ?")
    .get(req.body.track_id);

  const title = String(req.body.title || "").slice(0, 200);
  const color = safeColor(req.body.color, "#1565C0");
  const style = req.body.style === "arrow" ? "arrow" : "bar";

  const info = db
    .prepare(
      "INSERT INTO quick_schedule_bars (schedule_id, track_id, owner_id, title, start_date, end_date, color, style, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(req.params.id, req.body.track_id, req.userId, title, start, end, color, style, max.m + 1);

  const detail = buildScheduleDetail(req.params.id, req.userId);
  res.json({ ok: true, data: { bar_id: info.lastInsertRowid, schedule: detail } });
});

// ═══════════════════════════════════════════════
// PUT /quick-schedules/:id/bars/:barId — 更新进度条（拖拽后保存）
// ═══════════════════════════════════════════════
router.put("/quick-schedules/:id/bars/:barId", (req, res) => {
  const bar = db
    .prepare("SELECT * FROM quick_schedule_bars WHERE id = ? AND schedule_id = ? AND owner_id = ?")
    .get(req.params.barId, req.params.id, req.userId);
  if (!bar) return res.status(404).json({ ok: false, error: "进度条不存在" });

  const schedule = db.prepare("SELECT start_date, end_date FROM quick_schedules WHERE id = ?").get(req.params.id);

  let start = bar.start_date;
  let end = bar.end_date;
  if (req.body.start_date !== undefined) start = normalizeDate(req.body.start_date) || bar.start_date;
  if (req.body.end_date !== undefined) end = normalizeDate(req.body.end_date) || bar.end_date;

  // 单端点拖拽越界时，用新值作锚点，另一端跟随保证至少 1 天长度
  if (start > end) {
    if (req.body.start_date !== undefined && req.body.end_date === undefined) end = start;
    else if (req.body.end_date !== undefined && req.body.start_date === undefined) start = end;
    else [start, end] = [end, start];
  }

  // 限制在排期时间范围内
  if (start < schedule.start_date) start = schedule.start_date;
  if (end > schedule.end_date) end = schedule.end_date;
  if (start > end) end = start;

  const title = req.body.title !== undefined ? String(req.body.title).slice(0, 200) : bar.title;
  const color = req.body.color !== undefined ? safeColor(req.body.color) : bar.color;
  const trackId = req.body.track_id !== undefined ? Number(req.body.track_id) : bar.track_id;
  const style = req.body.style !== undefined ? (req.body.style === "arrow" ? "arrow" : "bar") : bar.style;

  db.prepare(
    "UPDATE quick_schedule_bars SET track_id = ?, title = ?, start_date = ?, end_date = ?, color = ?, style = ?, updated_at = datetime('now','localtime') WHERE id = ?"
  ).run(trackId, title, start, end, color, style, req.params.barId);

  const detail = buildScheduleDetail(req.params.id, req.userId);
  res.json({ ok: true, data: detail });
});

// ═══════════════════════════════════════════════
// DELETE /quick-schedules/:id/bars/:barId — 删除进度条
// ═══════════════════════════════════════════════
router.delete("/quick-schedules/:id/bars/:barId", (req, res) => {
  const bar = db
    .prepare("SELECT id FROM quick_schedule_bars WHERE id = ? AND schedule_id = ? AND owner_id = ?")
    .get(req.params.barId, req.params.id, req.userId);
  if (!bar) return res.status(404).json({ ok: false, error: "进度条不存在" });

  db.prepare("DELETE FROM quick_schedule_bars WHERE id = ?").run(req.params.barId);
  const detail = buildScheduleDetail(req.params.id, req.userId);
  res.json({ ok: true, data: detail });
});

// ═══════════════════════════════════════════════
// POST /quick-schedules/:id/milestones — 添加关键节点
// Body: { track_id, bar_id?, title, date, symbol, color }
// ═══════════════════════════════════════════════
router.post("/quick-schedules/:id/milestones", (req, res) => {
  const schedule = db
    .prepare("SELECT * FROM quick_schedules WHERE id = ? AND owner_id = ?")
    .get(req.params.id, req.userId);
  if (!schedule) return res.status(404).json({ ok: false, error: "排期不存在" });

  const track = db
    .prepare("SELECT id FROM quick_schedule_tracks WHERE id = ? AND schedule_id = ? AND owner_id = ?")
    .get(req.body.track_id, req.params.id, req.userId);
  if (!track) return res.status(400).json({ ok: false, error: "轨道不存在" });

  let barId = req.body.bar_id ? Number(req.body.bar_id) : null;
  if (barId) {
    const bar = db
      .prepare("SELECT id FROM quick_schedule_bars WHERE id = ? AND track_id = ? AND schedule_id = ?")
      .get(barId, req.body.track_id, req.params.id);
    if (!bar) barId = null;
  }

  const date = normalizeDate(req.body.date) || schedule.start_date;

  const max = db
    .prepare("SELECT COALESCE(MAX(sort_order), 0) as m FROM quick_schedule_milestones WHERE track_id = ?")
    .get(req.body.track_id);

  const title = String(req.body.title || "").slice(0, 200);
  const symbol = safeSymbol(req.body.symbol);
  const color = safeColor(req.body.color, "#D32F2F");
  const textColor = safeColor(req.body.text_color, "#000000");

  const info = db
    .prepare(
      "INSERT INTO quick_schedule_milestones (schedule_id, track_id, bar_id, owner_id, title, date, symbol, color, text_color, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(req.params.id, req.body.track_id, barId, req.userId, title, date, symbol, color, textColor, max.m + 1);

  const detail = buildScheduleDetail(req.params.id, req.userId);
  res.json({ ok: true, data: { milestone_id: info.lastInsertRowid, schedule: detail } });
});

// ═══════════════════════════════════════════════
// PUT /quick-schedules/:id/milestones/:milestoneId — 更新关键节点
// ═══════════════════════════════════════════════
router.put("/quick-schedules/:id/milestones/:milestoneId", (req, res) => {
  const ms = db
    .prepare(
      "SELECT * FROM quick_schedule_milestones WHERE id = ? AND schedule_id = ? AND owner_id = ?"
    )
    .get(req.params.milestoneId, req.params.id, req.userId);
  if (!ms) return res.status(404).json({ ok: false, error: "关键节点不存在" });

  const schedule = db.prepare("SELECT start_date, end_date FROM quick_schedules WHERE id = ?").get(req.params.id);

  let date = req.body.date !== undefined ? normalizeDate(req.body.date) : ms.date;
  if (date < schedule.start_date) date = schedule.start_date;
  if (date > schedule.end_date) date = schedule.end_date;

  const title = req.body.title !== undefined ? String(req.body.title).slice(0, 200) : ms.title;
  const symbol = req.body.symbol !== undefined ? safeSymbol(req.body.symbol) : ms.symbol;
  const color = req.body.color !== undefined ? safeColor(req.body.color) : ms.color;
  const textColor = req.body.text_color !== undefined ? safeColor(req.body.text_color, "#000000") : ms.text_color;
  const trackId = req.body.track_id !== undefined ? Number(req.body.track_id) : ms.track_id;
  let barId = req.body.bar_id !== undefined ? (req.body.bar_id ? Number(req.body.bar_id) : null) : ms.bar_id;
  if (barId) {
    const bar = db
      .prepare("SELECT id FROM quick_schedule_bars WHERE id = ? AND track_id = ? AND schedule_id = ?")
      .get(barId, trackId, req.params.id);
    if (!bar) barId = null;
  }

  db.prepare(
    "UPDATE quick_schedule_milestones SET track_id = ?, bar_id = ?, title = ?, date = ?, symbol = ?, color = ?, text_color = ?, updated_at = datetime('now','localtime') WHERE id = ?"
  ).run(trackId, barId, title, date, symbol, color, textColor, req.params.milestoneId);

  const detail = buildScheduleDetail(req.params.id, req.userId);
  res.json({ ok: true, data: detail });
});

// ═══════════════════════════════════════════════
// DELETE /quick-schedules/:id/milestones/:milestoneId — 删除关键节点
// ═══════════════════════════════════════════════
router.delete("/quick-schedules/:id/milestones/:milestoneId", (req, res) => {
  const ms = db
    .prepare(
      "SELECT id FROM quick_schedule_milestones WHERE id = ? AND schedule_id = ? AND owner_id = ?"
    )
    .get(req.params.milestoneId, req.params.id, req.userId);
  if (!ms) return res.status(404).json({ ok: false, error: "关键节点不存在" });

  db.prepare("DELETE FROM quick_schedule_milestones WHERE id = ?").run(req.params.milestoneId);
  const detail = buildScheduleDetail(req.params.id, req.userId);
  res.json({ ok: true, data: detail });
});

export default router;
