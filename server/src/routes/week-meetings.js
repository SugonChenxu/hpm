import { Router } from "express";
import db from "../db.js";

const router = Router();

const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

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
    "SELECT * FROM week_meeting_outputs WHERE week_key = ?"
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
  if (!week_key || !weekday || !start_time || !end_time || !title) {
    return res.status(400).json({ ok: false, error: "缺少必填字段" });
  }
  const info = db.prepare(
    "INSERT INTO week_meetings (week_key, weekday, start_time, end_time, title) VALUES (?, ?, ?, ?, ?)"
  ).run(week_key, weekday, start_time, end_time, title);
  const meeting = db.prepare("SELECT * FROM week_meetings WHERE id = ?").get(info.lastInsertRowid);
  res.json({ ok: true, data: meeting });
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

// PUT /week-meetings/outputs — 批量保存输出物
router.put("/week-meetings/outputs", (req, res) => {
  const { week_key, outputs } = req.body;
  if (!week_key || !Array.isArray(outputs)) {
    return res.status(400).json({ ok: false, error: "参数错误" });
  }
  const upsert = db.prepare(`
    INSERT INTO week_meeting_outputs (week_key, weekday, content, updated_at)
    VALUES (?, ?, ?, datetime('now','localtime'))
    ON CONFLICT(week_key, weekday) DO UPDATE SET content=excluded.content, updated_at=datetime('now','localtime')
  `);
  const tx = db.transaction(() => {
    outputs.forEach((o) => upsert.run(week_key, o.weekday, o.content || ""));
  });
  tx();
  res.json({ ok: true });
});

export default router;
