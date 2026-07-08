/**
 * MantisAdapter — 定制化 Mantis SSO API 适配器
 *
 * 对接曙光内部定制版问题跟踪系统（Flask SSO + 自研 API），
 * 通过 session cookie 鉴权，拉取项目列表、DI 趋势、缺陷分类等数据。
 */

import db from "../db.js";
import axios from "axios";

class MantisAdapter {
  constructor() {
    const conn = db.prepare("SELECT server_url, api_token FROM mantis_connection LIMIT 1").get();
    this.baseUrl = (conn && conn.server_url) || "https://mantis.sugon.com";
    this.cookie = (conn && conn.api_token) || ""; // api_token 字段实际存 session cookie
  }

  /** 构建带 cookie 和必要 headers 的请求 */
  _headers() {
    return {
      Cookie: this.cookie,
      "x-requested-with": "XMLHttpRequest",
      Accept: "application/json, text/javascript, */*; q=0.01",
    };
  }

  async _get(path, params = {}) {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");
    const url = `${this.baseUrl}${path}${qs ? "?" + qs : ""}`;
    const res = await axios.get(url, {
      headers: this._headers(),
      timeout: 30000,
      decompress: true,
    });
    return res.data;
  }

  async _post(path, data = {}) {
    const res = await axios.post(`${this.baseUrl}${path}`,
      new URLSearchParams(data).toString(),
      {
        headers: { ...this._headers(), "content-type": "application/x-www-form-urlencoded; charset=UTF-8" },
        timeout: 30000,
        decompress: true,
      }
    );
    return res.data;
  }

  /**
   * 拉取项目列表（当前用户可见的所有项目）
   * 通过调用已知项目的 detail 接口，从 all_proj_id 中提取全部项目
   */
  async fetchProjects() {
    if (!this.cookie) {
      const e = new Error("未配置 Mantis session cookie");
      e.code = "auth_failed";
      throw e;
    }

    try {
      // 用已知项目 ID 拉取详情，获取 all_proj_id
      const detail = await this.fetchProjectDetail("695a1917425fc624d2eb6927");
      // all_proj_id 在 fetchProjectDetail 内部不可见，需要直接调用
      const data = await this._post("/projects", {
        action: "view_project_collection",
        proj_id_arr: JSON.stringify(["695a1917425fc624d2eb6927"]),
      });
      const allIds = data?.data?.all_proj_id || [];
      // 从 simple_filters.projects 获取名称
      const projects = (data?.data?.simple_filters?.projects || [])
        .filter(p => allIds.includes(p.id) || p.class_name === "level-1")
        .map(p => ({ id: p.id, name: p.name }));
      return projects;
    } catch (e) {
      if (e.response?.status === 401) { const err = new Error("鉴权失败"); err.code = "auth_failed"; throw err; }
      throw e;
    }
  }

  /**
   * 获取指定项目的详细信息和子项目列表
   * @param {string} projectId
   * @returns {Promise<object>} { name, projects:[], categories:[], statuses:[] }
   */
  async fetchProjectDetail(projectId) {
    const data = await this._post("/projects", {
      action: "view_project_collection",
      proj_id_arr: JSON.stringify([projectId]),
    });
    const d = data?.data || {};
    return {
      id: projectId,
      name: d.name || "",
      projects: (d.simple_filters?.projects || []).map(p => ({ id: p.id, name: p.name })),
      categories: (d.simple_filters?.categories || []).filter(c => c.name !== "全部分类").map(c => c.name),
      statuses: (d.simple_filters?.statuses || []).map(s => s.name),
    };
  }

  /**
   * 拉取 DI 趋势时序数据
   * @param {string} projectId
   * @returns {Promise<Array<{date, di}>>}
   */
  async fetchDITrend(projectId) {
    const allData = [];
    for (let i = 0; i <= 5; i++) {
      const data = await this._get("/analysis/", {
        action: "get_analysis_data",
        view_name: "Defect Index",
        index: i,
        proj_id_arr: JSON.stringify([projectId]),
        ignore_privileged_projects: "yes",
      });
      if (data?.data?.[0]?.data?.series?.[0]) {
        const series = data.data[0].data.series[0];
        const categories = data.data[0].data.xaxis?.categories || [];
        allData.push(...series.data.map((di, idx) => ({
          date: categories[idx] || `W${idx + 1}`,
          di,
        })).filter(d => d.di > 0));
      }
    }
    return allData;
  }

  /**
   * 拉取缺陷分类统计
   * @param {string} projectId
   * @returns {Promise<Array<{category, count}>>}
   */
  async fetchCategoryStats(projectId) {
    const detail = await this.fetchProjectDetail(projectId);
    // 从分析页获取分类数据
    const data = await this._get("/analysis/", {
      action: "get_analysis_data",
      view_name: "Defect Index",
      index: 1,
      proj_id_arr: JSON.stringify([projectId]),
      ignore_privileged_projects: "yes",
    });
    // 解析 category 数据
    const charts = data?.data || [];
    const stats = [];
    for (const chart of charts) {
      if (chart.type === "chart" && chart.data?.series) {
        for (const s of chart.data.series) {
          stats.push({ category: s.name, count: s.data.reduce((a, b) => a + b, 0) });
        }
      }
    }
    return stats.length > 0 ? stats : detail.categories.map(c => ({ category: c, count: 0 }));
  }

  /** 测试连接 */
  async testConnection() {
    await this._get("/analysis/");
    return true;
  }
}

export default MantisAdapter;
