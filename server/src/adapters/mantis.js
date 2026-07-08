/**
 * MantisAdapter — 定制化 Mantis SSO API 适配器
 */

import db from "../db.js";
import axios from "axios";

class MantisAdapter {
  constructor() {
    const conn = db.prepare("SELECT server_url, api_token FROM mantis_connection LIMIT 1").get();
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

  async _get(path, params = {}) {
    const qs = Object.entries(params).filter(([,v]) => v != null).map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
    const res = await axios.get(`${this.baseUrl}${path}${qs ? "?" + qs : ""}`, {
      headers: this._headers(), timeout: 30000, decompress: true,
    });
    return res.data;
  }

  async _post(path, data = {}) {
    const res = await axios.post(`${this.baseUrl}${path}`,
      new URLSearchParams(data).toString(),
      { headers: { ...this._headers(), "content-type": "application/x-www-form-urlencoded; charset=UTF-8" }, timeout: 30000, decompress: true }
    );
    return res.data;
  }

  /** 拉取全量项目列表，标记最近使用的 8 个 */
  async fetchProjects() {
    if (!this.cookie) { const e = new Error("未配置 Mantis cookie"); e.code = "auth_failed"; throw e; }
    const data = await this._post("/projects", { action: "view_project_collection", proj_id_arr: "[]" });
    const all = (data?.data?.simple_filters?.projects || []).map(p => ({ id: p.id, name: p.name }));
    const keywords = ["5000售后二线","马泉河","干将_909","勒拿河","数创冷板","常规问题","京能","海南岛"];
    return all.filter(p => keywords.some(k => p.name.includes(k)));
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
    return series.data.map((di, i) => ({ date: categories[i] || `W${i+1}`, di })).filter(d => d.di > 0);
  }

  /** 分类统计 — 从"基本统计" index 2 获取真实条数 */
  async fetchCategoryStats(projectId) {
    const data = await this._get("/analysis/", {
      action: "get_analysis_data", view_name: "基本统计", index: 2,
      proj_id_arr: JSON.stringify([projectId]), ignore_privileged_projects: "yes",
    });
    const rows = data?.data?.[0]?.data?.data || [];
    return rows.filter(r => r.total > 0).map(r => ({ category: r.category, count: r.total }));
  }

  /** 分类 DI 加权值 — 从"Defect Index" index 1 获取（用于柱状图） */
  async fetchCategoryDIStats(projectId) {
    const data = await this._get("/analysis/", {
      action: "get_analysis_data", view_name: "Defect Index", index: 1,
      proj_id_arr: JSON.stringify([projectId]), ignore_privileged_projects: "yes",
    });
    const rows = data?.data?.[0]?.data?.data || [];
    return rows.filter(r => r.all_status > 0).map(r => ({ category: r.category, count: r.all_status }));
  }

  /** 全局摘要 — 从"基本统计"view 获取 */
  async fetchSummary(projectId) {
    const data = await this._get("/analysis/", {
      action: "get_analysis_data", view_name: "基本统计", index: 0,
      proj_id_arr: JSON.stringify([projectId]), ignore_privileged_projects: "yes",
    });
    const rows = data?.data?.[0]?.data?.data || [];
    // 只取父项目（第一行）
    const parent = rows[0] || {};
    const total = parent.total || 0;
    const rate = parseFloat(parent.resolved_pct) || 0;
    const resolved = Math.round(total * rate / 100);
    const trend = await this.fetchDITrend(projectId);
    const di = trend.length > 0 ? Math.round(trend[trend.length - 1].di * 100) / 100 : 0;
    return { total, resolved, rate, di };
  }

  /** 周报文本 */
  async fetchReport(projectId) {
    const diCats = await this.fetchCategoryDIStats(projectId);
    const s = await this.fetchSummary(projectId);
    const diList = diCats.filter(c => c.count > 0)
      .sort((a, b) => b.count - a.count)
      .map(c => `${c.category}-${Math.round(c.count * 100) / 100}`).join("、");
    return `当前项目DI=${s.di}，BUG=${s.total}条，已解决=${s.resolved}条，解决率=${s.rate}%\n\n各模块DI值分布：${diList}`;
  }

  async testConnection() { await this._get("/analysis/"); return true; }
}

export default MantisAdapter;
