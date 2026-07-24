import { Router } from "express";
import db from "../db.js";
const router = Router();

// 需求清单与采购清单复用同一套状态枚举（保证「采购状态 → 需求联动」语义一致）
const MATERIAL_STATUSES = ["默认", "已入库", "已下单", "待决策", "高风险"];

const COLUMNS = [
  "seq",
  "module",
  "description",
  "part_number",
  "estimated_price",
  "quantity",
  "material_status",
  "notes",
];

// 取某项目下最大序号，返回下一个连续序号
function nextSeq(projectId) {
  const row = db
    .prepare("SELECT MAX(seq) AS m FROM material_requirements WHERE project_id = ?")
    .get(projectId);
  return (row && row.m ? row.m : 0) + 1;
}

// 删除/导入后，按 id 升序重排该项目的序号，保证连续无断档
function renumberSeq(projectId) {
  const rows = db
    .prepare("SELECT id FROM material_requirements WHERE project_id = ? ORDER BY seq ASC, id ASC")
    .all(projectId);
  const update = db.prepare("UPDATE material_requirements SET seq = ? WHERE id = ?");
  db.transaction(() => {
    rows.forEach((r, i) => update.run(i + 1, r.id));
  })();
}

// 规范化单行需求字段
function normalize(item = {}) {
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    module: item.module != null ? String(item.module) : "",
    description: item.description != null ? String(item.description) : "",
    part_number: item.part_number != null ? String(item.part_number) : "",
    estimated_price: item.estimated_price !== undefined && item.estimated_price !== "" ? num(item.estimated_price) : 0,
    quantity: item.quantity !== undefined && item.quantity !== "" ? num(item.quantity) : 0,
    material_status: MATERIAL_STATUSES.includes(item.material_status) ? item.material_status : "默认",
    notes: item.notes != null ? String(item.notes) : "",
  };
}

function ownProject(projectId, userId) {
  const proj = db.prepare("SELECT owner_id FROM projects WHERE id = ?").get(Number(projectId));
  return proj && proj.owner_id === userId;
}

// 列表（支持搜索 / 状态过滤；物料状态与采购清单按物料号实时联动）
router.get("/requirements", (req, res) => {
  const { project_id, status, search } = req.query;
  if (!project_id) return res.status(400).json({ ok: false, error: "project_id 必填" });
  if (!ownProject(project_id, req.userId)) return res.status(403).json({ ok: false, error: "无权访问该项目" });
  const pid = Number(project_id);

  // 采购清单同项目、同物料号(part_number)的最新状态映射（用于需求清单状态联动）
  const purchaseRows = db
    .prepare("SELECT part_number, material_status, id FROM materials WHERE project_id = ? AND part_number <> '' ORDER BY id DESC")
    .all(pid);
  const purchaseStatus = {};
  for (const r of purchaseRows) {
    if (!(r.part_number in purchaseStatus)) purchaseStatus[r.part_number] = r.material_status;
  }

  let rows = db
    .prepare("SELECT * FROM material_requirements WHERE project_id = ? ORDER BY seq ASC, id ASC")
    .all(pid);

  // 附加联动状态：有对应采购记录则显示采购状态，否则为 null（前端回退自身状态）
  rows = rows.map((r) => ({
    ...r,
    purchase_status: r.part_number && purchaseStatus[r.part_number] != null ? purchaseStatus[r.part_number] : null,
  }));

  // 关键字搜索（物料号/模块/描述/状态/采购状态/备注）
  if (search) {
    const kw = String(search).toLowerCase();
    rows = rows.filter((r) =>
      [r.module, r.description, r.part_number, r.material_status, r.purchase_status, r.notes]
        .some((v) => v != null && String(v).toLowerCase().includes(kw))
    );
  }
  // 状态过滤（基于联动后的显示状态）
  if (status) {
    rows = rows.filter((r) => (r.purchase_status != null ? r.purchase_status : r.material_status) === status);
  }

  res.json({ ok: true, data: rows });
});

// 单条新增（默认状态「默认」，自动分配连续序号）
router.post("/requirements", (req, res) => {
  const { project_id } = req.body;
  if (!project_id) return res.status(400).json({ ok: false, error: "project_id 必填" });
  if (!ownProject(project_id, req.userId)) return res.status(403).json({ ok: false, error: "无权访问该项目" });
  const n = normalize(req.body);
  const seq = nextSeq(Number(project_id));
  const result = db
    .prepare(
      `INSERT INTO material_requirements (project_id, seq, module, description, part_number, estimated_price, quantity, material_status, notes, owner_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      Number(project_id),
      seq,
      n.module,
      n.description,
      n.part_number,
      n.estimated_price,
      n.quantity,
      n.material_status,
      n.notes,
      req.userId
    );
  res.status(201).json({
    ok: true,
    data: db.prepare("SELECT * FROM material_requirements WHERE id = ?").get(result.lastInsertRowid),
  });
});

// 批量导入（前端已解析并映射字段）。自动分配连续序号
router.post("/requirements/batch", (req, res) => {
  const { project_id, items } = req.body;
  if (!project_id) return res.status(400).json({ ok: false, error: "project_id 必填" });
  if (!ownProject(project_id, req.userId)) return res.status(403).json({ ok: false, error: "无权访问该项目" });
  if (!Array.isArray(items) || items.length === 0)
    return res.status(400).json({ ok: false, error: "items 必填且非空" });
  let seq = nextSeq(Number(project_id));
  const insert = db.prepare(
    `INSERT INTO material_requirements (project_id, seq, module, description, part_number, estimated_price, quantity, material_status, notes, owner_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertedIds = [];
  db.transaction(() => {
    items.forEach((item) => {
      const n = normalize(item);
      const r = insert.run(
        Number(project_id),
        seq++,
        n.module,
        n.description,
        n.part_number,
        n.estimated_price,
        n.quantity,
        n.material_status,
        n.notes,
        req.userId
      );
      insertedIds.push(r.lastInsertRowid);
    });
  })();
  res.status(201).json({ ok: true, data: { count: insertedIds.length, ids: insertedIds } });
});

// 批量删除
router.delete("/requirements/batch", (req, res) => {
  const { project_id, ids } = req.body;
  if (!project_id || !Array.isArray(ids) || ids.length === 0)
    return res.status(400).json({ ok: false, error: "project_id 与 ids 必填" });
  if (!ownProject(project_id, req.userId)) return res.status(403).json({ ok: false, error: "无权访问该项目" });
  db.transaction(() => {
    const del = db.prepare("DELETE FROM material_requirements WHERE id = ? AND project_id = ?");
    ids.forEach((id) => del.run(id, Number(project_id)));
  })();
  renumberSeq(Number(project_id));
  res.json({ ok: true, data: { removed: ids.length } });
});

// 批量修改状态
router.put("/requirements/batch-status", (req, res) => {
  const { ids, material_status } = req.body;
  if (!Array.isArray(ids) || ids.length === 0)
    return res.status(400).json({ ok: false, error: "ids 必填" });
  if (!MATERIAL_STATUSES.includes(material_status))
    return res.status(400).json({ ok: false, error: "非法物料状态" });
  const rows = db.prepare(`SELECT DISTINCT project_id FROM material_requirements WHERE id IN (${ids.map(() => "?").join(",")})`).all(...ids);
  if (rows.length === 0) return res.status(404).json({ ok: false, error: "物料不存在" });
  const projectIds = rows.map((r) => r.project_id);
  const owned = db.prepare(`SELECT COUNT(*) as cnt FROM projects WHERE id IN (${projectIds.map(() => "?").join(",")}) AND owner_id = ?`).get(...projectIds, req.userId);
  if (owned.cnt !== projectIds.length) return res.status(403).json({ ok: false, error: "无权访问该项目" });
  const update = db.prepare(
    "UPDATE material_requirements SET material_status = ?, updated_at = datetime('now','localtime') WHERE id = ?"
  );
  db.transaction(() => {
    ids.forEach((id) => update.run(material_status, id));
  })();
  res.json({ ok: true, data: { updated: ids.length } });
});

// 单条查询
router.get("/requirements/:id", (req, res) => {
  const m = db.prepare("SELECT * FROM material_requirements WHERE id = ?").get(req.params.id);
  if (!m) return res.status(404).json({ ok: false, error: "需求物料不存在" });
  if (!ownProject(m.project_id, req.userId)) return res.status(403).json({ ok: false, error: "无权访问该项目" });
  res.json({ ok: true, data: m });
});

// 单条更新
router.put("/requirements/:id", (req, res) => {
  const m = db.prepare("SELECT * FROM material_requirements WHERE id = ?").get(req.params.id);
  if (!m) return res.status(404).json({ ok: false, error: "需求物料不存在" });
  if (!ownProject(m.project_id, req.userId)) return res.status(403).json({ ok: false, error: "无权访问该项目" });
  const n = normalize({ ...m, ...req.body });
  db.prepare(
    `UPDATE material_requirements SET
      module=?, description=?, part_number=?, estimated_price=?, quantity=?, material_status=?, notes=?,
      updated_at=datetime('now','localtime')
     WHERE id=?`
  ).run(
    n.module,
    n.description,
    n.part_number,
    n.estimated_price,
    n.quantity,
    n.material_status,
    n.notes,
    req.params.id
  );
  res.json({ ok: true, data: db.prepare("SELECT * FROM material_requirements WHERE id = ?").get(req.params.id) });
});

// 单条删除
router.delete("/requirements/:id", (req, res) => {
  const m = db.prepare("SELECT * FROM material_requirements WHERE id = ?").get(req.params.id);
  if (!m) return res.status(404).json({ ok: false, error: "需求物料不存在" });
  if (!ownProject(m.project_id, req.userId)) return res.status(403).json({ ok: false, error: "无权访问该项目" });
  db.prepare("DELETE FROM material_requirements WHERE id = ?").run(req.params.id);
  renumberSeq(m.project_id);
  res.json({ ok: true });
});

export default router;
