# M10 — 快速笔记模块详细 PRD

> **关联顶层 PRD**: `docs/PRD.md` v2.0  
> **开发优先级**: ⑩  
> **依赖**: 用户认证（多用户 owner_id 隔离）；不绑定具体项目  
> **实现状态**: ✅ 已完成（2026-07-29）

---

## 一、模块核心定位

提供轻量、**随手即记**的富文本笔记空间，用于快速记录灵感、待办、会议要点、临时信息。定位类似 ProcessOn 的「思维笔记」模式：所见即所得的图文混排编辑器，支持常见排版与结构化元素，无需登录外部工具。

- 全局维度：笔记 **不绑定项目**，属于用户个人空间；
- 隔离模型：沿用全局多用户规范，每条笔记绑定 `owner_id`，**仅本人可见可改**；
- 存储：富文本 HTML 直接存于 SQLite，`<img>` 以 base64 DataURL 内嵌（单向本地持久化，无外部同步）。

---

## 二、信息架构

- 左侧：**笔记列表**（新建 / 搜索 / 置顶优先 / 预览 / 删除）；
- 右侧：**编辑器**（标题 + 富文本工具栏 + 编辑区 + 自动保存状态）。

---

## 三、笔记列表

1. **新建**：右上「＋ 新建笔记」→ 创建空白笔记（默认标题「无标题笔记」），自动进入编辑；
2. **列表项**：标题 + 纯文本预览（HTML 去标签，取前 120 字）+ 置顶标记 📌；
3. **排序**：置顶笔记优先，其余按更新时间倒序；
4. **搜索**：实时过滤标题与预览内容；
5. **置顶**：列表项与编辑区均可一键置顶 / 取消；
6. **删除**：二次确认后删除，关联内容一并清除（不可恢复）。

---

## 四、富文本编辑器（工具栏能力）

基于 `contentEditable` + `document.execCommand` 实现（不引入第三方富文本库，规避 Vite 8 / rolldown 兼容风险）：

| 分类 | 功能 | 实现 |
|---|---|---|
| 字号 | 12/14/16/18/20/24/28/32/36/48 px | 以 `fontSize=7` 为标记插入后转换为 `<span style="font-size">` |
| 文字颜色 | 10 色预设 | `styleWithCSS` + `foreColor` |
| 背景高亮 | 9 色 + 清除 | `styleWithCSS` + `hiliteColor`/`backColor` |
| 基础样式 | 加粗 / 斜体 / 下划线 / 删除线 | `bold`/`italic`/`underline`/`strikeThrough` |
| 对齐 | 左 / 中 / 右 / 两端 | `justifyLeft`/`Center`/`Right`/`Full` |
| 列表 | 有序 / 无序 | `insertOrderedList`/`insertUnorderedList` |
| 撤销重做 | ↶ / ↷ | `undo`/`redo` |
| 清除格式 | ⌫ | `removeFormat` |
| 插入图片 | 🖼 上传 / 粘贴 | 文件或剪贴板图片 → DataURL → `insertImage` |
| 插入表格 | ▦ 表格 | 弹窗输入行,列（默认 3×3）→ `insertHTML` 带边框表格 |

> 图片支持两种来源：工具栏「上传」选择本地文件，或直接 `Ctrl+V` 粘贴截图（监听 paste 事件提取 image blob）。图片以 base64 内嵌，单条笔记内容上限 5 MB。

---

## 五、自动保存

1. 标题或内容变更后 **800ms 防抖** 自动 `PUT` 保存，无需手动保存；
2. 切换笔记 / 新建笔记前，先 flush 当前笔记（避免丢失）；
3. 编辑区顶部状态芯片实时显示「保存中… / 已保存 HH:MM:SS / 保存失败」；
4. 列表项的预览与标题随保存即时刷新。

---

## 六、权限与数据隔离

1. 全部接口经 `requireAuth` 中间件注入 `req.userId`；
2. `quick_notes` 含 `owner_id`，已纳入全局 `OWNER_TABLES` 启动迁移清单；
3. 所有读写（列表 / 详情 / 更新 / 删除）均带 `owner_id` 过滤，用户仅能操作自己的笔记；无越权接口。

---

## 七、后端 API 端点

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/quick-notes` | 列表（id/title/pinned/updated_at/preview），置顶优先、更新倒序 |
| POST | `/api/quick-notes` | 新建空白笔记（可选 title） |
| GET | `/api/quick-notes/:id` | 详情（含 content_html） |
| PUT | `/api/quick-notes/:id` | 更新 title / content_html / pinned |
| DELETE | `/api/quick-notes/:id` | 删除（连带内容清除） |

---

## 八、前端组件结构

| 文件 | 职责 |
|---|---|
| `client/src/pages/QuickNotesPage.jsx` | 笔记列表 + 编辑器 + 自动保存编排 |
| `client/src/components/notes/RichTextEditor.jsx` | contentEditable 富文本编辑器 + 工具栏 |
| `client/src/api/client.js`（`api.quickNotes`） | 5 个端点封装 |
| `client/src/App.jsx` | `/notes` 路由注册 |
| `client/src/components/layout/Sidebar.jsx` | 导航「个人空间 → 快速笔记」（内联笔记图标） |

---

## 九、数据库表结构

```sql
CREATE TABLE quick_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL DEFAULT 0,
    title TEXT DEFAULT '无标题笔记',
    content_html TEXT DEFAULT '',     -- 富文本 HTML（图片 base64 内嵌）
    pinned INTEGER DEFAULT 0,         -- 0 普通 / 1 置顶
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
);
```

---

## 十、全局开发约束

1. 沿用 Vite 8 兼容规范：禁用 `@mui/icons-material`（工具栏用 Unicode 文本，导航用内联 SvgIcon）；
2. 不引入第三方富文本依赖，降低 rolldown 打包风险；
3. 内容长度保护：单条 `content_html` 上限 5 MB（防止超大 base64 撑爆字段）；
4. 所有异常统一中文提示，前端友好展示。

---

## 十一、已知边界与后续可扩展

1. **图片为 base64 内嵌**：长期多图会增大 DB；后续可改为服务端文件上传（`multer` + 静态目录）以瘦身；
2. **无项目关联**：当前为个人全局笔记；后续可按需在笔记上挂接项目标签；
3. **无协作/分享**：单用户私有；后续可加「导出 Markdown / HTML」「复制为图片」；
4. **execCommand 为废弃 API**：在 Chromium（PWA/Chrome）下稳定可用；若未来切换内核需迁移至 Selection/Range 自实现或换用 TipTap 等库。
