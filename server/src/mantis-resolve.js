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
    "SELECT id, server_url, api_token, project_mapping, watched_projects, last_sync_at, last_sync_status FROM mantis_connection WHERE owner_id = ? LIMIT 1"
  ).get(ownerId);
}

/**
 * 读取当前用户「最近使用」的 Mantis 项目列表（直接来自 Mantis 真实接口
 * GET /projects?action=get_recent_projects，无需本地维护）。
 * 返回扁平去重后的 [{ id, name }]。
 */
export async function getRecentProjects(ownerId) {
  const adapter = getAdapter(ownerId);
  return await adapter.fetchRecentProjects();
}

/**
 * 读取当前用户「关注/最近使用」的 Mantis 项目列表。
 * 结构：[{ mantis_id, mantis_name, forge_id, forge_name }]
 *
 * 兼容迁移：老用户仅有 project_mapping（无 watched_projects）时，
 * 将其升级为 watched_projects 并补全名称（仅发生一次）。
 */
export async function getWatchedProjects(ownerId) {
  const conn = getConnection(ownerId);
  if (!conn) return [];
  let watched = [];
  try { watched = JSON.parse(conn.watched_projects || "[]"); } catch {}
  if (Array.isArray(watched) && watched.length) return watched;

  // 迁移：从 project_mapping 升级
  let mapping = [];
  try { mapping = JSON.parse(conn.project_mapping || "[]"); } catch {}
  if (!Array.isArray(mapping) || !mapping.length) return [];

  const forgeProjects = db.prepare("SELECT id, name FROM projects WHERE owner_id=?").all(ownerId);
  const forgeNameOf = (id) => forgeProjects.find((p) => String(p.id) === String(id))?.name || "";
  watched = mapping.map((m) => ({
    mantis_id: m.mantis_id,
    mantis_name: m.mantis_name || "",
    forge_id: m.forge_id,
    forge_name: m.forge_name || forgeNameOf(m.forge_id),
  }));

  // 尝试补全 mantis_name（需有效 Cookie）
  try {
    const adapter = new MantisAdapter(conn);
    const all = await adapter.fetchAllProjects();
    watched = watched.map((w) => {
      const mp = all.find((p) => String(p.id) === String(w.mantis_id));
      return mp ? { ...w, mantis_name: mp.name } : w;
    });
  } catch {}

  db.prepare("UPDATE mantis_connection SET watched_projects=? WHERE id=? AND owner_id=?")
    .run(JSON.stringify(watched), conn.id, ownerId);
  return watched;
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

/**
 * 将 Mantis hex 项目 id 解析为 Forge 数字项目 id（用于所有权校验与落库）。
 * 仅依据用户**显式关注/手动映射**的 watched_projects / project_mapping 反查，
 * 不再做名称模糊匹配（避免错配）。找不到时给出清晰引导。
 * @returns {number} Forge 项目 id
 */
export async function resolveForgeId(ownerId, mantisId) {
  const conn = getConnection(ownerId);
  if (!conn) {
    const e = new Error("未配置 Mantis 连接");
    e.code = "auth_failed";
    throw e;
  }
  const findForge = (arr) => {
    const f = (arr || []).find((m) => String(m.mantis_id) === String(mantisId));
    if (f && f.forge_id != null) {
      const proj = db.prepare("SELECT id FROM projects WHERE id=? AND owner_id=?").get(f.forge_id, ownerId);
      if (proj) return proj.id;
    }
    return null;
  };
  let watched = [];
  try { watched = JSON.parse(conn.watched_projects || "[]"); } catch {}
  let mapping = [];
  try { mapping = JSON.parse(conn.project_mapping || "[]"); } catch {}

  const forgeId = findForge(watched) ?? findForge(mapping);
  if (forgeId != null) return forgeId;

  const e = new Error("该项目未在「关注列表」中关联 Forge 项目，请到故障管理页点「⚙ Mantis 设置」关注并选择对应项目");
  e.code = "no_match";
  throw e;
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
