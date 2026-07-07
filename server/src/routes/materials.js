import { Router } from "express";
import db from "../db.js";
const router = Router();

router.get("/materials", (req, res) => {
  const { project_id, type, status, search } = req.query;
  let sql = "SELECT * FROM materials WHERE 1=1";
  const params = [];
  if (project_id) { sql += " AND project_id = ?"; params.push(project_id); }
  if (type) { sql += " AND material_type = ?"; params.push(type); }
  if (status) { sql += " AND status = ?"; params.push(status); }
  if (search) { sql += " AND (part_no LIKE ? OR name LIKE ? OR supplier LIKE ?)"; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  sql += " ORDER BY planned_delivery ASC, created_at DESC";
  res.json({ ok: true, data: db.prepare(sql).all(...params) });
});

router.post("/materials", (req, res) => {
  const { project_id, part_no, name, spec, material_type, quantity, supplier, lead_time_days, planned_delivery, status, notes } = req.body;
  if (!part_no || !name || !project_id) return res.status(400).json({ ok: false, error: "part_no, name, project_id 必填" });
  const result = db.prepare("INSERT INTO materials (project_id, part_no, name, spec, material_type, quantity, supplier, lead_time_days, planned_delivery, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(project_id, part_no, name, spec || "", material_type || "开发", quantity || 1, supplier || "", lead_time_days || null, planned_delivery || null, status || "待下单", notes || "");
  res.status(201).json({ ok: true, data: db.prepare("SELECT * FROM materials WHERE id = ?").get(result.lastInsertRowid) });
});

router.post("/materials/batch", (req, res) => {
  const { items } = req.body;
  if (!items || !items.length) return res.status(400).json({ ok: false, error: "items 必填" });
  const insert = db.prepare("INSERT INTO materials (project_id, part_no, name, spec, material_type, quantity, supplier, lead_time_days, planned_delivery, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  const inserted = [];
  db.transaction(() => {
    items.forEach(item => {
      const r = insert.run(item.project_id, item.part_no, item.name, item.spec || "", item.material_type || "开发", item.quantity || 1, item.supplier || "", item.lead_time_days || null, item.planned_delivery || null, item.status || "待下单", item.notes || "");
      inserted.push(r.lastInsertRowid);
    });
  })();
  res.status(201).json({ ok: true, data: { count: inserted.length } });
});

router.get("/materials/overdue", (req, res) => {
  res.json({ ok: true, data: db.prepare("SELECT * FROM materials WHERE planned_delivery IS NOT NULL AND planned_delivery < date('now','localtime') AND status NOT IN ('已到货') ORDER BY planned_delivery ASC").all() });
});

router.get("/materials/stats", (req, res) => {
  const stats = db.prepare(`SELECT project_id, status, COUNT(*) as count FROM materials GROUP BY project_id, status ORDER BY project_id`).all();
  res.json({ ok: true, data: stats });
});

router.get("/materials/:id", (req, res) => {
  const m = db.prepare("SELECT * FROM materials WHERE id = ?").get(req.params.id);
  if (!m) return res.status(404).json({ ok: false, error: "物料不存在" });
  res.json({ ok: true, data: m });
});

router.put("/materials/:id", (req, res) => {
  const { part_no, name, spec, material_type, quantity, supplier, lead_time_days, planned_delivery, actual_delivery, actual_quantity, status, notes } = req.body;
  const m = db.prepare("SELECT * FROM materials WHERE id = ?").get(req.params.id);
  if (!m) return res.status(404).json({ ok: false, error: "物料不存在" });
  db.prepare("UPDATE materials SET part_no=COALESCE(?,part_no), name=COALESCE(?,name), spec=COALESCE(?,spec), material_type=COALESCE(?,material_type), quantity=COALESCE(?,quantity), supplier=COALESCE(?,supplier), lead_time_days=COALESCE(?,lead_time_days), planned_delivery=COALESCE(?,planned_delivery), actual_delivery=COALESCE(?,actual_delivery), actual_quantity=COALESCE(?,actual_quantity), status=COALESCE(?,status), notes=COALESCE(?,notes), updated_at=datetime('now','localtime') WHERE id=?").run(part_no, name, spec, material_type, quantity, supplier, lead_time_days, planned_delivery, actual_delivery, actual_quantity, status, notes, req.params.id);
  res.json({ ok: true, data: db.prepare("SELECT * FROM materials WHERE id = ?").get(req.params.id) });
});

router.delete("/materials/:id", (req, res) => {
  db.prepare("DELETE FROM materials WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

export default router;
