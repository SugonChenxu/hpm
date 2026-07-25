// Forge PLM Bridge - MAIN world 注入脚本
// 关键：本脚本运行在【页面世界(MAIN world)】，与页面共享同一个 window.fetch / XMLHttpRequest，
//       因此能真正拦到 PLM 页面自己发出的 BOM/物料请求。
//       捕获后通过 window.postMessage 传给隔离世界的 content.js（它才有 chrome API）。
(function () {
  if (window.__forgePlmInjected) return;
  window.__forgePlmInjected = true;

  const post = (data) => {
    try { window.postMessage({ __forgePlmCap: true, data }, '*'); } catch (e) {}
  };

  // 排除明显静态资源，其余（含 API）都捕获
  const shouldCapture = (u) =>
    !!u &&
    /^https?:/i.test(u) &&
    !/\.(js|css|png|jpe?g|gif|svg|woff2?|ico|html?|map)(\?|$)/i.test(u);

  const hdrObj = (h) => {
    const o = {};
    if (!h) return o;
    if (typeof h.forEach === 'function') {
      try { h.forEach((v, k) => (o[k] = v)); } catch (e) {}
    } else if (typeof h === 'object') {
      for (const k in h) o[k] = h[k];
    }
    return o;
  };

  // ---- 拦截 fetch ----
  const origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const method = (init && init.method) || (input && input.method) || 'GET';
      const headers = hdrObj(init && init.headers);
      return origFetch.apply(this, arguments).then((resp) => {
        try {
          if (shouldCapture(url)) {
            const clone = resp.clone();
            clone.text().then((body) => {
              post({ method, url, status: resp.status, reqHeaders: headers, body: (body || '').slice(0, 200000) });
            }).catch(() => {});
          }
        } catch (e) {}
        return resp;
      });
    };
  }

  // ---- 拦截 XHR ----
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  const origSrh = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.open = function (method, url) {
    this.__cap = { method, url, headers: {} };
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    try { this.__cap.headers[k] = v; } catch (e) {}
    return origSrh.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    const self = this;
    this.addEventListener('load', function () {
      try {
        if (self.__cap && shouldCapture(self.__cap.url)) {
          let body = '';
          try { body = self.responseText || ''; } catch (e) {}
          post({
            method: self.__cap.method,
            url: self.__cap.url,
            status: self.status,
            reqHeaders: self.__cap.headers,
            body: body.slice(0, 200000),
          });
        }
      } catch (e) {}
    });
    return origSend.apply(this, arguments);
  };
})();
