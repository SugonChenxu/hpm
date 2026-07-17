import { Router } from "express";
import db from "../db.js";
import dayjs from "dayjs";
const router = Router();

const COLUMNS = [
  "seq",
  "part_number",
  "manufacturer",
  "model",
  "material_status",
  "quantity",
  "quantity_per_set",
  "set_count",
  "purchase_date",
  "lead_time",
  "expected_delivery",
  "notes",
];

const MATERIAL_STATUSES = ["默认", "已入库", "已下单", "待决策", "高风险"];

// 取某项目下最大序号，返回下一个连续序号
function nextSeq(projectId) {
  const row = db
    .prepare("SELECT MAX(seq) AS m FROM materials WHERE project_id = ?")
    .get(projectId);
  return (row && row.m ? row.m : 0) + 1;
}

// 删除/导入后，按 id 升序重排该项目的序号，保证连续无断档
function renumberSeq(projectId) {
  const rows = db
    .prepare("SELECT id FROM materials WHERE project_id = ? ORDER BY seq ASC, id ASC")
    .all(projectId);
  const update = db.prepare("UPDATE materials SET seq = ? WHERE id = ?");
  db.transaction(() => {
    rows.forEach((r, i) => update.run(i + 1, r.id));
  })();
}

// 规范化单行物料字段
function normalize(item = {}) {
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    part_number: item.part_number != null ? String(item.part_number) : "",
    manufacturer: item.manufacturer != null ? String(item.manufacturer) : "",
    model: item.model != null ? String(item.model) : "",
    material_status: MATERIAL_STATUSES.includes(item.material_status)
      ? item.material_status
      : "默认",
    quantity: item.quantity !== undefined && item.quantity !== "" ? num(item.quantity) : 0,
    quantity_per_set:
      item.quantity_per_set !== undefined && item.quantity_per_set !== ""
        ? num(item.quantity_per_set)
        : 0,
    set_count:
      item.set_count !== undefined && item.set_count !== "" ? Math.round(num(item.set_count)) : 0,
    purchase_date: item.purchase_date || null,
    lead_time: item.lead_time !== undefined && item.lead_time !== "" ? Math.round(num(item.lead_time)) : null,
    // 自动计算预计交期：采购时间 + 采购周期
    expected_delivery: (() => {
      const pd = item.purchase_date;
      const lt = item.lead_time;
      if (pd && lt && lt > 0) {
        const d = dayjs(pd);
        if (d.isValid()) return d.add(Number(lt), "day").format("YYYY-MM-DD");
      }
      return item.expected_delivery || null;
    })(),
    notes: item.notes != null ? String(item.notes) : "",
  };
}

// 列表（支持搜索 / 状态过滤）
router.get("/materials", (req, res) => {
  const { project_id, status, search } = req.query;
  if (!project_id) return res.status(400).json({ ok: false, error: "project_id 必填" });
  let sql = "SELECT * FROM materials WHERE project_id = ?";
  const params = [Number(project_id)];
  if (status) {
    sql += " AND material_status = ?";
    params.push(status);
  }
  if (search) {
    sql +=
      " AND (part_number LIKE ? OR manufacturer LIKE ? OR model LIKE ? OR material_status LIKE ? OR notes LIKE ?)";
    const like = `%${search}%`;
    params.push(like, like, like, like, like);
  }
  sql += " ORDER BY seq ASC, id ASC";
  res.json({ ok: true, data: db.prepare(sql).all(...params) });
});

// 单行新增（默认状态「默认」，自动分配连续序号）
router.post("/materials", (req, res) => {
  const { project_id } = req.body;
  if (!project_id) return res.status(400).json({ ok: false, error: "project_id 必填" });
  const n = normalize(req.body);
  const seq = nextSeq(Number(project_id));
  const result = db
    .prepare(
      `INSERT INTO materials (project_id, seq, part_number, manufacturer, model, material_status, quantity, quantity_per_set, set_count, purchase_date, lead_time, expected_delivery, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      Number(project_id),
      seq,
      n.part_number,
      n.manufacturer,
      n.model,
      n.material_status,
      n.quantity,
      n.quantity_per_set,
      n.set_count,
      n.purchase_date,
      n.lead_time,
      n.expected_delivery,
      n.notes
    );
  res.status(201).json({
    ok: true,
    data: db.prepare("SELECT * FROM materials WHERE id = ?").get(result.lastInsertRowid),
  });
});

// 批量导入（前端已解析并映射字段）。自动分配连续序号，并记录撤销快照
router.post("/materials/batch", (req, res) => {
  const { project_id, items } = req.body;
  if (!project_id) return res.status(400).json({ ok: false, error: "project_id 必填" });
  if (!Array.isArray(items) || items.length === 0)
    return res.status(400).json({ ok: false, error: "items 必填且非空" });
  let seq = nextSeq(Number(project_id));
  const insert = db.prepare(
    `INSERT INTO materials (project_id, seq, part_number, manufacturer, model, material_status, quantity, quantity_per_set, set_count, purchase_date, lead_time, expected_delivery, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertedIds = [];
  db.transaction(() => {
    items.forEach((item) => {
      const n = normalize(item);
      const r = insert.run(
        Number(project_id),
        seq++,
        n.part_number,
        n.manufacturer,
        n.model,
        n.material_status,
        n.quantity,
        n.quantity_per_set,
        n.set_count,
        n.purchase_date,
        n.lead_time,
        n.expected_delivery,
        n.notes
      );
      insertedIds.push(r.lastInsertRowid);
    });
  })();
  // 记录撤销快照
  db.prepare(
    "INSERT INTO material_import_snapshots (project_id, ids_json) VALUES (?, ?)"
  ).run(Number(project_id), JSON.stringify(insertedIds));
  res.status(201).json({ ok: true, data: { count: insertedIds.length, ids: insertedIds } });
});

// 最近一次导入快照（供前端显示「撤销导入」按钮 + 倒计时）
router.get("/materials/import-snapshot", (req, res) => {
  const { project_id } = req.query;
  if (!project_id) return res.status(400).json({ ok: false, error: "project_id 必填" });
  const row = db
    .prepare(
      "SELECT id, ids_json, created_at FROM material_import_snapshots WHERE project_id = ? ORDER BY id DESC LIMIT 1"
    )
    .get(Number(project_id));
  if (!row) return res.json({ ok: true, data: null });
  let ids = [];
  try {
    ids = JSON.parse(row.ids_json);
  } catch (e) {
    ids = [];
  }
  res.json({ ok: true, data: { id: row.id, created_at: row.created_at, count: ids.length } });
});

// 撤销最近一次导入
router.post("/materials/import-undo", (req, res) => {
  const { project_id } = req.body;
  if (!project_id) return res.status(400).json({ ok: false, error: "project_id 必填" });
  const row = db
    .prepare(
      "SELECT id, ids_json, created_at FROM material_import_snapshots WHERE project_id = ? ORDER BY id DESC LIMIT 1"
    )
    .get(Number(project_id));
  if (!row) return res.status(404).json({ ok: false, error: "无可用撤销快照" });
  let ids = [];
  try {
    ids = JSON.parse(row.ids_json);
  } catch (e) {
    ids = [];
  }
  // 5 分钟有效期
  const created = new Date(row.created_at.replace(" ", "T") + (row.created_at.includes("Z") ? "" : "+08:00"));
  if (Date.now() - created.getTime() > 5 * 60 * 1000) {
    db.prepare("DELETE FROM material_import_snapshots WHERE id = ?").run(row.id);
    return res.status(410).json({ ok: false, error: "撤销窗口已过期（5 分钟）" });
  }
  db.transaction(() => {
    const del = db.prepare("DELETE FROM materials WHERE id = ?");
    ids.forEach((id) => del.run(id));
    db.prepare("DELETE FROM material_import_snapshots WHERE id = ?").run(row.id);
  })();
  renumberSeq(Number(project_id));
  res.json({ ok: true, data: { removed: ids.length } });
});

// 批量删除
router.delete("/materials/batch", (req, res) => {
  const { project_id, ids } = req.body;
  if (!project_id || !Array.isArray(ids) || ids.length === 0)
    return res.status(400).json({ ok: false, error: "project_id 与 ids 必填" });
  db.transaction(() => {
    const del = db.prepare("DELETE FROM materials WHERE id = ? AND project_id = ?");
    ids.forEach((id) => del.run(id, Number(project_id)));
  })();
  renumberSeq(Number(project_id));
  res.json({ ok: true, data: { removed: ids.length } });
});

// 批量修改状态
router.put("/materials/batch-status", (req, res) => {
  const { ids, material_status } = req.body;
  if (!Array.isArray(ids) || ids.length === 0)
    return res.status(400).json({ ok: false, error: "ids 必填" });
  if (!MATERIAL_STATUSES.includes(material_status))
    return res.status(400).json({ ok: false, error: "非法物料状态" });
  const update = db.prepare(
    "UPDATE materials SET material_status = ?, updated_at = datetime('now','localtime') WHERE id = ?"
  );
  db.transaction(() => {
    ids.forEach((id) => update.run(material_status, id));
  })();
  res.json({ ok: true, data: { updated: ids.length } });
});

// 单条查询
router.get("/materials/:id", (req, res) => {
  const m = db.prepare("SELECT * FROM materials WHERE id = ?").get(req.params.id);
  if (!m) return res.status(404).json({ ok: false, error: "物料不存在" });
  res.json({ ok: true, data: m });
});

// 单条更新
router.put("/materials/:id", (req, res) => {
  const m = db.prepare("SELECT * FROM materials WHERE id = ?").get(req.params.id);
  if (!m) return res.status(404).json({ ok: false, error: "物料不存在" });
  const n = normalize({ ...m, ...req.body });
  // seq / project_id 不可经此接口变更
  db.prepare(
    `UPDATE materials SET
      part_number=?, manufacturer=?, model=?, material_status=?, quantity=?,
      quantity_per_set=?, set_count=?, purchase_date=?, lead_time=?, expected_delivery=?, notes=?,
      updated_at=datetime('now','localtime')
     WHERE id=?`
  ).run(
    n.part_number,
    n.manufacturer,
    n.model,
    n.material_status,
    n.quantity,
    n.quantity_per_set,
    n.set_count,
    n.purchase_date,
    n.lead_time,
    n.expected_delivery,
    n.notes,
    req.params.id
  );
  res.json({ ok: true, data: db.prepare("SELECT * FROM materials WHERE id = ?").get(req.params.id) });
});

// 单条删除
router.delete("/materials/:id", (req, res) => {
  const m = db.prepare("SELECT * FROM materials WHERE id = ?").get(req.params.id);
  if (!m) return res.status(404).json({ ok: false, error: "物料不存在" });
  db.prepare("DELETE FROM materials WHERE id = ?").run(req.params.id);
  renumberSeq(m.project_id);
  res.json({ ok: true });
});

export default router;
