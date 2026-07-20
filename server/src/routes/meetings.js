import { Router } from "express";
import db from "../db.js";
import {
  checkAuth,
  listEndedMeetings,
  getRecordList,
  getSmartMinutes,
} from "../adapters/tencent-meeting.js";

const router = Router();

// =====================================================
// GET /api/meetings — 会议列表（支持 ?search= 标题模糊搜索）
// =====================================================
router.get("/meetings", (req, res) => {
  const { project_id, platform, from, to, search } = req.query;
  let sql = "SELECT * FROM meetings WHERE 1=1";
  const params = [];
  sql += " AND owner_id = ?";
  params.push(req.userId);

  if (project_id) {
    sql += " AND project_id = ?";
    params.push(project_id);
  }
  if (platform) {
    sql += " AND platform = ?";
    params.push(platform);
  }
  if (from) {
    sql += " AND start_time >= ?";
    params.push(from);
  }
  if (to) {
    sql += " AND start_time <= ?";
    params.push(to);
  }
  if (search) {
    sql += " AND title LIKE ?";
    params.push(`%${search}%`);
  }

  sql += " ORDER BY start_time DESC";
  res.json({ ok: true, data: db.prepare(sql).all(...params) });
});

// =====================================================
// POST /api/meetings/fetch — 从腾讯会议拉取并入库
// =====================================================
router.post("/meetings/fetch", async (req, res) => {
  try {
    // 1. 检查登录状态
    const authed = checkAuth();
    if (!authed) {
      return res.status(401).json({
        ok: false,
        error: "tmeet 未登录，请在终端执行 tmeet auth login 后重试",
      });
    }

    // 2. 拉取全量会议
    const meetings = listEndedMeetings();
    if (meetings.length === 0) {
      return res.json({
        ok: true,
        data: { new_count: 0, total: 0, message: "未拉取到任何会议" },
      });
    }

    // 3. 查询已存在的 external_id（去重）
    const existingRows = db
      .prepare("SELECT external_id FROM meetings WHERE platform = 'tencent' AND external_id IS NOT NULL")
      .all();
    const existingIds = new Set(existingRows.map((r) => r.external_id));

    // 4. 筛选新增会议
    const newItems = meetings.filter((m) => !existingIds.has(m.meeting_id));

    // 5. 批量入库
    const insertStmt = db.prepare(`
      INSERT INTO meetings
        (platform, external_id, meeting_code, title, start_time, end_time, duration_minutes, owner_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let newCount = 0;
    const insertBatch = db.transaction((items) => {
      for (const m of items) {
        const duration =
          m.start_time && m.end_time
            ? Math.round(
                (new Date(m.end_time).getTime() - new Date(m.start_time).getTime()) / 60000
              )
            : null;
        const result = insertStmt.run(
          "tencent",
          m.meeting_id,
          m.meeting_code || "",
          m.subject,
          m.start_time || null,
          m.end_time || null,
          duration,
          req.userId
        );
        if (result.changes > 0) newCount++;
      }
    });

    if (newItems.length > 0) {
      insertBatch(newItems);
    }

    const total = db
      .prepare("SELECT COUNT(*) as cnt FROM meetings WHERE platform = 'tencent'")
      .get().cnt;

    res.json({
      ok: true,
      data: {
        new_count: newCount,
        total,
        message: `新增 ${newCount} 场会议，共 ${total} 场`,
      },
    });
  } catch (e) {
    console.error("[POST /meetings/fetch]", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// =====================================================
// GET /api/meetings/:id/minutes — 获取 AI 智能纪要
// =====================================================
router.get("/meetings/:id/minutes", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ ok: false, error: "Invalid meeting ID" });
    }

    const meeting = db.prepare("SELECT * FROM meetings WHERE id = ? AND owner_id = ?").get(id, req.userId);
    if (!meeting) {
      return res.status(404).json({ ok: false, error: "会议不存在" });
    }

    // 优先返回缓存
    const cached = db.prepare("SELECT * FROM smart_minutes WHERE meeting_id = ?").get(id);
    if (cached) {
      return res.json({ ok: true, data: cached, source: "cache" });
    }

    // 全时会议：纪要通过分享链接查看
    if (meeting.platform === "quanshi" && meeting.minutes_url) {
      return res.json({
        ok: true,
        data: {
          source: "link",
          platform: "quanshi",
          url: meeting.minutes_url,
        },
        message: "全时会议纪要通过分享链接查看",
      });
    }

    // 非腾讯会议或无 external_id → 无纪要
    if (meeting.platform !== "tencent" || !meeting.external_id) {
      return res.json({
        ok: true,
        data: null,
        message: "该会议非腾讯会议，暂无智能纪要",
      });
    }

    // 获取录制列表
    let records;
    try {
      records = getRecordList(meeting.external_id);
    } catch (e) {
      console.warn(`[minutes] getRecordList failed for meeting ${id}:`, e.message);
      return res.json({
        ok: true,
        data: null,
        message: "获取录制列表失败，该会议可能无录制",
      });
    }

    if (!records || records.length === 0) {
      return res.json({
        ok: true,
        data: null,
        message: "该会议暂无录制",
      });
    }

    // 取第一个录制文件
    const record = records[0];
    const recordFileId = record.record_file_id || record.id || record.file_id;
    if (!recordFileId) {
      return res.json({
        ok: true,
        data: null,
        message: "录制文件 ID 缺失",
      });
    }

    // 获取智能纪要
    let minutesResult;
    try {
      minutesResult = getSmartMinutes(meeting.external_id, recordFileId);
    } catch (e) {
      console.warn(`[minutes] getSmartMinutes failed for meeting ${id}:`, e.message);
      return res.json({
        ok: true,
        data: null,
        message: `获取智能纪要失败: ${e.message}`,
      });
    }

    const minutesData =
      minutesResult && minutesResult.data ? minutesResult.data : minutesResult;

    // 提取纪要内容
    const content =
      typeof minutesData === "string"
        ? minutesData
        : typeof minutesData.content === "string"
          ? minutesData.content
          : JSON.stringify(minutesData, null, 2);
    const summary = (minutesData && minutesData.summary) || "";
    const actionItems = (minutesData && minutesData.action_items) ||
                        (minutesData && minutesData.todos) ||
                        [];

    // 缓存入库
    db.prepare(`
      INSERT INTO smart_minutes
        (meeting_id, record_file_id, content, summary, action_items_json, owner_id, fetched_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now','localtime'))
      ON CONFLICT(meeting_id) DO UPDATE SET
        record_file_id = excluded.record_file_id,
        content = excluded.content,
        summary = excluded.summary,
        action_items_json = excluded.action_items_json,
        owner_id = excluded.owner_id,
        fetched_at = datetime('now','localtime')
    `).run(id, recordFileId, content, summary, JSON.stringify(actionItems), req.userId);

    const saved = db.prepare("SELECT * FROM smart_minutes WHERE meeting_id = ?").get(id);
    res.json({ ok: true, data: saved, source: "fetched" });
  } catch (e) {
    console.error("[GET /meetings/:id/minutes]", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// =====================================================
// POST /api/meetings — 手动登记会议（保留原有功能）
// =====================================================
router.post("/meetings", (req, res) => {
  const {
    project_id,
    phase_id,
    title,
    start_time,
    end_time,
    attendee_count,
    attendees_json,
    platform,
    external_id,
    meeting_code,
    minutes_url,
  } = req.body;
  if (!title) return res.status(400).json({ ok: false, error: "title 必填" });
  if (project_id) {
    const proj = db.prepare("SELECT owner_id FROM projects WHERE id = ?").get(Number(project_id));
    if (!proj || proj.owner_id !== req.userId) return res.status(403).json({ ok: false, error: "无权访问该项目" });
  }
  const duration =
    start_time && end_time
      ? Math.round((new Date(end_time) - new Date(start_time)) / 60000)
      : null;
  const result = db
    .prepare(
      "INSERT INTO meetings (project_id, phase_id, platform, external_id, meeting_code, title, start_time, end_time, duration_minutes, attendee_count, attendees_json, minutes_url, owner_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      project_id || null,
      phase_id || null,
      platform || "manual",
      external_id || null,
      meeting_code || null,
      title,
      start_time || null,
      end_time || null,
      duration,
      attendee_count || null,
      attendees_json ? JSON.stringify(attendees_json) : null,
      minutes_url || null,
      req.userId
    );
  res.status(201).json({
    ok: true,
    data: db.prepare("SELECT * FROM meetings WHERE id = ?").get(result.lastInsertRowid),
  });
});

// =====================================================
// GET /api/meetings/:id — 单条会议详情（保留原有功能）
// =====================================================
router.get("/meetings/:id", (req, res) => {
  const meeting = db.prepare("SELECT * FROM meetings WHERE id = ? AND owner_id = ?").get(req.params.id, req.userId);
  if (!meeting) return res.status(404).json({ ok: false, error: "会议不存在" });
  const actionItems = db
    .prepare("SELECT * FROM meeting_action_items WHERE meeting_id = ?")
    .all(req.params.id);
  res.json({ ok: true, data: { ...meeting, action_items: actionItems } });
});

// =====================================================
// PUT /api/meetings/:id — 更新会议（保留原有功能）
// =====================================================
router.put("/meetings/:id", (req, res) => {
  const { title, minutes_text, minutes_status, start_time, end_time, minutes_url } = req.body;
  const m = db.prepare("SELECT * FROM meetings WHERE id = ? AND owner_id = ?").get(req.params.id, req.userId);
  if (!m) return res.status(404).json({ ok: false, error: "会议不存在" });
  db.prepare(
    "UPDATE meetings SET title=COALESCE(?,title), minutes_text=COALESCE(?,minutes_text), minutes_status=COALESCE(?,minutes_status), start_time=COALESCE(?,start_time), end_time=COALESCE(?,end_time), minutes_url=COALESCE(?,minutes_url), updated_at=datetime('now','localtime') WHERE id=? AND owner_id = ?"
  ).run(title, minutes_text, minutes_status, start_time, end_time, minutes_url, req.params.id, req.userId);
  res.json({
    ok: true,
    data: db.prepare("SELECT * FROM meetings WHERE id = ?").get(req.params.id),
  });
});

// =====================================================
// 会议决议项（保留原有功能）
// =====================================================
router.post("/meetings/:id/action-items", (req, res) => {
  const { content, assignee, due_date } = req.body;
  if (!content) return res.status(400).json({ ok: false, error: "content 必填" });
  const meeting = db.prepare("SELECT owner_id FROM meetings WHERE id = ?").get(req.params.id);
  if (!meeting || meeting.owner_id !== req.userId) return res.status(403).json({ ok: false, error: "无权访问该项目" });
  const result = db
    .prepare(
      "INSERT INTO meeting_action_items (meeting_id, content, assignee, due_date) VALUES (?, ?, ?, ?)"
    )
    .run(req.params.id, content, assignee || "", due_date || null);
  res.status(201).json({
    ok: true,
    data: db.prepare("SELECT * FROM meeting_action_items WHERE id = ?").get(result.lastInsertRowid),
  });
});

router.put("/meetings/:id/action-items/:aid", (req, res) => {
  const { content, assignee, due_date, status } = req.body;
  const meeting = db.prepare("SELECT owner_id FROM meetings WHERE id = ?").get(req.params.id);
  if (!meeting || meeting.owner_id !== req.userId) return res.status(403).json({ ok: false, error: "无权访问该项目" });
  db.prepare(
    "UPDATE meeting_action_items SET content=COALESCE(?,content), assignee=COALESCE(?,assignee), due_date=COALESCE(?,due_date), status=COALESCE(?,status), completed_at=CASE WHEN ?='已完成' THEN datetime('now','localtime') ELSE completed_at END WHERE id=? AND meeting_id=?"
  ).run(content, assignee, due_date, status, status, req.params.aid, req.params.id);
  res.json({ ok: true });
});

router.post("/meetings/:id/action-items/:aid/convert", (req, res) => {
  const ai = db.prepare("SELECT * FROM meeting_action_items WHERE id = ?").get(req.params.aid);
  if (!ai) return res.status(404).json({ ok: false, error: "决议项不存在" });
  const meeting = db.prepare("SELECT owner_id FROM meetings WHERE id = ?").get(ai.meeting_id);
  if (!meeting || meeting.owner_id !== req.userId) return res.status(403).json({ ok: false, error: "无权访问该项目" });
  const result = db
    .prepare(
      "INSERT INTO tasks (project_id, title, description, assignee, due_date, priority, kanban_column, owner_id) VALUES (?, ?, ?, ?, ?, 'P1', '待开始', ?)"
    )
    .run(null, ai.content, `来自会议决议 #${ai.id}`, ai.assignee, ai.due_date, req.userId);
  db.prepare("UPDATE meeting_action_items SET linked_task_id = ? WHERE id = ?").run(
    result.lastInsertRowid,
    req.params.aid
  );
  res.status(201).json({
    ok: true,
    data: db.prepare("SELECT * FROM tasks WHERE id = ?").get(result.lastInsertRowid),
  });
});

// =====================================================
// 会议平台配置（保留原有功能）
// =====================================================
router.get("/meeting-config", (req, res) => {
  res.json({ ok: true, data: db.prepare("SELECT * FROM meeting_platform_config").all() });
});

router.put("/meeting-config", (req, res) => {
  const { platform, app_id, secret, enterprise_id, is_active } = req.body;
  db.prepare(
    "UPDATE meeting_platform_config SET app_id=COALESCE(?,app_id), secret=COALESCE(?,secret), enterprise_id=COALESCE(?,enterprise_id), is_active=COALESCE(?,is_active) WHERE platform=?"
  ).run(app_id, secret, enterprise_id, is_active, platform);
  res.json({ ok: true });
});

export default router;
