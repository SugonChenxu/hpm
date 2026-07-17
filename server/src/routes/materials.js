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

// ===== OA 采购申请链接抓取（支持 CORS 使书签可跨域调用） =====
router.post("/materials/oa-fetch", async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  const { url, cookies } = req.body;
  if (!url) return res.status(400).json({ ok: false, error: "url 必填" });

  try {
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
    };
    if (cookies) headers["Cookie"] = cookies.replace(/[^\x20-\x7E]/g, "").trim();

    const resp = await fetch(url, { headers, redirect: "follow", timeout: 30000 });
    if (!resp.ok) throw new Error("OA 页面返回 HTTP " + resp.status);
    const html = await resp.text();

    // 1. 提取申请日期（表单头部标签-值对）
    let formDate = null;
    const dateMatch = html.match(/申请日期[：:\s<]*[^<]*?(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/);
    if (dateMatch) formDate = dateMatch[1].replace(/[./]/g, "-");

    // 2. 找物料表格 — 找到包含"物料编号"或"料号"的 <table>
    const tableMatch = html.match(/<table[\s\S]*?物料编号[\s\S]*?<\/table>/i)
      || html.match(/<table[\s\S]*?料号[\s\S]*?<\/table>/i)
      || html.match(/<table[\s\S]*?part_no[\s\S]*?<\/table>/i);
    if (!tableMatch) {
      const preview = html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 600);
      throw new Error("未找到物料表格。页面是否加载完整？前600字: " + preview);
    }

    const tableHtml = tableMatch[0];
    const trs = tableHtml.match(/<tr[\s>][\s\S]*?<\/tr>/gi) || [];

    // 3. 解析列映射 — 取第一个有效 tr 作为表头
    let colMap = {};
    for (const tr of trs) {
      const tds = tr.match(/<t[dh][\s>][\s\S]*?<\/t[dh]>/gi);
      if (!tds || tds.length < 3) continue;
      tds.forEach((td, i) => {
        const text = td.replace(/<[^>]+>/g, "").trim();
        if (!text) return;
        const t = text.toLowerCase();
        if (/物料编号|料号|编号|part.?no/.test(t)) colMap[i] = "part_number";
        else if (/厂家|供应商|品牌|厂商/.test(t)) colMap[i] = "manufacturer";
        else if (/型号|描述|规格/.test(t)) colMap[i] = "model";
        else if (/数量/.test(t)) colMap[i] = "quantity";
        else if (/单价/.test(t)) colMap[i] = "_price";
        else if (/金额|总价/.test(t)) colMap[i] = "_amount";
        else if (/备注|说明|用途/.test(t)) colMap[i] = "notes";
        else if (/交期|delivery/.test(t)) colMap[i] = "expected_delivery";
      });
      if (Object.keys(colMap).length >= 2) break; // 表头匹配成功
    }

    if (Object.keys(colMap).length < 2) throw new Error("无法识别表头列名。页面 HTML 前500字:" + html.slice(0, 500));

    // 4. 提取数据行
    const items = [];
    for (const tr of trs) {
      const tds = tr.match(/<t[dh][\s>][\s\S]*?<\/t[dh]>/gi);
      if (!tds) continue;
      const item = {};
      let hasData = false;
      tds.forEach((td, i) => {
        const field = colMap[i];
        if (!field) return;
        const val = td.replace(/<[^>]+>/g, "").trim().replace(/\s+/g, " ");
        if (!val || /^\d+$/ .test(val)|| val === "序号" || val === "合计") return;
        hasData = true;
        if (field === "quantity" || field === "_price" || field === "_amount") {
          item[field] = parseFloat(val.replace(/[,，¥￥\s]/g, "")) || 0;
        } else {
          item[field] = val;
        }
      });
      if (hasData && item.part_number) {
        if (item._price && item.quantity) {
          item.notes = (item.notes ? item.notes + " | " : "") + "单价:" + item._price + ",金额:" + (item._amount || item._price * item.quantity);
        }
        delete item._price; delete item._amount;
        item.purchase_date = item.purchase_date || formDate;
        item.material_status = "默认";
        items.push(item);
      }
    }

    if (!items.length) throw new Error("未提取到物料行。");
    res.json({ ok: true, data: { count: items.length, items, formDate } });
  } catch (e) {
    res.json({ ok: false, error: e.message || "OA 抓取失败" });
  }
});

// ===== OA 书签直接提交（跨域）: 浏览器端提取 DOM 后 POST items，无需 cookie =====
router.post("/materials/oa-import", (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  const { project_id, items } = req.body;
  if (!project_id || !Array.isArray(items) || !items.length)
    return res.json({ ok: false, error: "project_id 与 items 必填" });

  let seq = nextSeq(Number(project_id));
  const insert = db.prepare(
    `INSERT INTO materials (project_id, seq, part_number, manufacturer, model, material_status, quantity, purchase_date, lead_time, expected_delivery, notes)
     VALUES (?, ?, ?, ?, ?, '默认', ?, ?, 0, null, ?)`
  );
  const insertedIds = [];
  db.transaction(() => {
    items.forEach((it) => {
      const r = insert.run(
        Number(project_id), seq++,
        it.part_number || "", it.manufacturer || "", it.model || "",
        parseFloat(it.quantity) || 0,
        it.purchase_date || null,
        it.notes || ""
      );
      insertedIds.push(r.lastInsertRowid);
    });
  })();
  // 快照
  db.prepare("INSERT INTO material_import_snapshots (project_id, ids_json) VALUES (?, ?)")
    .run(Number(project_id), JSON.stringify(insertedIds));
  res.json({ ok: true, data: { count: items.length, ids: insertedIds } });
});

// 处理 CORS 预检
router.options("/materials/oa-import", (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.sendStatus(204);
});

export default router;
