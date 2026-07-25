// Forge PLM Bridge - 独立标签页查看器
// 与 popup 不同：本页面在独立 tab 中常驻，切到 PLM 页面操作也不会关闭。
const $ = (s) => document.querySelector(s);
const list = $('#list');
const filter = $('#filter');
const meta = $('#meta');
let timer = null;

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

const looksLikeBom = (u) => /bom|material|part|item|structure|ebom|mbom/i.test(u || '');

async function render() {
  let captured = [];
  try {
    const r = await chrome.runtime.sendMessage({ type: 'getCaptured' });
    captured = r.captured || [];
  } catch (e) {}
  const f = filter.value.toLowerCase();
  const shown = captured.filter((c) => !f || c.url.toLowerCase().includes(f));
  meta.textContent = `共 ${captured.length} 条捕获${f ? `，匹配 ${shown.length} 条` : ''} · ${new Date().toLocaleTimeString()}`;
  list.innerHTML = '';
  if (!captured.length) {
    list.innerHTML =
      '<div class="hint">暂无捕获。<br/>保持本标签页开着，切到 PLM 标签页打开 BOM/物料页面，这里会自动出现请求（每 1.5 秒刷新）。</div>';
    return;
  }
  if (!shown.length) {
    list.innerHTML = '<div class="hint">没有匹配过滤词的请求，试试清空过滤框。</div>';
    return;
  }
  shown.forEach((c) => {
    const full = {
      url: c.url,
      method: c.method,
      status: c.status,
      reqHeaders: c.reqHeaders || {},
      body: (c.body || '').slice(0, 100000),
    };
    const div = document.createElement('div');
    div.className = 'item';
    const tag = looksLikeBom(c.url) ? '<span class="tag">疑似 BOM/物料</span>' : '';
    div.innerHTML =
      `<div class="url">[${c.method}] ${c.url}${tag}</div>` +
      `<div class="sub">状态: ${c.status} · 响应长度: ${(c.body || '').length}</div>`;
    const ta = document.createElement('textarea');
    ta.readOnly = true;
    ta.value = (c.body || '').slice(0, 50000);
    div.appendChild(ta);
    const row = document.createElement('div');
    row.className = 'row';
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
    b3.className = 'primary';
    b3.textContent = '复制为JSON（推荐）';
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
timer = setInterval(render, 1500);
window.addEventListener('unload', () => clearInterval(timer));
