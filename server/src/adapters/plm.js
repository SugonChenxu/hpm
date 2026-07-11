/**
 * PlmAdapter — 曙光 PLM（经典 ENOVIA v6 / MatrixOne 内核）只读适配器
 *
 * 本 P0 只实现「连接配置 + 只读探针」能力，不实现实际排程同步逻辑（P1 负责）。
 *
 * 关键环境事实（主理人实测）：
 *   1. PLM 服务为 https，证书由内部 CA 签发，Node 默认不信任 → 必须跳过证书校验。
 *   2. 鉴权方式为 CAS SSO 会话 Cookie（如 JSESSIONID=...cas01），作为 Cookie 请求头透传。
 *   3. 排程对象读取的真实请求 URL 需用户后续在浏览器 F12 抓取，本适配器提供探针能力。
 *
 * 设计要点：
 *   - 全部方法为静态方法（单用户场景，配置取第一条）。
 *   - httpRequest 默认 rejectUnauthorized:false（跳过内部 CA），由配置 tls_reject_unauthorized 控制。
 *   - 严格遵守最小变更，不改动任何无关文件。
 */

import db from "../db.js";
import https from "node:https";
import http from "node:http";

const REQUEST_TIMEOUT_MS = 20000;
const BODY_HEAD_LIMIT = 2000;

class PlmAdapter {
  // ── 连接配置读取 ──────────────────────────────────────────
  /**
   * 从 plm_connection 取第一条配置；无则返回 null。
   * @returns {object|null}
   */
  static getConfig() {
    const conn = db
      .prepare("SELECT * FROM plm_connection LIMIT 1")
      .get();
    return conn || null;
  }

  // ── 连接配置保存（upsert 第一条） ─────────────────────────
  /**
   * 保存/更新 PLM 连接配置（单用户，取第一条；无则 INSERT，有则 UPDATE）。
   * @param {{server_url:string, api_token?:string, collab_space?:string, tls_reject_unauthorized?:number}} param0
   * @returns {object} 保存后的配置
   */
  static saveConfig({
    server_url,
    api_token,
    collab_space,
    tls_reject_unauthorized,
  }) {
    if (!server_url || !server_url.trim()) {
      const e = new Error("server_url 必填");
      e.code = "validation_failed";
      throw e;
    }

    const existing = db
      .prepare("SELECT id FROM plm_connection LIMIT 1")
      .get();

    if (existing) {
      db.prepare(
        `UPDATE plm_connection SET
          server_url = COALESCE(?, server_url),
          api_token = COALESCE(?, api_token),
          collab_space = COALESCE(?, collab_space),
          tls_reject_unauthorized = COALESCE(?, tls_reject_unauthorized),
          updated_at = datetime('now','localtime')
        WHERE id = ?`
      ).run(
        server_url.trim(),
        api_token == null ? null : String(api_token),
        collab_space == null || collab_space.trim() === ""
          ? "GLOBAL"
          : collab_space.trim(),
        tls_reject_unauthorized === 1 ? 1 : 0,
        existing.id
      );
    } else {
      db.prepare(
        `INSERT INTO plm_connection
          (server_url, api_token, collab_space, tls_reject_unauthorized)
         VALUES (?, ?, ?, ?)`
      ).run(
        server_url.trim(),
        api_token == null ? null : String(api_token),
        collab_space == null || collab_space.trim() === ""
          ? "GLOBAL"
          : collab_space.trim(),
        tls_reject_unauthorized === 1 ? 1 : 0
      );
    }

    return PlmAdapter.getConfig();
  }

  // ── 私有：底层 HTTP 请求 ──────────────────────────────────
  /**
   * 发起一次 HTTP/HTTPS 请求，返回 { status, contentType, body }。
   * 默认跳过内部 CA（rejectUnauthorized:false），由配置 tls_reject_unauthorized 控制开关。
   * 网络错/TLS 错会抛出带 code 的 Error。
   *
   * @param {string} method  HTTP 方法（GET/POST...）
   * @param {string} url     绝对 URL
   * @param {{headers?:object, body?:string|null}} [options]
   * @returns {Promise<{status:number, contentType:string, body:string}>}
   */
  static _httpRequest(method, url, { headers = {}, body = null } = {}) {
    return new Promise((resolve, reject) => {
      let parsed;
      try {
        parsed = new URL(url);
      } catch (e) {
        const err = new Error(`无效的请求 URL: ${url}`);
        err.code = "invalid_url";
        return reject(err);
      }

      const isHttps = parsed.protocol === "https:";
      const lib = isHttps ? https : http;

      // 读取配置决定 TLS 校验策略；默认（无配置）跳过内部 CA。
      const cfg = PlmAdapter.getConfig() || { tls_reject_unauthorized: 0 };
      const rejectUnauthorized = cfg.tls_reject_unauthorized === 1;

      const options = {
        method: String(method || "GET").toUpperCase(),
        headers: headers || {},
        timeout: REQUEST_TIMEOUT_MS,
      };

      if (isHttps) {
        options.agent = new https.Agent({ rejectUnauthorized });
      }

      const req = lib.request(url, options, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          const bodyText = buf.toString("utf8");
          const contentType = res.headers["content-type"] || "";
          resolve({
            status: res.statusCode || 0,
            contentType,
            body: bodyText,
          });
        });
      });

      req.on("timeout", () => {
        req.destroy(new Error("PLM 请求超时"));
      });

      req.on("error", (e) => {
        const err = new Error(e.message || "PLM 请求失败");
        const code = e.code || "";
        if (
          code === "DEPTH_ZERO_SELF_SIGNED_CERT" ||
          code === "SELF_SIGNED_CERT_IN_CHAIN" ||
          code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ||
          code === "CERT_HAS_EXPIRED"
        ) {
          err.code = "tls_error";
        } else if (
          code === "ECONNREFUSED" ||
          code === "ENOTFOUND" ||
          code === "ECONNRESET" ||
          code === "EAI_AGAIN" ||
          /timeout/i.test(e.message || "")
        ) {
          err.code = "network_error";
        } else {
          err.code = "network_error";
        }
        reject(err);
      });

      if (body) {
        req.write(body);
      }
      req.end();
    });
  }

  // ── 探针：探测任意 PLM URL 并返回结构化结果 ───────────────
  /**
   * 用配置的会话 Cookie 探测一个 PLM URL，返回结构化探针结果。
   * @param {string} targetUrl 相对路径（如 /3dspace/common/emxTree.jsp）或绝对 URL
   * @returns {Promise<{status:number, contentType:string, bodyLength:number, bodyHead:string, isJson:boolean, jsonKeys:string[]|null, isHtml:boolean, message?:string}>}
   */
  static async probe(targetUrl) {
    const cfg = PlmAdapter.getConfig();
    if (!cfg || !cfg.server_url) {
      const e = new Error("未配置 PLM 连接（请先保存 server_url）");
      e.code = "auth_failed";
      throw e;
    }

    // 解析为绝对 URL：相对路径拼接到 server_url
    const raw = (targetUrl || "").trim();
    if (!raw) {
      const e = new Error("探测 URL 不能为空");
      e.code = "invalid_url";
      throw e;
    }

    let absUrl;
    if (/^https?:\/\//i.test(raw)) {
      absUrl = raw;
    } else {
      const base = cfg.server_url.replace(/\/+$/, "");
      absUrl = base + (raw.startsWith("/") ? "" : "/") + raw;
    }

    // 用配置 api_token 作为 Cookie 请求头
    const headers = {
      Cookie: cfg.api_token || "",
      Accept: "*/*",
      "User-Agent": "HPM-PLM-Probe/1.0",
    };

    const resp = await PlmAdapter._httpRequest("GET", absUrl, { headers });

    const body = resp.body || "";
    let isJson = false;
    let jsonKeys = null;
    try {
      const parsed = JSON.parse(body);
      isJson = true;
      jsonKeys = parsed && typeof parsed === "object" ? Object.keys(parsed) : [];
    } catch {
      isJson = false;
    }

    const contentType = resp.contentType || "";
    const isHtml =
      /text\/html/i.test(contentType) ||
      /^<!doctype\s+html|<html/i.test(body.trim());

    const result = {
      status: resp.status,
      contentType,
      bodyLength: body.length,
      bodyHead: body.slice(0, BODY_HEAD_LIMIT),
      isJson,
      jsonKeys: isJson ? jsonKeys : null,
      isHtml,
    };

    // 401/403 → 鉴权失败（Cookie 可能过期）
    if (resp.status === 401 || resp.status === 403) {
      result.message = "鉴权失败（Cookie 可能过期）";
    }

    return result;
  }
}

export default PlmAdapter;
