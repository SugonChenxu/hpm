// Forge PLM Bridge - popup 逻辑
const $ = (s) => document.querySelector(s);
const list = $('#list');
const filter = $('#filter');
let timer = null;

// 复制文本：优先 Clipboard API，失败回退 execCommand
function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve, reject) => {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      resolve();
    } catch (e) {
      reject(e);
    }
  });
}

function flash(btn, text) {
  const old = btn.textContent;
  btn.textContent = text;
  setTimeout(() => (btn.textContent = old), 1200);
}

async function render() {
  let captured = [];
  try {
    const r = await chrome.runtime.sendMessage({ type: 'getCaptured' });
    captured = r.captured || [];
  } catch (e) {}
  const f = filter.value.toLowerCase();
  list.innerHTML = '';
  if (!captured.length) {
    list.innerHTML =
      '<div class="hint">暂无捕获。请在此弹窗打开状态下，到 PLM 页面打开 BOM/物料页（列表会自动刷新）。</div>';
    return;
  }
  captured.forEach((c) => {
    if (f && !c.url.toLowerCase().includes(f)) return;
    const full = {
      url: c.url,
      method: c.method,
      status: c.status,
      reqHeaders: c.reqHeaders || {},
      body: (c.body || '').slice(0, 50000),
    };
    const div = document.createElement('div');
    div.className = 'item';
    div.innerHTML = `<div class="url">[${c.method}] ${c.url}</div><div>状态: ${c.status}</div>`;
    const ta = document.createElement('textarea');
    ta.readOnly = true;
    ta.value = (c.body || '').slice(0, 20000);
    div.appendChild(ta);
    const row = document.createElement('div');
    const b1 = document.createElement('button');
    b1.textContent = '复制响应';
    b1.onclick = () => copyText(ta.value).then(() => flash(b1, '已复制 ✓')).catch(() => flash(b1, '复制失败'));
    const b2 = document.createElement('button');
    b2.textContent = '复制请求头';
    b2.onclick = () =>
      copyText(JSON.stringify(c.reqHeaders || {}, null, 2))
        .then(() => flash(b2, '已复制 ✓'))
        .catch(() => flash(b2, '复制失败'));
    const b3 = document.createElement('button');
    b3.textContent = '复制为JSON';
    b3.onclick = () =>
      copyText(JSON.stringify(full, null, 2))
        .then(() => flash(b3, '已复制 ✓'))
        .catch(() => flash(b3, '复制失败'));
    row.appendChild(b1);
    row.appendChild(b2);
    row.appendChild(b3);
    div.appendChild(row);
    list.appendChild(div);
  });
}

$('#openViewer').onclick = () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('viewer.html') });
  window.close();
};
$('#push').onclick = async () => {
  const r = await chrome.runtime.sendMessage({ type: 'pushCookies' });
  $('#status').textContent = r.ok ? `已推送 ${r.count} 个 cookie` : `失败: ${r.error || '代理未启动?'}`;
};
$('#refresh').onclick = render;
$('#clear').onclick = async () => {
  await chrome.runtime.sendMessage({ type: 'clearCaptured' });
  render();
};
filter.oninput = render;

render();
// 自动轮询，捕获到达后实时显示
timer = setInterval(render, 1500);
window.addEventListener('unload', () => clearInterval(timer));
