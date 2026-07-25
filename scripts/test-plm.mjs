/**
 * test-plm.js — PLM 库存适配器本地验证脚本
 * 
 * 用法（在你的本机终端，必须能连 plm.sugon.com）：
 *   cd D:\HPM\server
 *   set PLM_COOKIE=你的完整Cookie字符串（从浏览器 DevTools 复制）
 *   node ..\scripts\test-plm.js
 * 
 * 或直接写入 cookie.txt 首行后运行：
 *   echo 你的Cookie > cookie.txt
 *   node ..\scripts\test-plm.js
 * 
 * 测试顺序：
 *   1. CSRF Token 获取
 *   2. PLM 项目列表
 *   3. 指定项目的研发库房库存（默认用海光4号台式机 OID=19520.49557.16852.46202, treeLabel=青海）
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── 读取 Cookie ──────────────────────────────────
let cookie = process.env.PLM_COOKIE || "";
if (!cookie) {
  try {
    cookie = readFileSync(resolve(__dirname, "..", "server", "cookie.txt"), "utf8").trim().split("\n")[0] || "";
  } catch {}
}
if (!cookie) {
  console.log("❌ 未提供 PLM Cookie。请设置环境变量 PLM_COOKIE 或写入 server/cookie.txt 首行");
  console.log("   获取方式：浏览器登录 PLM → F12 → Network → 任意请求 → Headers → Cookie → 复制值");
  process.exit(1);
}
console.log("✅ Cookie 长度:", cookie.length, (cookie.length > 20 ? "（有效）" : "（过短，可能不完整）"));

// ── 动态加载适配器（绕过顶层 httpsAgent 导入时可能的问题） ──
const adapterPath = resolve(__dirname, "..", "server", "src", "adapters", "plm.js");
const { default: PLMAdapter } = await import("file://" + adapterPath);

const conn = {
  server_url: "https://plm.sugon.com/3dspace",
  cookie: cookie,
};
const adapter = new PLMAdapter(conn);

// ── 1. CSRF Token ───────────────────────────────
async function step1() {
  console.log("\n🔑 [1/3] 获取 CSRF Token ...");
  try {
    await adapter._ensureCsrf();
    console.log("   ✅ CSRF Token:", adapter._csrf.name, "=", adapter._csrf.value.substring(0, 16) + "...");
    return true;
  } catch (e) {
    console.log("   ❌ 失败:", e.message);
    console.log("   → 可能原因：Cookie 过期/不完整，或网络不通");
    return false;
  }
}

// ── 2. 项目列表 ─────────────────────────────────
async function step2() {
  console.log("\n📋 [2/3] 拉取 PLM 项目列表 ...");
  try {
    const projects = await adapter.fetchProjects();
    console.log("   ✅ 获取到", projects.length, "个项目");
    projects.slice(0, 10).forEach((p, i) => {
      console.log(`      ${i + 1}. [${p.code}] ${p.name}  (OID: ${p.oid})`);
    });
    if (projects.length > 10) console.log(`      ... 共 ${projects.length} 个`);
    return projects;
  } catch (e) {
    console.log("   ❌ 失败:", e.message);
    console.log("   → 可能原因：CSRF 未成功，或 Cookie 权限不足");
    return null;
  }
}

// ── 3. 研发库房库存 ─────────────────────────────
async function step3() {
  // 用方案中的已知 OID 做默认测试
  const TEST_OID = "19520.49557.16852.46202"; // 海光4号台式机新品研发
  const TEST_LABEL = "青海";
  console.log(`\n📦 [3/3] 拉取库存 (OID=${TEST_OID}, treeLabel=${TEST_LABEL}) ...`);
  try {
    const rows = await adapter.fetchWarehouse(TEST_OID, TEST_LABEL);
    if (!rows || rows.length === 0) {
      console.log("   ⚠️  返回空数组 — 可能该仓库无库存数据，或 treeLabel 不对");
      console.log("   → 尝试在浏览器中确认 PLM → 该项目 → 左侧「研发库房」下的仓库名是否为「", TEST_LABEL, "」");
      return null;
    }
    console.log("   ✅ 获取到", rows.length, "条库存记录\n");
    // 表头
    const fields = ["MATNR", "MAKTX", "LABST", "WERKS", "LGORT", "LGOBE", "STPRS", "MATKL", "WGBEZ"];
    console.log("   " + fields.map((f) => f.padEnd(18)).join(""));
    console.log("   " + "-".repeat(150));
    rows.slice(0, 15).forEach((r) => {
      const line = fields.map((f) => String(r[f] || "").substring(0, 17).padEnd(18)).join("");
      console.log("   " + line);
    });
    if (rows.length > 15) console.log("   ... 共 " + rows.length + " 条");
    return rows;
  } catch (e) {
    console.log("   ❌ 失败:", e.message);
    return null;
  }
}

// ── 主流程 ──────────────────────────────────────
async function main() {
  console.log("═══ PLM 库存适配器验证测试 ═══");
  console.log("BASE:", conn.server_url);

  const ok1 = await step1();
  if (!ok1) { console.log("\n⛔ CSRF 获取失败，停止测试"); process.exit(1); }

  const projects = await step2();
  // 即使项目列表失败，也尝试库存（手动指定 OID）

  const inventory = await step3();

  console.log("\n═══ 测试完成 ═══");
  if (inventory && inventory.length > 0) {
    console.log("✅ 链路通畅！库存数据可正常拉取。");
    console.log("   接下来在 Forge → 库存管理中：填 Cookie → 关联项目 → 填仓库名 → 同步库存。");
  } else {
    console.log("⚠️  库存拉取返回空，请核对：");
    console.log("   1. 浏览器 PLM 中该项目的「研发库房」下仓库名是否为「青海」");
    console.log("   2. 如果仓库名不同（如 北京/天津），请重新运行并指定：");
    console.log("      node scripts/test-plm.js 青海");
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
