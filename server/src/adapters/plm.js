/**
 * PLMAdapter — 曙光 PLM (3DEXPERIENCE ENOVIA) 适配器
 * 每个实例绑定到单个用户的连接配置（server_url + cookie）。
 *
 * 实现参考：PLM数据抓取技术方案.md
 *  - 认证：CAS SSO → JSESSIONID + afs（cookie 由用户从浏览器复制）
 *  - 每个请求需携带 CSRF Token（从 emxUIConstantsJavaScriptInclude.jsp 提取）
 *  - 研发库房库存：GET sgDevelopmentWarehouse.jsp，返回 HTML 内含 JSON
 */

import axios from "axios";
import https from "https";

// 内网自签证书：跳过验证（仅内网集成场景，符合技术方案说明）
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

class PLMAdapter {
  constructor(conn) {
    this.baseUrl = (conn && conn.server_url) || "https://plm.sugon.com/3dspace";
    this.cookie = (conn && conn.cookie) || "";
    this._csrf = null; // { name, value }
  }

  _headers(extra = {}) {
    const h = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Accept: "*/*",
      "Accept-Language": "zh-CN,zh;q=0.9",
      Origin: "https://plm.sugon.com",
      charset: "UTF-8",
      Cookie: this.cookie,
      ...extra,
    };
    if (this._csrf) {
      h[this._csrf.name] = this._csrf.value;
    }
    return h;
  }

  async _req(fn) {
    try {
      return await fn();
    } catch (err) {
      if (err.code === "ECONNABORTED" || err.code === "ETIMEDOUT") err.code = "timeout";
      else if (["ENOTFOUND", "ECONNREFUSED", "ECONNRESET"].includes(err.code)) err.code = "network";
      else if (err.response && [401, 403].includes(err.response.status)) err.code = "auth_failed";
      else if (err.response && err.response.status >= 500) err.code = "plm_error";
      throw err;
    }
  }

  async _get(path, params = {}) {
    const qs = Object.entries(params)
      .filter(([, v]) => v != null && v !== "")
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");
    return this._req(async () => {
      const res = await axios.get(`${this.baseUrl}${path}${qs ? "?" + qs : ""}`, {
        headers: this._headers(),
        timeout: 30000,
        httpsAgent,
        decompress: true,
      });
      return res.data;
    });
  }

  // ── CSRF Token（每次适配器实例仅获取一次） ──────────────
  async _ensureCsrf() {
    if (this._csrf) return this._csrf;
    const js = await this._get("/common/emxUIConstantsJavaScriptInclude.jsp");
    const nameMatch = js.match(/CSRF_TOKEN_NAME\s*=\s*"(\w+)"/);
    const valueMatch = js.match(/CSRF_TOKEN_VALUE\s*=\s*"([^"]+)"/);
    if (!valueMatch) {
      const e = new Error("未能获取 PLM CSRF Token，Cookie 可能已失效");
      e.code = "auth_failed";
      throw e;
    }
    this._csrf = {
      name: nameMatch ? nameMatch[1] : "ENO_CSRF_TOKEN",
      value: valueMatch[1],
    };
    return this._csrf;
  }

  // ── 项目列表（用于项目自动关联）：GET 页面取 timeStamp → POST 取数据 ──
  async fetchProjects() {
    if (!this.cookie) {
      const e = new Error("未配置 PLM Cookie");
      e.code = "auth_failed";
      throw e;
    }
    await this._ensureCsrf();
    // Step 1: GET 页面，提取 timeStamp
    const pageHtml = await this._get("/common/emxIndentedTable.jsp", {
      program: "emxProjectSpace:getActiveProjects",
      table: "PMCProjectSpaceMyDesk",
      selection: "multiple",
      sortColumnName: "Name",
      sortDirection: "ascending",
      toolbar: "PMCProjectSummaryToolBar",
      freezePane: "Name",
      expandLevelFilter: "false",
      suiteKey: "ProgramCentral",
      SuiteDirectory: "programcentral",
    });
    const tsMatch = pageHtml.match(/var timeStamp\s*=\s*"(\d+)"/);
    if (!tsMatch) {
      const e = new Error("PLM 项目列表页未返回 timeStamp，可能未登录");
      e.code = "auth_failed";
      throw e;
    }
    const timeStamp = tsMatch[1];
    // Step 2: POST 数据接口（XML）
    const xml = await this._req(async () => {
      const res = await axios.post(
        `${this.baseUrl}/common/emxFreezePaneGetData.jsp`,
        new URLSearchParams({
          fpTimeStamp: timeStamp,
          objectId: "",
          firstTime: "true",
          toolbarData: "",
          IsStructureCompare: "",
        }).toString(),
        {
          headers: this._headers({
            "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          }),
          timeout: 30000,
          httpsAgent,
          decompress: true,
        }
      );
      return res.data;
    });
    return parseIndentedTable(xml);
  }

  // ── 研发库房库存：GET sgDevelopmentWarehouse.jsp，提取 JSON ──
  async fetchWarehouse(projectOid, treeLabel) {
    if (!this.cookie) {
      const e = new Error("未配置 PLM Cookie");
      e.code = "auth_failed";
      throw e;
    }
    await this._ensureCsrf();
    const params = {
      emxSuiteDirectory: "SugonCentral",
      treeLabel: treeLabel || "",
      suiteKey: "SugonCentral",
      StringResourceFileId: "emxSugonCentralStringResource",
      SuiteDirectory: "SugonCentral",
      objectId: projectOid,
    };
    const html = await this._get(
      "/SugonCentral/tableUI/tablefilter/sgDevelopmentWarehouse.jsp",
      params
    );
    return parseWarehouseJson(html);
  }

  async testConnection() {
    await this._ensureCsrf();
    return true;
  }
}

// 解析 EMX 缩进表格 XML → [{ oid, code, name }]
function parseIndentedTable(xml) {
  const cols = [];
  let m;
  const colRe = /<column name="([^"]+)"[^>]*>/g;
  while ((m = colRe.exec(xml))) cols.push(m[1]);
  const nameIdx = cols.findIndex((c) => c === "Name");
  const descIdx = cols.findIndex((c) => c === "Description");

  const decode = (s) =>
    (s || "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .trim();

  const rows = [];
  const rowRe = /<r o="([^"]+)">([\s\S]*?)<\/r>/g;
  while ((m = rowRe.exec(xml))) {
    const oid = m[1];
    const cells = [...m[2].matchAll(/<c>([\s\S]*?)<\/c>/g)].map((x) => decode(x[1]));
    rows.push({
      oid,
      code: decode(cells[nameIdx >= 0 ? nameIdx : 0]),
      name: decode(cells[descIdx >= 0 ? descIdx : 1]),
    });
  }
  return rows;
}

// 从研发库房页面 HTML 中提取库存 JSON 数组
function parseWarehouseJson(html) {
  const m = html.match(/var str\s*=\s*'([\s\S]*?)';/);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[1]);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export default PLMAdapter;
