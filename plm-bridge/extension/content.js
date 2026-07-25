// Forge PLM Bridge - content script（隔离世界桥接）
// 职责：接收 inject.js（MAIN world）通过 window.postMessage 发来的捕获数据，
//       转发给 background（只有隔离世界才有 chrome.runtime）。
// 说明：真正的 fetch/XHR 拦截在 inject.js 里做，因为 content script 默认的 isolated world
//       与页面不共享 window.fetch，拦不到页面请求。
(function () {
  window.addEventListener('message', (event) => {
    // 只接受同窗口发来的、带我们标记的消息
    if (event.source !== window) return;
    const d = event.data;
    if (!d || d.__forgePlmCap !== true || !d.data) return;
    try {
      chrome.runtime.sendMessage({ type: 'capture', data: d.data });
    } catch (e) {}
  });
})();
