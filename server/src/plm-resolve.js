/**
 * plm-resolve — 库存管理（PLM）连接解析与错误映射辅助
 *
 * 职责：
 *  1. 按当前用户加载其独立的 PLM 连接配置（server_url + cookie）
 *  2. 将 Forge 数字项目 id 解析为 PLM 项目 OID（优先已保存映射，缺失时按项目名模糊匹配并自动保存）
 *  3. 维护 project_links（每项目：plm_oid / plm_name / tree_label / lgort）
 *  4. 将 PLM 错误码统一映射为 HTTP 状态码 + 中文消息
 */

import db from "./db.js";
import PLMAdapter from "./adapters/plm.js";

/** 读取当前用户的 PLM 连接配置 */
export function getConnection(ownerId) {
  return db
    .prepare(
      "SELECT id, server_url, cookie, project_links, last_sync_at, last_sync_status FROM plm_connection WHERE owner_id = ? LIMIT 1"
    )
    .get(ownerId);
}

/** 构造当前用户的适配器；未配置 Cookie 时抛出 auth_failed */
export function getAdapter(ownerId) {
  const conn = getConnection(ownerId);
  if (!conn || !conn.cookie) {
    const e = new Error("未配置 PLM Cookie，请在库存管理页面填写");
    e.code = "auth_failed";
    throw e;
  }
  return new PLMAdapter(conn);
}

function normalizeName(s) {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** 读取当前用户的全部项目关联 [{ forge_id, forge_name, plm_oid, plm_name, tree_label, lgort }] */
export function getLinks(ownerId) {
  const conn = getConnection(ownerId);
  if (!conn) return [];
  try {
    const arr = JSON.parse(conn.project_links || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** 读取单个 Forge 项目的关联 */
export function getLink(ownerId, forgeId) {
  return getLinks(ownerId).find((l) => String(l.forge_id) === String(forgeId)) || null;
}

/** 写入/更新单个项目的关联 */
export function saveLink(ownerId, link) {
  const conn = getConnection(ownerId);
  if (!conn) {
    db.prepare(
      "INSERT INTO plm_connection (owner_id, project_links) VALUES (?, ?)"
    ).run(ownerId, JSON.stringify([link]));
    return;
  }
  const links = getLinks(ownerId).filter((l) => String(l.forge_id) !== String(link.forge_id));
  links.push(link);
  db.prepare("UPDATE plm_connection SET project_links=? WHERE id=? AND owner_id=?").run(
    JSON.stringify(links),
    conn.id,
    ownerId
  );
}

// 60s 内存缓存，避免同一请求周期内多次拉取全量项目
let _cache = { ownerId: null, ts: 0, data: null };
async function fetchAllPlmProjects(adapter, ownerId) {
  const now = Date.now();
  if (_cache.ownerId === ownerId && now - _cache.ts < 60000) return _cache.data;
  const data = await adapter.fetchProjects();
  _cache = { ownerId, ts: now, data };
  return data;
}

/**
 * 将 Forge 项目数字 id 解析为 PLM 项目 OID。
 * 优先使用已保存的 project_links；缺失时按项目名模糊匹配并自动保存。
 * @returns {Promise<string>} PLM 项目 OID
 */
export async function resolvePlmOid(ownerId, forgeProjectId) {
  const existing = getLink(ownerId, forgeProjectId);
  if (existing && existing.plm_oid) return existing.plm_oid;

  const forge = db
    .prepare("SELECT name FROM projects WHERE id=? AND owner_id=?")
    .get(forgeProjectId, ownerId);
  if (!forge) {
    const e = new Error("项目不存在或无权访问");
    e.code = "forbidden";
    throw e;
  }
  const adapter = getAdapter(ownerId);
  const plmProjects = await fetchAllPlmProjects(adapter, ownerId);
  const fn = normalizeName(forge.name);
  let match = plmProjects.find(
    (p) => normalizeName(p.code).includes(fn) || normalizeName(p.name).includes(fn)
  );
  if (!match) {
    match = plmProjects.find((p) => fn.includes(normalizeName(p.code)) || fn.includes(normalizeName(p.name)));
  }
  if (!match) {
    const e = new Error(`未能在 PLM 中找到匹配项目「${forge.name}」`);
    e.code = "no_match";
    throw e;
  }
  // 自动写回映射（不覆盖用户已设的 tree_label / lgort）
  const merged = {
    forge_id: forgeProjectId,
    forge_name: forge.name,
    plm_oid: match.oid,
    plm_name: match.name || match.code,
    tree_label: existing?.tree_label || "",
    lgort: existing?.lgort || "",
  };
  saveLink(ownerId, merged);
  return match.oid;
}

/** 统一将 PLM 错误映射为 { status, message } */
export function plmError(e, fallback) {
  switch (e.code) {
    case "auth_failed":
      return { status: 401, message: "PLM 鉴权失败，请在库存管理页面填写有效的 Cookie" };
    case "no_match":
      return { status: 422, message: e.message };
    case "forbidden":
      return { status: 403, message: e.message };
    case "timeout":
      return { status: 504, message: "PLM 服务器连接超时，请稍后重试" };
    case "network":
      return { status: 502, message: "无法连接 PLM 服务器，请检查网络和服务地址" };
    case "plm_error":
      return { status: 502, message: "PLM 服务端返回错误，请稍后重试" };
    default:
      return { status: 500, message: fallback || e.message };
  }
}
