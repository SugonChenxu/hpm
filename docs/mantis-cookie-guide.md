# 如何获取 Mantis Cookie（给同事）

> 用途：在 Forge 的「⚙ Mantis 设置」里填写自己的 Mantis Cookie，让故障管理模块能拉取你的缺陷数据。
> 适用范围：**任何浏览器均可**（Chrome / Edge / Firefox / Safari 都行），**不需要谷歌浏览器**。
> 核心原理：Cookie 取自你**平时登录 Mantis 用的那个浏览器**，与用哪个浏览器打开 Forge 无关。

---

## 一、前置条件

1. 用你**自己的账号**在浏览器里登录 `https://mantis.sugon.com`（保持这个标签页打开）。
2. 打开 Forge → 故障管理页 → 点「⚙ Mantis 设置」→ 展开后看到 **Cookie / API Token** 输入框。
3. 下面的步骤就是为了拿到那段 Cookie 文本，粘贴进去。

---

## 二、方法一（推荐，所有浏览器通用）：DevTools → Network 复制 Cookie 请求头

这是最可靠的方法，因为 Mantis 的登录态 Cookie 通常是 `httpOnly`，JavaScript 读不到，只有从网络请求里抓才完整。

1. 在**已登录 Mantis 的页面**按 `F12` 打开开发者工具（各浏览器打开方式见第三节）。
2. 切到 **Network（网络）** 标签。
3. 按 `F5` 刷新一下页面，下方会出现一堆请求。
4. 在请求列表里**随便点一个**（例如第一个 `view_all_bug_page.php` 或任意 `mantis.sugon.com` 请求）。
5. 右侧切到 **Headers（标头）**，找到 **Request Headers（请求标头）** 里的 `Cookie` 这一行。
6. 在 `Cookie` 行上**右键 → 复制值（Copy value）**（有的浏览器叫「复制」）。
   - 如果没有「复制值」，就右键该行 → 选「复制」或手动把整行 `name=value; name2=value2; ...` 全部选中复制。
7. 回到 Forge 的输入框，**Ctrl+V 粘贴** → 点「保存连接」。
8. 保存后下方「最近使用的 Mantis 项目」能列出项目，说明 Cookie 有效。

> ✅ 复制整段 Cookie 字符串即可（包含多个 `name=value` 也没关系，Forge 会原样发给 Mantis）。
> ⚠️ 一定要复制 **Request Headers 里的 Cookie**（请求发出的），不要复制 Response 里的 `Set-Cookie`。

---

## 三、各浏览器如何打开开发者工具

| 浏览器 | 快捷键 | 备注 |
|--------|--------|------|
| **Edge**（最推荐，和 Chrome 一模一样） | `F12` 或 `Ctrl+Shift+I` | 操作与 Chrome 完全相同 |
| **Chrome** | `F12` 或 `Ctrl+Shift+I` | — |
| **Firefox** | `F12` 或 `Ctrl+Shift+I`；直接开 Network 用 `Ctrl+Shift+E` | 右键 Cookie 行 → 「复制值」 |
| **Safari** | 先开启：Safari 菜单 → 设置 → 高级 → 勾选「在菜单栏中显示 开发 菜单」；然后 `Option+Cmd+I` 或 开发 → 显示 Web 检查器 | Network 标签在检查器内 |

> 只要能打开 Network 标签、能复制请求的 Cookie 头，任何现代浏览器都行。

---

## 四、方法二（备选，复制 cURL 更简单）：右键请求复制为 cURL

如果你觉得在 Headers 里找 Cookie 不方便，可以用这个更稳的办法：

1. 在 Network 标签里**右键任意请求**。
2. 选 **Copy → Copy as cURL**（Chrome/Edge/Firefox 都有；Safari 在「开发」菜单里也有类似项）。
3. 把复制的内容粘贴到记事本，找到里面的 `--cookie '....'` 或 `-H 'Cookie: ....'` 那段，把引号里的整串复制出来。
4. 粘到 Forge 的 Cookie 输入框。

---

## 五、常见坑

- ❌ **不要用 JS 书签 / `document.cookie` 取 Cookie**：Mantis 登录态 Cookie 一般是 `httpOnly`，JS 读不到，取出来会是空的或缺少关键字段，导致 Forge 报「Mantis 鉴权失败」。请走上面的 DevTools 方法。
- ❌ 不要只复制某一个 cookie（比如只复制 `PHPSESSID=...`）：有时 Mantis 还依赖其它字段，整段复制最保险。
- ⏰ **Cookie 会过期**：当 Mantis 会话失效（退出登录、或几天后自动过期）时，Forge 会显示「Mantis 鉴权失败，请重新填写 Cookie」。届时重复上述步骤重新复制即可。
- 🔒 Cookie 等同于你的 Mantis 登录凭证，**只填在自己的 Forge 账号下，不要发给他人**。

---

## 六、一步验证

填完保存后，看 Forge 故障管理页：
- 「最近使用的 Mantis 项目」能列出你在 Mantis 里最近打开过的项目 → ✅ 成功；
- 报「未配置 / 鉴权失败」→ 重新走一遍第二节，确认复制的是 **Request Headers 的 Cookie** 且来自**已登录**的 Mantis 页面。
