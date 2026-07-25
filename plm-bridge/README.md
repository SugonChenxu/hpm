# Forge PLM Bridge（本地 Cookie 代理方案）

目标：**在不使用 API token、不手动导出的情况下，让 Forge 实时拉取 PLM 的 BOM/物料数据。**
原理：复用你浏览器里已经 SSO 登录的 PLM 会话。一个极小的浏览器扩展把 httpOnly 的会话
cookie 推给本机跑的 Node 代理，代理拿着 cookie 去调 PLM 的 REST，再把结果喂给 Forge。

> 当前阶段：**已确认 PLM 的 BOM/物料是服务端渲染的 HTML 表格（在 iframe 内，JSP 页面），
> 不是 JSON REST**。适配器将改为「持 cookie 抓 JSP 页面 → 解析 HTML 表格」。
> 下面「第一步」用一次性采集脚本拿真实响应样本，据此写解析器。

---

## 一、目录结构
```
plm-bridge/
├── extension/        # Chromium 扩展（Chrome / Edge 通用）—— 用于最终实时集成
│   ├── manifest.json
│   ├── background.js  # 读 cookie + 收样本
│   ├── content.js     # 隔离世界桥接（收 MAIN world 上报）
│   ├── inject.js      # MAIN world 注入，真正拦截 fetch/XHR（v0.1.3 修复世界隔离）
│   ├── popup.html / popup.js
│   └── viewer.html / viewer.js  # 独立标签页查看器（避免弹窗切走关闭）
├── proxy/
│   ├── package.json
│   └── server.js      # 本地代理（127.0.0.1:8770）
├── capture.js         # 一次性采集脚本：本机抓 JSP 响应 HTML → captured/
├── cookie.txt         # （本机自建，首行贴 PLM cookie；已 gitignore）
├── capture-urls.txt   # （可选，逐行贴想抓的 PLM 页面完整 URL）
└── captured/          # 采集产物（已 gitignore）
```

## 二、启动本地代理
```bash
cd D:\HPM\plm-bridge\proxy
node server.js
# 看到 [forge-plm-bridge] proxy listening on http://127.0.0.1:8770 即正常
```
验证：`curl http://127.0.0.1:8770/status` → `{"hasCookie":false,...}`

## 三、加载浏览器扩展（Chrome / Edge）
1. 打开 `chrome://extensions`（Edge 是 `edge://extensions`）
2. 右上角打开「开发者模式」
3. 点「加载已解压的扩展程序」，选择 `D:\HPM\plm-bridge\extension` 文件夹
4. 固定扩展到工具栏（点拼图图标 → 图钉）
> 改了扩展代码后：回 `chrome://extensions` 点该扩展卡片上的「重新加载 ↻」，并**刷新 PLM 标签页**让 content script 重新注入。

## 四、捕获 PLM 真实响应（关键一步，一次性）
> 已知：BOM/物料是 HTML 表格（JSP，嵌在 iframe）。扩展因跨域 iframe 未能捕获，
> 故改用 **DevTools + 一次性采集脚本** 拿到响应样本。

**方式 A（推荐）：用 `capture.js` 本机抓 HTML**
1. 浏览器**登录 PLM**，保持登录态。
2. 在 DevTools → Network 里点开 BOM/物料请求，从请求头复制完整 `cookie` 字符串，
   存到 `D:\HPM\plm-bridge\cookie.txt` **首行**。
3. 从请求 URL 里取 `objectId`（形如 `19520.49557.16852.46202`）。
4. 在本机（能连 PLM 的机器）运行：
   ```bash
   cd D:\HPM\plm-bridge
   node capture.js <objectId>
   ```
5. 脚本把 `sgDevelopmentWarehouse.jsp`（研发仓库/BOM 表）和 `emxExtendedPageHeaderAction.jsp`
   （对象属性）的响应存到 `captured/*.html`，并自动抽出表格到 `captured/*.tables.txt`。
6. 把 `captured/` 目录告诉我（同机可直读），我据此写 HTML 解析器。

**方式 B（补充）：抓任意其他 BOM 页**
- 把想抓的 PLM 页面完整 URL 逐行写进 `capture-urls.txt`，重跑 `node capture.js` 会一并抓取。
- 适合「产品结构树 / BOM 展开」等其它表格页。

**方式 C（兜底）：DevTools 手动复制**
- 若脚本不便跑，可在 DevTools Network 找到返回 HTML 的 BOM 请求，右键 →
  「Copy → Copy as fetch」+ 复制 Response，贴给我。

## 五、之后（由我来做）
拿到上面的样本后，我会：
- 在 `server/src/adapters/` 写 `plm.js`，仿照 `mantis.js`：持有你的 cookie、调本地代理拉 BOM/物料、
  按 owner 隔离、检测 SSO 失效提示重登；
- 接到 Forge 的 M4 物料管理模块做前端展示，实现「实时拉取」。
- 联调、部署、推送。

## 六、已知限制（务必知悉）
- **依赖你保持 PLM 浏览器登录**：SSO 超时 / MFA 重登后 cookie 失效，代理会返回 `expired`，
  需在扩展里重新「推送 Cookie」。
- **稳定性不如正规 API token**：这是借登录态的取巧方案，PLM 升级/改版可能要跟着调。
- **合规**：建议事前跟 IT 确认程序化拉取许可。
- 代理仅监听 `127.0.0.1`，不外网暴露。
