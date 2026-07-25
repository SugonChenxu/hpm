// plm-bridge/capture.js
// 用途：在【用户本机】一次性抓取 PLM 的 BOM/物料页面 HTML，供编写解析器参考。
// 注意：这不是正式集成（集成用 proxy + adapter）。本脚本仅用于获取响应样本。
//
// 用法：
//   1) 在 cookie.txt 首行粘贴你当前 PLM 登录的 cookie 字符串（从 DevTools 请求头里复制）
//   2) node capture.js <objectId>            # objectId 不填默认用样本里的
//   3) 可选：把任意 PLM 页面完整 URL 逐行写进 capture-urls.txt，会一并抓取
//
// 输出：captured/<name>.html（原始响应）+ captured/<name>.tables.txt（抽出的表格文本）

import fs from 'node:fs';
import path from 'node:path';

const BASE = 'https://plm.sugon.com/3dspace';
const OUT = path.join(process.cwd(), 'captured');
fs.mkdirSync(OUT, { recursive: true });

const objectId = process.argv[2] || '19520.49557.16852.46202';
const cookieFile = process.argv[3] || path.join(process.cwd(), 'cookie.txt');

const cookieLine = (() => {
  try {
    return fs.readFileSync(cookieFile, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean)[0] || '';
  } catch {
    return '';
  }
})();
if (!cookieLine) {
  console.error('✗ 未找到 cookie，请在 cookie.txt 首行粘贴 PLM 的 cookie 字符串');
  process.exit(1);
}

const referer = BASE + '/common/emxNavigator.jsp?collabSpace=GLOBAL';
const baseHeaders = {
  'accept-language': 'zh-CN,zh;q=0.9',
  'cookie': cookieLine,
  'Referer': referer,
};

const urls = new Map();
urls.set(
  'header',
  `${BASE}/common/emxExtendedPageHeaderAction.jsp?action=refreshHeader&objectId=${encodeURIComponent(
    objectId
  )}&documentDropRelationship=Reference%20Document&documentCommand=APPReferenceDocumentsTreeCategory&showStatesInHeader=&imageDropRelationship=&MCSURL=${encodeURIComponent(
    BASE
  )}&imageManagerToolbar=&imageUploadCommand=&_=${Date.now()}`
);
urls.set(
  'warehouse',
  `${BASE}/SugonCentral/tableUI/tablefilter/sgDevelopmentWarehouse.jsp?emxSuiteDirectory=SugonCentral&treeLabel=%E9%9D%92%E6%B5%B7&otherTollbarParams=&suiteKey=SugonCentral&StringResourceFileId=emxSugonCentralStringResource&SuiteDirectory=SugonCentral&objectId=${encodeURIComponent(
    objectId
  )}&widgetId=null`
);

// 额外 URL（用户自行从 DevTools 复制粘贴）
const extraFile = path.join(process.cwd(), 'capture-urls.txt');
if (fs.existsSync(extraFile)) {
  fs.readFileSync(extraFile, 'utf8')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((u, i) => urls.set('extra' + i, u));
}

function stripHtml(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTables(html) {
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) || [];
  return tables
    .map((t, ti) => {
      const rows = t.match(/<tr[\s\S]*?<\/tr>/gi) || [];
      const lines = rows
        .map((r) => {
          const cells = r.match(/<t[hd][\s\S]*?<\/t[hd]>/gi) || [];
          return cells.map((c) => stripHtml(c)).join(' | ');
        })
        .filter(Boolean);
      return `### TABLE ${ti} (${lines.length} rows)\n` + lines.join('\n');
    })
    .join('\n\n');
}

async function fetchOne(name, url) {
  console.log(`→ [${name}] ${url.slice(0, 100)}...`);
  try {
    const res = await fetch(url, {
      headers: { ...baseHeaders, accept: name === 'header' ? '*/*' : 'text/html,*/*' },
      redirect: 'manual',
    });
    const body = await res.text();
    const safe = name.replace(/[^a-z0-9]/gi, '_');
    fs.writeFileSync(path.join(OUT, `${safe}.html`), body);
    fs.writeFileSync(path.join(OUT, `${safe}.tables.txt`), extractTables(body));
    const isLoginPage =
      res.status === 401 ||
      res.status === 302 ||
      (body.toLowerCase().includes('login') && body.length < 8000);
    console.log(
      `  ✓ status=${res.status} bytes=${body.length} tables=${(body.match(/<table/gi) || []).length}` +
        (isLoginPage ? '\n  ⚠ 疑似登录失效（401/重定向/登录页），请重新登录并刷新 cookie.txt' : '')
    );
  } catch (e) {
    console.error(`  ✗ ${e.message}`);
  }
}

for (const [name, url] of urls) await fetchOne(name, url);
console.log(`\n完成。输出目录: ${OUT}`);
