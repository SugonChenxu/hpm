/**
 * MantisAdapter — 定制化 Mantis SSO API 适配器
 * 每个实例绑定到单个用户的连接配置（server_url + cookie）。
 */

import db from "../db.js";
import axios from "axios";

class MantisAdapter {
  constructor(conn) {
    this.baseUrl = (conn && conn.server_url) || "https://mantis.sugon.com";
    this.cookie = (conn && conn.api_token) || "";
  }

  _headers() {
    return {
      Cookie: this.cookie,
      "x-requested-with": "XMLHttpRequest",
      Accept: "application/json, text/javascript, */*; q=0.01",
    };
  }

  // 统一包裹请求，把 axios/网络错误归一化为 Mantis 错误码
  async _req(fn) {
    try {
      return await fn();
    } catch (err) {
      if (err.code === "ECONNABORTED") err.code = "timeout";
      else if (["ENOTFOUND", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT"].includes(err.code)) err.code = "network";
      else if (err.response && [401, 403].includes(err.response.status)) err.code = "auth_failed";
      throw err;
    }
  }

  async _get(path, params = {}) {
    const qs = Object.entries(params).filter(([, v]) => v != null)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
    return this._req(async () => {
      const res = await axios.get(`${this.baseUrl}${path}${qs ? "?" + qs : ""}`, {
        headers: this._headers(), timeout: 30000, decompress: true,
      });
      return res.data;
    });
  }

  async _post(path, data = {}) {
    return this._req(async () => {
      const res = await axios.post(`${this.baseUrl}${path}`,
        new URLSearchParams(data).toString(),
        {
          headers: { ...this._headers(), "content-type": "application/x-www-form-urlencoded; charset=UTF-8" },
          timeout: 30000, decompress: true,
        }
      );
      return res.data;
    });
  }

  /** 拉取全部 Mantis 项目（用于项目映射与下拉选择，不限定关键字） */
  async fetchProjects() {
    if (!this.cookie) { const e = new Error("未配置 Mantis cookie"); e.code = "auth_failed"; throw e; }
    const data = await this._post("/projects", { action: "view_project_collection", proj_id_arr: "[]" });
    return (data?.data?.simple_filters?.projects || []).map((p) => ({ id: p.id, name: p.name }));
  }

  /**
   * 拉取当前用户「最近使用的项目」（Sugon 定制接口）。
   * 真实端点：GET /projects?action=get_recent_projects
   * 响应结构：{ data: [ { id, projects: [{ id, name }, ...] }, ... ] }
   * 每个集合通常含 1 个项目，这里扁平化并去重，返回 [{ id, name }]。
   */
  async fetchRecentProjects() {
    if (!this.cookie) { const e = new Error("未配置 Mantis cookie"); e.code = "auth_failed"; throw e; }
    const data = await this._get("/projects", { action: "get_recent_projects" });
    const collections = data?.data || [];
    const map = new Map();
    for (const col of collections) {
      for (const p of (col.projects || [])) {
        if (p?.id && !map.has(p.id)) map.set(p.id, { id: p.id, name: p.name || p.id });
      }
    }
    return [...map.values()];
  }

  /** DI 趋势：index 0 的时序数据 */
  async fetchDITrend(projectId) {
    const data = await this._get("/analysis/", {
      action: "get_analysis_data", view_name: "Defect Index", index: 0,
      proj_id_arr: JSON.stringify([projectId]), ignore_privileged_projects: "yes",
    });
    const series = data?.data?.[0]?.data?.series?.[0];
    const categories = data?.data?.[0]?.data?.xaxis?.categories || [];
    if (!series) return [];
    return series.data.map((di, i) => ({ date: categories[i] || `W${i + 1}`, di })).filter((d) => d.di > 0);
  }

  /** 分类统计 — 从"基本统计" index 2 获取真实条数 */
  async fetchCategoryStats(projectId) {
    const data = await this._get("/analysis/", {
      action: "get_analysis_data", view_name: "基本统计", index: 2,
      proj_id_arr: JSON.stringify([projectId]), ignore_privileged_projects: "yes",
    });
    const rows = data?.data?.[0]?.data?.data || [];
    return rows.filter((r) => r.total > 0).map((r) => ({ category: r.category, count: r.total }));
  }

  /**
   * 未解决分类分布 — 基于真实缺陷列表，过滤 status != 已解决，按 category 数组分组计数。
   * 与 fetchCategoryStats（全部问题）不同，这里只统计未解决问题，用于项目概览饼图。
   */
  async fetchUnresolvedCategoryStats(projectId) {
    const issues = await this.fetchIssues(projectId);
    const counts = {};
    for (const i of issues) {
      if ((i.status || "") === "已解决") continue;
      let cats = i.category;
      if (!Array.isArray(cats)) cats = cats ? [cats] : [];
      if (cats.length === 0) cats = ["其他"];
      for (const c of cats) counts[c] = (counts[c] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([category, count]) => ({ category, count }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count);
  }

  /** 分类 DI 加权值 — 从"Defect Index" index 1 获取（用于柱状图） */
  async fetchCategoryDIStats(projectId) {
    const data = await this._get("/analysis/", {
      action: "get_analysis_data", view_name: "Defect Index", index: 1,
      proj_id_arr: JSON.stringify([projectId]), ignore_privileged_projects: "yes",
    });
    const rows = data?.data?.[0]?.data?.data || [];
    return rows.filter((r) => r.all_status > 0).map((r) => ({ category: r.category, count: r.all_status }));
  }

  /**
   * 全局摘要。
   * 注意：Sugon Mantis 的「基本统计」汇总行（index 0）对"集合/父项目"入口返回空，
   * 而缺陷实际挂在子项目下，导致 total/解决率 算成 0 与缺陷列表（真实条数）矛盾。
   * 因此 total/resolved/rate 一律基于 fetchIssues 真实返回的缺陷自算（集合/子项目入口一致），
   * DI 仍取自分析接口的 DI 趋势（该接口对集合入口有效）。
   */
  async fetchSummary(projectId) {
    const issues = await this.fetchIssues(projectId);
    const total = issues.length;
    const resolved = issues.filter((i) => (i.status || "") === "已解决").length;
    const rate = total > 0 ? Math.round((resolved / total) * 10000) / 100 : 0;
    const trend = await this.fetchDITrend(projectId);
    const di = trend.length > 0 ? Math.round(trend[trend.length - 1].di * 100) / 100 : 0;
    return { total, resolved, rate, di };
  }

  /** 周报文本 */
  async fetchReport(projectId) {
    const diCats = await this.fetchCategoryDIStats(projectId);
    const s = await this.fetchSummary(projectId);
    const diList = diCats.filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count)
      .map((c) => `${c.category}-${Math.round(c.count * 100) / 100}`).join("、");
    return `当前项目DI=${s.di}，BUG=${s.total}条，已解决=${s.resolved}条，解决率=${s.rate}%\n\n各模块DI值分布：${diList}`;
  }

  /** 拉取全部 Mantis 项目（用于项目映射，不限定关键字） */
  async fetchAllProjects() {
    if (!this.cookie) { const e = new Error("未配置 Mantis cookie"); e.code = "auth_failed"; throw e; }
    const data = await this._post("/projects", { action: "view_project_collection", proj_id_arr: "[]" });
    return (data?.data?.simple_filters?.projects || []).map((p) => ({ id: p.id, name: p.name }));
  }

  /**
   * 拉取指定 Mantis 项目的缺陷列表（SSO 定制接口 POST /my/views）
   * @param {string} mantisProjectId - Mantis 项目 hex id
   * @returns {Promise<Array>} issue 数组（原始结构，含 issue_id/summary/severity/status/handler/di_value 等）
   */
  async fetchIssues(mantisProjectId) {
    if (!this.cookie) { const e = new Error("未配置 Mantis cookie"); e.code = "auth_failed"; throw e; }
    if (!mantisProjectId) throw new Error("mantisProjectId 必填");
    const all = [];
    let page = 1;
    const size = 200;
    const sorters = JSON.stringify([
      { dir: "desc", field: "update_ts" },
      { dir: "desc", field: "report_ts" },
      { dir: "desc", field: "issue_id" },
    ]);
    while (true) {
      const payload = JSON.stringify({
        index_tab: "issue_list",
        view_name: "",
        proj_id_arr: [mantisProjectId],
        filters: [],
        temp_filter_id: null,
        ignore_privileged_projects: true,
        enabled_projects_only: true,
      });
      const form = {
        action: "get_view_issues",
        payload,
        sorters,
        page: String(page),
        size: String(size),
        "sort[0][field]": "update_ts", "sort[0][dir]": "desc",
        "sort[1][field]": "report_ts", "sort[1][dir]": "desc",
        "sort[2][field]": "issue_id", "sort[2][dir]": "desc",
      };
      const data = await this._post("/my/views", form);
      const rows = data?.data?.data || [];
      all.push(...rows);
      const lastPage = data?.data?.last_page || 1;
      if (page >= lastPage || rows.length === 0) break;
      page++;
    }
    return all;
  }

  async testConnection() { await this._get("/analysis/"); return true; }
}

export default MantisAdapter;
