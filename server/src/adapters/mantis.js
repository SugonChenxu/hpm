/**
 * MantisAdapter — Mantis REST API 适配器
 *
 * 职责：封装对 Mantis Bug Tracker REST API 的 HTTP 调用，
 * 包括鉴权、数据拉取、连接测试和统一错误处理。
 *
 * 错误码约定：
 *   - auth_failed  → 401 Unauthorized（Token 无效或未配置）
 *   - timeout      → 请求超时（ECONNABORTED / ETIMEDOUT）
 *   - network      → 其他网络层错误
 *   - unknown      → 未分类的服务端或未知错误
 */

import db from "../db.js";
import axios from "axios";

class MantisAdapter {
  /**
   * 构造 MantisAdapter 实例
   *
   * 从 mantis_connection 表读取第一条记录的 server_url 和 api_token。
   * 若表中无记录，使用默认值（baseUrl 指向 Sugon Mantis）。
   */
  constructor() {
    const conn = db.prepare("SELECT server_url, api_token FROM mantis_connection LIMIT 1").get();
    this.baseUrl = (conn && conn.server_url) || "https://mantis.sugon.com/api/rest";
    this.apiToken = (conn && conn.api_token) || "";
  }

  /**
   * 底层 HTTP 请求封装
   *
   * @param {"GET"|"POST"|"PUT"|"DELETE"|"HEAD"} method - HTTP 方法
   * @param {string} path - API 路径（如 "/projects"）
   * @param {object} [params={}] - 查询参数
   * @returns {Promise<any>} 响应数据（HEAD 请求返回 undefined）
   *
   * @throws {Error} code="auth_failed"  — 401 鉴权失败
   * @throws {Error} code="timeout"      — 请求超时
   * @throws {Error} code="network"      — 网络错误
   * @throws {Error} code="unknown"      — 其他错误
   */
  async _request(method, path, params = {}) {
    try {
      const response = await axios({
        method,
        url: `${this.baseUrl}${path}`,
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
        },
        params,
        timeout: 30000,
      });
      return response.data;
    } catch (error) {
      // 401 鉴权失败
      if (error.response && error.response.status === 401) {
        const err = new Error("Mantis API authentication failed (401)");
        err.code = "auth_failed";
        throw err;
      }

      // 超时
      if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
        const err = new Error("Mantis API request timed out");
        err.code = "timeout";
        throw err;
      }

      // 其他网络错误
      if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED" || error.code === "ERR_NETWORK") {
        const err = new Error(`Mantis API network error: ${error.message}`);
        err.code = "network";
        throw err;
      }

      // 服务端返回的其他 HTTP 错误
      if (error.response) {
        const err = new Error(
          `Mantis API returned ${error.response.status}: ${JSON.stringify(error.response.data)}`
        );
        err.code = "unknown";
        err.status = error.response.status;
        throw err;
      }

      // 兜底
      const err = new Error(`Mantis API unknown error: ${error.message}`);
      err.code = "unknown";
      throw err;
    }
  }

  /**
   * 获取 Mantis 项目列表
   *
   * @returns {Promise<Array<{id: *, name: *}>>} 项目列表
   */
  async fetchProjects() {
    const data = await this._request("GET", "/projects");
    // Mantis REST API 可能返回 { projects: [...] } 或直接返回数组
    const rawList = data && data.projects ? data.projects : data;
    if (!Array.isArray(rawList)) {
      return [];
    }
    return rawList.map((p) => ({
      id: p.id,
      name: p.name,
    }));
  }

  /**
   * 获取指定项目的故障（Issue）列表
   *
   * @param {number|string} projectId - Mantis 项目 ID
   * @returns {Promise<Array>} 原始 issue 数组
   */
  async fetchIssues(projectId) {
    const data = await this._request("GET", "/issues", { project_id: projectId });
    // 兼容 { issues: [...] } 和直接数组两种返回格式
    return data && data.issues ? data.issues : data || [];
  }

  /**
   * 测试 Mantis 连接是否可达
   *
   * 发送轻量 HEAD 请求验证服务连通性和 Token 有效性。
   *
   * @returns {Promise<boolean>} 连接成功返回 true
   * @throws {Error} 连接失败时抛出对应错误码的异常
   */
  async testConnection() {
    await this._request("HEAD", "/projects");
    return true;
  }
}

export default MantisAdapter;
