// Forge PLM Bridge - 后台 service worker
// 职责：1) 读取 PLM 的 httpOnly cookie 并推送给本地代理
//      2) 接收 content script 捕获到的请求样本，存到本地存储（防 SW 回收丢数据）并上报代理

const PROXY = 'http://127.0.0.1:8770';
const COOKIE_DOMAIN = 'sugon.com'; // 捕获所有 sugon.com 域 cookie（含 .sugon.com 与子域）

// 读取 PLM 所有 cookie 并推送
async function pushCookies() {
  try {
    const cookies = await chrome.cookies.getAll({ domain: COOKIE_DOMAIN });
    const header = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const res = await fetch(`${PROXY}/ingest-cookie`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie: header, domain: COOKIE_DOMAIN, at: Date.now() }),
    });
    return { ok: res.ok, count: cookies.length };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// cookie 变化（登录/续期）自动重推
chrome.cookies.onChanged.addListener((info) => {
  if (info.cookie.domain.includes('sugon.com')) pushCookies();
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'capture') {
    const item = { ...msg.data, ts: Date.now() };
    chrome.storage.local.get({ captured: [] }, (store) => {
      const list = store.captured || [];
      list.unshift(item);
      chrome.storage.local.set({ captured: list.slice(0, 60) });
    });
    // 疑似 BOM/物料的接口样本上报代理，方便后续分析
    if (item.url && /bom|material|part|item|structure|ebom|mbom/i.test(item.url)) {
      fetch(`${PROXY}/capture-sample`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      }).catch(() => {});
    }
  }
  if (msg.type === 'pushCookies') {
    pushCookies().then(sendResponse);
    return true; // 异步返回
  }
  if (msg.type === 'getCaptured') {
    chrome.storage.local.get({ captured: [] }, (store) =>
      sendResponse({ captured: store.captured || [] })
    );
    return true;
  }
  if (msg.type === 'clearCaptured') {
    chrome.storage.local.set({ captured: [] }, () => sendResponse({ ok: true }));
    return true;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  pushCookies();
});
