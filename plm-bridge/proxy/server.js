// Forge PLM Bridge - 本地代理
// 运行在用户办公机（与 Forge 同源同网）。职责：
//   1) 接收浏览器扩展推送的 PLM 会话 cookie（/ingest-cookie）
//   2) 转发对 PLM REST 的调用（GET /plm?path=... 或 POST /plm 带完整请求），携带该 cookie
//   3) 检测 cookie 失效（被重定向到登录页）→ 返回 expired，提示用户重新登录 PLM
//   4) 接收扩展捕获的接口样本（/capture-sample），便于后续分析
//
// 注意：本代理只监听 127.0.0.1，不暴露到网络。Forge 后续通过它访问 PLM，避免 CORS / 凭证问题。

import http from 'node:http';

const PORT = 8770;
const PLM_ORIGIN = 'https://plm.sugon.com';
const LOGIN_MARKERS = ['/login', 'auth', 'saml', 'oauth', 'cas', 'signin'];

let state = { cookie: '', domain: '', at: 0 };
let samples = [];

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => resolve(b));
  });
}

async function proxyFetch(spec) {
  const full = (spec.url || '').startsWith('http')
    ? spec.url
    : PLM_ORIGIN + (spec.url.startsWith('/') ? spec.url : '/' + spec.url);
  const headers = Object.assign({ Cookie: state.cookie }, spec.headers || {});
  const r = await fetch(full, {
    method: spec.method || 'GET',
    redirect: 'manual',
    headers,
    body: spec.body,
  });
  // 被重定向到登录页 => cookie 失效
  if (r.status === 301 || r.status === 302) {
    const loc = r.headers.get('location') || '';
    if (LOGIN_MARKERS.some((m) => loc.toLowerCase().includes(m))) {
      return { expired: true, redirect: loc, status: r.status };
    }
    return { redirect: loc, status: r.status };
  }
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) {}
  return { ok: r.ok, status: r.status, json: json == null ? text : json };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (req.method === 'POST' && url.pathname === '/ingest-cookie') {
    const b = await readBody(req);
    try {
      const d = JSON.parse(b);
      state = { cookie: d.cookie || '', domain: d.domain || '', at: Date.now() };
      return send(res, 200, { ok: true, cookieLen: state.cookie.length });
    } catch (e) {
      return send(res, 400, { ok: false, error: String(e) });
    }
  }

  if (req.method === 'POST' && url.pathname === '/capture-sample') {
    const b = await readBody(req);
    try {
      samples.unshift(JSON.parse(b));
      samples = samples.slice(0, 50);
    } catch (e) {}
    return send(res, 200, { ok: true });
  }

  if (req.method === 'GET' && url.pathname === '/status') {
    return send(res, 200, {
      hasCookie: !!state.cookie,
      ingestedAt: state.at ? new Date(state.at).toISOString() : null,
      ageSec: state.at ? Math.round((Date.now() - state.at) / 1000) : null,
    });
  }

  // GET 快速拉取：/plm?path=<相对或完整 URL>&securityContext=GLOBAL
  if (req.method === 'GET' && url.pathname === '/plm') {
    const target = url.searchParams.get('path') || '';
    if (!target) return send(res, 400, { ok: false, error: 'missing path' });
    if (!state.cookie)
      return send(res, 401, { ok: false, error: 'no cookie, please push from extension' });
    const result = await proxyFetch({
      url: target,
      method: 'GET',
      headers: {
        Accept: 'application/json',
        SecurityContext: url.searchParams.get('securityContext') || 'GLOBAL',
        'Cache-Control': 'no-cache',
      },
    });
    if (result.expired) return send(res, 401, { ok: false, expired: true, redirect: result.redirect, error: 'cookie expired, please re-login to PLM and re-push' });
    return send(res, result.status || 200, result);
  }

  // POST 精确重放：/plm  body={url, method, headers, body}
  if (req.method === 'POST' && url.pathname === '/plm') {
    const b = await readBody(req);
    let spec;
    try { spec = JSON.parse(b); } catch (e) {
      return send(res, 400, { ok: false, error: 'bad json' });
    }
    if (!state.cookie) return send(res, 401, { ok: false, error: 'no cookie' });
    const result = await proxyFetch(spec);
    if (result.expired) return send(res, 401, { ok: false, expired: true });
    return send(res, result.status || 200, result);
  }

  send(res, 404, { ok: false, error: 'not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[forge-plm-bridge] proxy listening on http://127.0.0.1:${PORT}`);
});
