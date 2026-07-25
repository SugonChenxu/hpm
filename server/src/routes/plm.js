/**
 * PLM 库存管理路由
 *
 * 端点：
 *   GET  /plm/connection   — 读取 PLM 连接配置（当前用户）
 *   PUT  /plm/connection   — 更新 PLM 连接配置（server_url + cookie + project_links）
 *   GET  /plm/projects     — 获取 PLM 项目列表（用于关联项目）
 *   GET  /plm/link         — 读取某 Forge 项目的关联（无则尝试自动关联）
 *   POST /plm/sync         — 同步某项目的 PLM 库存到本地
 *   GET  /plm/inventory    — 读取本地库存明细（可按 lgort 过滤）
 */

import { Router } from "express";
import db from "../db.js";
import {
  getConnection,
  getAdapter,
  getLink,
  saveLink,
  resolvePlmOid,
  plmError,
} from "../plm-resolve.js";

const router = Router();

function updateLastSync(status, ownerId) {
  db.prepare(
    "UPDATE plm_connection SET last_sync_at=datetime('now','localtime'), last_sync_status=? WHERE owner_id=?"
  ).run(status, ownerId);
}

// ═══════════════════════════════════════════════
// GET /plm/connection
// ═══════════════════════════════════════════════
router.get("/plm/connection", (req, res) => {
  const conn = getConnection(req.userId);
  res.json({ ok: true, data: conn || {} });
});

// ═══════════════════════════════════════════════
// PUT /plm/connection
// ═══════════════════════════════════════════════
router.put("/plm/connection", (req, res) => {
  const { server_url, cookie, project_links } = req.body;
  const existing = getConnection(req.userId);

  let mergedLinks = null;
  if (project_links != null) {
    // 合并模式：按 forge_id 去重，新覆盖旧
    const incomingArr = Array.isArray(project_links) ? project_links : [];
    let oldArr = [];
    try { oldArr = JSON.parse(existing?.project_links || "[]"); } catch {}
    if (!Array.isArray(oldArr)) oldArr = [];
    const map = new Map();
    for (const l of oldArr) { if (l?.forge_id) map.set(String(l.forge_id), l); }
    for (const l of incomingArr) { if (l?.forge_id) map.set(String(l.forge_id), { ...(map.get(String(l.forge_id)) || {}), ...l }); }
    mergedLinks = JSON.stringify([...map.values()]);
  }

  if (existing) {
    db.prepare(
      `UPDATE plm_connection SET
         server_url=COALESCE(?,server_url),
         cookie=COALESCE(?,cookie),
         project_links=COALESCE(?,project_links),
         updated_at=datetime('now','localtime')
       WHERE id=? AND owner_id=?`
    ).run(
      server_url,
      cookie,
      mergedLinks,
      existing.id,
      req.userId
    );
  } else {
    db.prepare(
      `INSERT INTO plm_connection (server_url, cookie, project_links, owner_id)
       VALUES (?, ?, ?, ?)`
    ).run(
      server_url || "https://plm.sugon.com/3dspace",
      cookie || "",
      mergedLinks || "[]",
      req.userId
    );
  }
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════
// GET /plm/projects — PLM 项目列表（当前用户）
// ═══════════════════════════════════════════════
router.get("/plm/projects", async (req, res) => {
  try {
    const adapter = getAdapter(req.userId);
    const data = await adapter.fetchProjects();
    res.json({ ok: true, data });
  } catch (error) {
    if (error.code === "auth_failed") {
      return res.json({ ok: true, data: [], needsConfig: true });
    }
    const { status, message } = plmError(error, "获取 PLM 项目列表失败");
    res.status(status).json({ ok: false, error: message });
  }
});

// ═══════════════════════════════════════════════
// GET /plm/link?project_id= — 读取/自动关联
// ═══════════════════════════════════════════════
router.get("/plm/link", async (req, res) => {
  const { project_id } = req.query;
  if (!project_id) return res.status(400).json({ ok: false, error: "project_id 必填" });
  // 归属校验
  const proj = db
    .prepare("SELECT id, name FROM projects WHERE id=? AND owner_id=?")
    .get(project_id, req.userId);
  if (!proj) return res.status(403).json({ ok: false, error: "无权访问该项目" });

  const existing = getLink(req.userId, project_id);
  if (existing && existing.plm_oid) {
    return res.json({ ok: true, data: { ...existing, auto: false } });
  }
  // 尝试自动关联
  try {
    const oid = await resolvePlmOid(req.userId, project_id);
    const link = getLink(req.userId, project_id);
    return res.json({ ok: true, data: { ...link, auto: true } });
  } catch (error) {
    if (error.code === "no_match") {
      return res.json({ ok: true, data: { linked: false, reason: "no_match", forge_name: proj.name } });
    }
    const { status, message } = plmError(error, "自动关联失败");
    res.status(status).json({ ok: false, error: message });
  }
});

// ═══════════════════════════════════════════════
// POST /plm/sync — 同步库存到本地
// ═══════════════════════════════════════════════
router.post("/plm/sync", async (req, res) => {
  const { project_id, tree_label, lgort } = req.body;
  if (!project_id) return res.status(400).json({ ok: false, error: "project_id 必填" });

  const proj = db
    .prepare("SELECT id, name FROM projects WHERE id=? AND owner_id=?")
    .get(project_id, req.userId);
  if (!proj) return res.status(403).json({ ok: false, error: "无权访问该项目" });

  // 取关联（优先已有；否则自动解析 OID）
  let link = getLink(req.userId, project_id);
  let plmOid;
  try {
    plmOid = link?.plm_oid || (await resolvePlmOid(req.userId, project_id));
  } catch (error) {
    const { status, message } = plmError(error, "解析 PLM 项目失败");
    return res.status(status).json({ ok: false, error: message });
  }

  // tree_label 不强制：优先用已存值，次尝试无仓库/默认「青海」
  let treeLabel = tree_label != null ? tree_label : (link?.tree_label || "");
  let warehouseRows = [];

  try {
    const adapter = getAdapter(req.userId);
    // 尝试拉取
    warehouseRows = await adapter.fetchWarehouse(plmOid, treeLabel);
    // 如果返回空且未指定仓库，尝试默认「青海」
    if (warehouseRows.length === 0 && !treeLabel) {
      warehouseRows = await adapter.fetchWarehouse(plmOid, "青海");
      if (warehouseRows.length > 0) treeLabel = "青海";
    }
  } catch (error) {
    updateLastSync(error.code || "error", req.userId);
    const { status, message } = plmError(error, "同步库存失败");
    return res.status(status).json({ ok: false, error: message });
  }

  // 写回 tree_label（自动探测到的）
  if (treeLabel && treeLabel !== (link?.tree_label || "")) {
    saveLink(req.userId, {
      forge_id: project_id,
      forge_name: proj.name,
      plm_oid: plmOid,
      plm_code: link?.plm_code || "",
      plm_name: link?.plm_name || "",
      tree_label: treeLabel,
      lgort: link?.lgort || "",
    });
  }

  try {
    const upsert = db.prepare(`
      INSERT INTO plm_inventory
        (owner_id, project_id, matnr, maktx, labst, werks, lgort, lgobe, stprs, matkl, wgbez, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))
      ON CONFLICT(owner_id, project_id, matnr, lgort) DO UPDATE SET
        maktx=excluded.maktx, labst=excluded.labst, werks=excluded.werks,
        lgobe=excluded.lgobe, stprs=excluded.stprs, matkl=excluded.matkl,
        wgbez=excluded.wgbez, synced_at=datetime('now','localtime')
    `);

    const count = db.transaction(() => {
      let n = 0;
      for (const r of warehouseRows) {
        const matnr = String(r.MATNR || "").trim();
        if (!matnr) continue;
        const labst = parseInt(r.LABST, 10);
        const stprs = parseFloat(r.STPRS);
        upsert.run(
          req.userId,
          project_id,
          matnr,
          String(r.MAKTX || ""),
          Number.isFinite(labst) ? labst : 0,
          String(r.WERKS || ""),
          String(r.LGORT || ""),
          String(r.LGOBE || ""),
          Number.isFinite(stprs) ? stprs : 0,
          String(r.MATKL || ""),
          String(r.WGBEZ || "")
        );
        n++;
      }
      return n;
    })(warehouseRows);

    updateLastSync("success", req.userId);
    res.json({ ok: true, data: { synced_count: count, total_rows: warehouseRows.length } });
  } catch (error) {
    updateLastSync(error.code || "error", req.userId);
    const { status, message } = plmError(error, "同步库存失败");
    res.status(status).json({ ok: false, error: message });
  }
});

// ═══════════════════════════════════════════════
// GET /plm/inventory?project_id=&lgort=
// ═══════════════════════════════════════════════
router.get("/plm/inventory", (req, res) => {
  const { project_id, lgort } = req.query;
  if (!project_id) return res.status(400).json({ ok: false, error: "project_id 必填" });
  const proj = db
    .prepare("SELECT id FROM projects WHERE id=? AND owner_id=?")
    .get(project_id, req.userId);
  if (!proj) return res.status(403).json({ ok: false, error: "无权访问该项目" });

  let rows;
  if (lgort) {
    rows = db
      .prepare(
        "SELECT * FROM plm_inventory WHERE owner_id=? AND project_id=? AND lgort=? ORDER BY matnr"
      )
      .all(req.userId, project_id, lgort);
  } else {
    rows = db
      .prepare("SELECT * FROM plm_inventory WHERE owner_id=? AND project_id=? ORDER BY matnr")
      .all(req.userId, project_id);
  }
  const totalStock = rows.reduce((s, r) => s + (r.labst || 0), 0);
  const totalValue = rows.reduce((s, r) => s + (r.labst || 0) * (r.stprs || 0), 0);
  res.json({
    ok: true,
    data: { rows, total_stock: totalStock, total_value: Math.round(totalValue * 100) / 100 },
  });
});

export default router;
