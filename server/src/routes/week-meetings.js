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

  // 本周实际展示输出物：普通一次性条目 + 已生成的「每周实例」（is_template=0）；周期模板(is_template=1)不直接展示
  const outputs = db.prepare(
    "SELECT * FROM meeting_outputs WHERE week_key = ? AND is_template = 0 ORDER BY weekday, sort_order, id"
  ).all(weekKey);

  // ===== 周期性输出物：周期模板（is_template=1），按周期规则判断本周是否生成虚拟项 =====
  const cycleTemplates = db.prepare(
    "SELECT * FROM meeting_outputs WHERE is_template = 1"
  ).all();

  // 计算两个周 key 之间的周数差
  function weeksBetween(a, b) {
    const [ya, ma, da] = a.split("-").map(Number);
    const [yb, mb, db] = b.split("-").map(Number);
    return Math.round((new Date(yb, mb-1, db) - new Date(ya, ma-1, da)) / (7*24*60*60*1000));
  }
  // 判断本周是否为该月第一周（周一落在 1-7 号）
  function isFirstWeekOfMonth(wk) {
    return parseInt(wk.split("-")[2], 10) <= 7;
  }

  // 已有输出物的 key（避免重复）
  const existingKeys = new Set(outputs.map(o => o.weekday + "|" + o.title));

  const recurringOutputs = [];
  const seenRecurring = new Set(); // 同一 weekday|title 只生成一条，避免多模板重复
  for (const tpl of cycleTemplates) {
    // 模板对「所有周（含创建周）」生成虚拟周期项；本周是否已有一致实例由 existingKeys 去重
    if (existingKeys.has(tpl.weekday + "|" + tpl.title)) continue;
    const rKey = tpl.weekday + "|" + tpl.title;
    if (seenRecurring.has(rKey)) continue;

    let shouldShow = false;
    const weekDiff = weeksBetween(tpl.week_key, weekKey);
    if (weekDiff < 0) continue; // 不回溯

    if (tpl.cycle === "weekly") {
      shouldShow = true;
    } else if (tpl.cycle === "biweekly") {
      shouldShow = weekDiff % 2 === 0;
    } else if (tpl.cycle === "monthly") {
      shouldShow = isFirstWeekOfMonth(weekKey);
    }

    if (shouldShow) {
      seenRecurring.add(rKey);
      recurringOutputs.push({
        ...tpl,
        id: "recurring_" + tpl.id, // 虚拟 ID，标记为周期项
        week_key: weekKey,
        is_recurring: true,
        original_week_key: tpl.week_key,
        source_id: tpl.id, // 指向真实模板 id
      });
    }
  }

  const allOutputs = [...outputs, ...recurringOutputs];

  // 从 projects 表拉取例会
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

  res.json({ ok: true, data: { meetings, outputs: allOutputs, recurring } });
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

// POST /week-meetings/outputs — 新增一条输出物（普通一次性，或显式指定周期/模板）
router.post("/week-meetings/outputs", (req, res) => {
  const { week_key, weekday, title, cycle, is_template, source_id } = req.body;
  if (!week_key || !weekday || !title || !title.trim()) {
    return res.status(400).json({ ok: false, error: "缺少必填字段" });
  }
  const maxSort = db.prepare(
    "SELECT COALESCE(MAX(sort_order), -1) as m FROM meeting_outputs WHERE week_key = ? AND weekday = ?"
  ).get(week_key, weekday);
  const info = db.prepare(
    "INSERT INTO meeting_outputs (week_key, weekday, title, is_done, sort_order, cycle, is_template, source_id, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?, ?, ?, datetime('now','localtime'), datetime('now','localtime'))"
  ).run(
    week_key, weekday, title.trim(), maxSort.m + 1,
    cycle || "", is_template ? 1 : 0, source_id || 0
  );
  const item = db.prepare("SELECT * FROM meeting_outputs WHERE id = ?").get(info.lastInsertRowid);
  res.json({ ok: true, data: item });
});

// POST /week-meetings/outputs/cycle-instance — 周期项「完成」：按(week_key,weekday,title) upsert 每周实例
// 已存在实例则仅更新 is_done；不存在则新建（is_template=0，source_id=模板id，保留 cycle 供展示）
router.post("/week-meetings/outputs/cycle-instance", (req, res) => {
  const { week_key, weekday, title, cycle, is_done, source_id } = req.body;
  if (!week_key || !weekday || !title || !title.trim()) {
    return res.status(400).json({ ok: false, error: "缺少必填字段" });
  }
  const existing = db.prepare(
    "SELECT * FROM meeting_outputs WHERE is_template = 0 AND week_key = ? AND weekday = ? AND title = ?"
  ).get(week_key, weekday, title.trim());
  let item;
  if (existing) {
    db.prepare(
      "UPDATE meeting_outputs SET is_done = ?, updated_at = datetime('now','localtime') WHERE id = ?"
    ).run(is_done ? 1 : 0, existing.id);
    item = db.prepare("SELECT * FROM meeting_outputs WHERE id = ?").get(existing.id);
  } else {
    const maxSort = db.prepare(
      "SELECT COALESCE(MAX(sort_order), -1) as m FROM meeting_outputs WHERE week_key = ? AND weekday = ?"
    ).get(week_key, weekday);
    const info = db.prepare(
      "INSERT INTO meeting_outputs (week_key, weekday, title, is_done, sort_order, cycle, is_template, source_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, datetime('now','localtime'), datetime('now','localtime'))"
    ).run(
      week_key, weekday, title.trim(), is_done ? 1 : 0, maxSort.m + 1,
      cycle || "", source_id || 0
    );
    item = db.prepare("SELECT * FROM meeting_outputs WHERE id = ?").get(info.lastInsertRowid);
  }
  res.json({ ok: true, data: item });
});

// PUT /week-meetings/outputs/:id — 切换完成态 / 改标题 / 设周期 / 标记模板
router.put("/week-meetings/outputs/:id", (req, res) => {
  const { title, is_done, cycle, is_template, source_id } = req.body;
  const existing = db.prepare("SELECT * FROM meeting_outputs WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ ok: false, error: "输出物不存在" });
  const newTitle = title !== undefined ? title : existing.title;
  const newDone = is_done !== undefined ? (is_done ? 1 : 0) : existing.is_done;
  const newCycle = cycle !== undefined ? cycle : existing.cycle;
  const newTpl = is_template !== undefined ? (is_template ? 1 : 0) : existing.is_template;
  const newSrc = source_id !== undefined ? source_id : existing.source_id;
  db.prepare(
    "UPDATE meeting_outputs SET title = ?, is_done = ?, cycle = ?, is_template = ?, source_id = ?, updated_at = datetime('now','localtime') WHERE id = ?"
  ).run(newTitle, newDone, newCycle, newTpl, newSrc, req.params.id);
  const item = db.prepare("SELECT * FROM meeting_outputs WHERE id = ?").get(req.params.id);
  res.json({ ok: true, data: item });
});

// DELETE /week-meetings/outputs/:id — 删除一条输出物
router.delete("/week-meetings/outputs/:id", (req, res) => {
  db.prepare("DELETE FROM meeting_outputs WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

export default router;
