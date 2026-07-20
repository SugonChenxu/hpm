/**
 * mantis-resolve — 故障管理（Mantis）连接解析与错误映射辅助
 *
 * 职责：
 *  1. 按当前用户加载其独立的 Mantis 连接配置（server_url + cookie）
 *  2. 将 Forge 数字项目 id 解析为 Mantis hex 项目 id
 *     - 优先使用已保存的 project_mapping
 *     - 缺失时按项目名模糊匹配，并自动写回映射
 *  3. 将 Mantis 错误码统一映射为 HTTP 状态码 + 中文消息
 */

import db from "./db.js";
import MantisAdapter from "./adapters/mantis.js";

/** 读取当前用户的 Mantis 连接配置 */
export function getConnection(ownerId) {
  return db.prepare(
    "SELECT id, server_url, api_token, project_mapping, last_sync_at, last_sync_status FROM mantis_connection WHERE owner_id = ? LIMIT 1"
  ).get(ownerId);
}

/** 构造当前用户的适配器；未配置 Cookie 时抛出 auth_failed */
export function getAdapter(ownerId) {
  const conn = getConnection(ownerId);
  if (!conn || !conn.api_token) {
    const e = new Error("未配置 Mantis Cookie，请在故障管理页面填写");
    e.code = "auth_failed";
    throw e;
  }
  return new MantisAdapter(conn);
}

function normalizeName(s) {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

// 60s 内存缓存，避免同一请求周期内多次拉取全量项目
let _cache = { ownerId: null, ts: 0, data: null };
async function fetchAllMantisProjects(adapter, ownerId) {
  const now = Date.now();
  if (_cache.ownerId === ownerId && now - _cache.ts < 60000) return _cache.data;
  const data = await adapter.fetchAllProjects();
  _cache = { ownerId, ts: now, data };
  return data;
}

/**
 * 将 Forge 项目数字 id 解析为 Mantis hex 项目 id。
 * 优先使用已保存的 project_mapping；缺失时按项目名模糊匹配并自动保存。
 * @returns {Promise<string>} Mantis hex 项目 id
 */
export async function resolveMantisId(ownerId, forgeProjectId) {
  const conn = getConnection(ownerId);
  if (!conn) {
    const e = new Error("未配置 Mantis 连接");
    e.code = "auth_failed";
    throw e;
  }
  let mapping = [];
  try { mapping = JSON.parse(conn.project_mapping || "[]"); } catch {}
  const found = mapping.find((m) => String(m.forge_id) === String(forgeProjectId));
  if (found && found.mantis_id) return found.mantis_id;

  const forge = db.prepare("SELECT name FROM projects WHERE id=? AND owner_id=?").get(forgeProjectId, ownerId);
  if (!forge) {
    const e = new Error("项目不存在或无权访问");
    e.code = "forbidden";
    throw e;
  }
  const adapter = new MantisAdapter(conn);
  const mantisProjects = await fetchAllMantisProjects(adapter, ownerId);
  const fn = normalizeName(forge.name);
  let match = mantisProjects.find((p) => normalizeName(p.name).startsWith(fn));
  if (!match) match = mantisProjects.find((p) => {
    const mn = normalizeName(p.name);
    return mn.includes(fn) || fn.includes(mn);
  });
  if (!match) {
    const e = new Error(`未能在 Mantis 中找到匹配项目「${forge.name}」`);
    e.code = "no_match";
    throw e;
  }
  mapping.push({ forge_id: forgeProjectId, mantis_id: match.id });
  db.prepare("UPDATE mantis_connection SET project_mapping=? WHERE id=? AND owner_id=?")
    .run(JSON.stringify(mapping), conn.id, ownerId);
  return match.id;
}

/** 统一将 Mantis 错误映射为 { status, message } */
export function mantisError(e, fallback) {
  switch (e.code) {
    case "auth_failed":
      return { status: 401, message: "Mantis 鉴权失败，请在故障管理页面填写正确的 Cookie" };
    case "no_match":
      return { status: 422, message: e.message };
    case "forbidden":
      return { status: 403, message: e.message };
    case "timeout":
      return { status: 504, message: "Mantis 服务器连接超时，请稍后重试" };
    case "network":
      return { status: 502, message: "无法连接 Mantis 服务器，请检查网络和服务地址" };
    default:
      return { status: 500, message: fallback || e.message };
  }
}
