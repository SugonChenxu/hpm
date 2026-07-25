import axios from "axios";
import https from "https";
import { readFileSync } from "fs";

const BASE = "https://plm.sugon.com/3dspace";
const agent = new https.Agent({ rejectUnauthorized: false });
const cookie = readFileSync("cookie.txt", "utf8").trim();

// 先拿 CSRF Token
console.log("=== 获取 CSRF ===");
const csrfRes = await axios.get(`${BASE}/common/emxUIConstantsJavaScriptInclude.jsp`, {
  headers: { Cookie: cookie }, httpsAgent: agent, timeout: 15000,
});
const js = csrfRes.data;
const nameMatch = js.match(/CSRF_TOKEN_NAME\s*=\s*"(\w+)"/);
const valueMatch = js.match(/CSRF_TOKEN_VALUE\s*=\s*"([^"]+)"/);
const csrfName = nameMatch ? nameMatch[1] : "ENO_CSRF_TOKEN";
const csrfValue = valueMatch ? valueMatch[1] : null;
if (!csrfValue) { console.log("CSRF 提取失败"); process.exit(1); }
console.log("CSRF OK:", csrfName, "=", csrfValue.substring(0, 10) + "...");

const H = {
  Cookie: cookie,
  "User-Agent": "Mozilla/5.0",
  csrfTokenName: csrfName,
  [csrfName]: csrfValue,
  Origin: "https://plm.sugon.com",
  charset: "UTF-8",
  Accept: "*/*",
};

// ── 尝试 1: 不加 program，只用 table ──
console.log("\n=== 尝试1: table=PMCProjectSpaceMyDesk (无 program 参数) ===");
let html = "";
try {
  const res = await axios.get(`${BASE}/common/emxIndentedTable.jsp`, {
    params: {
      table: "PMCProjectSpaceMyDesk",
      selection: "multiple",
      sortColumnName: "Name",
      sortDirection: "ascending",
      toolbar: "PMCProjectSummaryToolBar",
      freezePane: "Name",
      expandLevelFilter: "false",
      suiteKey: "ProgramCentral",
      SuiteDirectory: "programcentral",
    },
    headers: H, httpsAgent: agent, timeout: 15000,
  });
  html = res.data;
  const tsMatch = html.match(/var timeStamp\s*=\s*"(\d+)"/);
  if (tsMatch) {
    console.log("✅ timeStamp:", tsMatch[1]);
    const dataRes = await axios.post(`${BASE}/common/emxFreezePaneGetData.jsp`,
      new URLSearchParams({ fpTimeStamp: tsMatch[1], objectId: "", firstTime: "true", toolbarData: "", IsStructureCompare: "" }).toString(),
      { headers: { ...H, "content-type": "application/x-www-form-urlencoded; charset=UTF-8" }, httpsAgent: agent, timeout: 15000 }
    );
    const xml = dataRes.data;
    console.log("XML 长度:", xml.length);
    // 提取项目
    const cols = [...xml.matchAll(/<column name="([^"]+)"/g)].map(m => m[1]);
    console.log("列:", cols.join(", "));
    const rows = [...xml.matchAll(/<r o="([^"]+)">([\s\S]*?)<\/r>/g)];
    console.log("行数:", rows.length);
    rows.forEach((m, i) => {
      const oid = m[1];
      const cells = [...m[2].matchAll(/<c>([\s\S]*?)<\/c>/g)].map(x => (x[1]||"").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").trim());
      console.log(`  ${i + 1}. [${cells[0] || ""}] ${cells[1] || ""} (OID: ${oid})`);
    });
  } else {
    console.log("❌ 未找到 timeStamp，返回内容前300字符:");
    console.log(html.substring(0, 300));
  }
} catch (e) {
  console.log("❌", e.code, e.message?.substring(0, 200));
}

// ── 尝试 2: 加 program ──
console.log("\n=== 尝试2: 加 program=getActiveProjects ===");
try {
  const res = await axios.get(`${BASE}/common/emxIndentedTable.jsp`, {
    params: {
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
    },
    headers: H, httpsAgent: agent, timeout: 15000,
  });
  html = res.data;
  const tsMatch = html.match(/var timeStamp\s*=\s*"(\d+)"/);
  if (tsMatch) {
    console.log("✅ timeStamp:", tsMatch[1]);
    const dataRes = await axios.post(`${BASE}/common/emxFreezePaneGetData.jsp`,
      new URLSearchParams({ fpTimeStamp: tsMatch[1], objectId: "", firstTime: "true", toolbarData: "", IsStructureCompare: "" }).toString(),
      { headers: { ...H, "content-type": "application/x-www-form-urlencoded; charset=UTF-8" }, httpsAgent: agent, timeout: 15000 }
    );
    const xml = dataRes.data;
    console.log("XML 长度:", xml.length);
    const rows = [...xml.matchAll(/<r o="([^"]+)">([\s\S]*?)<\/r>/g)];
    console.log("行数:", rows.length);
    rows.forEach((m, i) => {
      const oid = m[1];
      const cells = [...m[2].matchAll(/<c>([\s\S]*?)<\/c>/g)].map(x => (x[1]||"").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").trim());
      console.log(`  ${i + 1}. [${cells[0] || ""}] ${cells[1] || ""} (OID: ${oid})`);
    });
  } else {
    console.log("❌ 未找到 timeStamp");
    console.log(html.substring(0, 300));
  }
} catch (e) {
  console.log("❌", e.code, e.message?.substring(0, 200));
}
