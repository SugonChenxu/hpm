import { Router } from "express";
import db from "../db.js";

const router = Router();

const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

/** "YYYY-MM-DD" + days 天 → "YYYY-MM-DD"（按本地时间，避免时区偏移） */
function addDaysToWeekKey(weekKey, days) {
  const [y, m, d] = weekKey.split("-").map(Number);
  const date = new Date(y, m - 1, d + days);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** 解析 projects.meeting_time "周一 09:00-10:00" → { weekday, start_time, end_time } */
function parseMeetingTime(s) {
  if (!s) return null;
  const m = s.match(/^(.+?)\s+(\d{2}:\d{2})-(\d{2}:\d{2})$/);
  if (!m) return null;
  return { weekday: m[1], start_time: m[2], end_time: m[3] };
}

// GET /week-meetings?week=YYYY-MM-DD
router.get("/week-meetings", (req, res) => {
  const weekKey = req.query.week;
  if (!weekKey) return res.status(400).json({ ok: false, error: "缺少 week 参数" });

  const meetings = db.prepare(
    "SELECT * FROM week_meetings WHERE week_key = ? ORDER BY weekday, start_time"
  ).all(weekKey);

  const outputs = db.prepare(
    "SELECT * FROM meeting_outputs WHERE week_key = ? ORDER BY weekday, sort_order, id"
  ).all(weekKey);

  // 从 projects 表拉取例会（projects 表为硬删除，无 deleted_at 列）
  const projects = db.prepare(
    "SELECT id, code, name, theme_color, meeting_time FROM projects WHERE meeting_time != ''"
  ).all();
  const recurring = projects
    .map((p) => {
      const parsed = parseMeetingTime(p.meeting_time);
      if (!parsed) return null;
      return {
        ...parsed,
        title: `[${p.code}] ${p.name} 周例会`,
        project_id: p.id,
        project_code: p.code,
        project_name: p.name,
        theme_color: p.theme_color || "#1565C0",
        source: "project",
      };
    })
    .filter(Boolean);

  res.json({ ok: true, data: { meetings, outputs, recurring } });
});

// POST /week-meetings
router.post("/week-meetings", (req, res) => {
  const { week_key, weekday, start_time, end_time, title } = req.body;
  const weeks = Math.max(1, Math.min(52, parseInt(req.body.weeks, 10) || 1));
  if (!week_key || !weekday || !start_time || !end_time || !title) {
    return res.status(400).json({ ok: false, error: "缺少必填字段" });
  }
  const insert = db.prepare(
    "INSERT INTO week_meetings (week_key, weekday, start_time, end_time, title) VALUES (?, ?, ?, ?, ?)"
  );
  const getOne = db.prepare("SELECT * FROM week_meetings WHERE id = ?");
  const created = [];
  const tx = db.transaction(() => {
    for (let i = 0; i < weeks; i++) {
      const wk = addDaysToWeekKey(week_key, i * 7);
      const info = insert.run(wk, weekday, start_time, end_time, title);
      created.push(getOne.get(info.lastInsertRowid));
    }
  });
  tx();
  res.json({ ok: true, data: created });
});

// PUT /week-meetings/:id
router.put("/week-meetings/:id", (req, res) => {
  const { weekday, start_time, end_time, title } = req.body;
  db.prepare(
    "UPDATE week_meetings SET weekday=?, start_time=?, end_time=?, title=?, updated_at=datetime('now','localtime') WHERE id=?"
  ).run(weekday, start_time, end_time, title, req.params.id);
  const meeting = db.prepare("SELECT * FROM week_meetings WHERE id = ?").get(req.params.id);
  res.json({ ok: true, data: meeting });
});

// DELETE /week-meetings/:id
router.delete("/week-meetings/:id", (req, res) => {
  db.prepare("DELETE FROM week_meetings WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// POST /week-meetings/outputs — 新增一条输出物
router.post("/week-meetings/outputs", (req, res) => {
  const { week_key, weekday, title } = req.body;
  if (!week_key || !weekday || !title || !title.trim()) {
    return res.status(400).json({ ok: false, error: "缺少必填字段" });
  }
  const maxSort = db.prepare(
    "SELECT COALESCE(MAX(sort_order), -1) as m FROM meeting_outputs WHERE week_key = ? AND weekday = ?"
  ).get(week_key, weekday);
  const info = db.prepare(
    "INSERT INTO meeting_outputs (week_key, weekday, title, is_done, sort_order, created_at, updated_at) VALUES (?, ?, ?, 0, ?, datetime('now','localtime'), datetime('now','localtime'))"
  ).run(week_key, weekday, title.trim(), maxSort.m + 1);
  const item = db.prepare("SELECT * FROM meeting_outputs WHERE id = ?").get(info.lastInsertRowid);
  res.json({ ok: true, data: item });
});

// PUT /week-meetings/outputs/:id — 切换完成态 / 改标题
router.put("/week-meetings/outputs/:id", (req, res) => {
  const { title, is_done } = req.body;
  const existing = db.prepare("SELECT * FROM meeting_outputs WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ ok: false, error: "输出物不存在" });
  const newTitle = title !== undefined ? title : existing.title;
  const newDone = is_done !== undefined ? (is_done ? 1 : 0) : existing.is_done;
  db.prepare(
    "UPDATE meeting_outputs SET title = ?, is_done = ?, updated_at = datetime('now','localtime') WHERE id = ?"
  ).run(newTitle, newDone, req.params.id);
  const item = db.prepare("SELECT * FROM meeting_outputs WHERE id = ?").get(req.params.id);
  res.json({ ok: true, data: item });
});

// DELETE /week-meetings/outputs/:id — 删除一条输出物
router.delete("/week-meetings/outputs/:id", (req, res) => {
  db.prepare("DELETE FROM meeting_outputs WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

export default router;
