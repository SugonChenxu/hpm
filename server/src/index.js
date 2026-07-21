import express from "express";
import cors from "cors";
import morgan from "morgan";
import path from "path";
import session from "express-session";
import FileStore from "session-file-store";
import { fileURLToPath } from "url";
import fs from "fs";
import db from "./db.js";
import "./seed.js";
import authRouter from "./auth.js";
import { requireAuth } from "./auth-middleware.js";

import projectsRouter from "./routes/projects.js";
import tasksRouter from "./routes/tasks.js";
import issuesRouter from "./routes/issues.js";
import mantisRouter from "./routes/mantis.js";
import materialsRouter from "./routes/materials.js";
import meetingsRouter from "./routes/meetings.js";
import weeklyReportsRouter from "./routes/weekly-reports.js";
import scheduleRouter from "./routes/schedule.js";
import weekMeetingsRouter from "./routes/week-meetings.js";
import plmRouter from "./routes/plm.js";
import usersRouter from "./routes/users.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(express.json());

// === Session（持久化到文件，登录保持 30 天）===
const SESSION_SECRET = process.env.SESSION_SECRET || "forge-internal-lan-secret-2026";
const SESSIONS_DIR = path.resolve(__dirname, "sessions");
const FileStoreSession = FileStore(session);
app.use(
  session({
    secret: SESSION_SECRET,
    store: new FileStoreSession({ path: SESSIONS_DIR, ttl: 30 * 24 * 60 * 60, retries: 2 }),
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 天，满足「登录尽量长」
      httpOnly: true,
      sameSite: "lax",
    },
  })
);

app.get("/api/health", (req, res) => {
  const count = db.prepare("SELECT COUNT(*) as cnt FROM projects").get();
  res.json({ ok: true, uptime: process.uptime(), projects: count.cnt });
});

// 认证路由（公开：登录/当前用户/登出）
app.use("/api/auth", authRouter);

// 认证网关：其余 /api 必须登录，注入 req.userId
app.use("/api", requireAuth);

app.use("/api", projectsRouter);
app.use("/api", tasksRouter);
app.use("/api", issuesRouter);
app.use("/api", mantisRouter);
app.use("/api", materialsRouter);
app.use("/api", meetingsRouter);
app.use("/api", weeklyReportsRouter);
app.use("/api", scheduleRouter);
app.use("/api", weekMeetingsRouter);
app.use("/api", plmRouter);
app.use("/api/users", usersRouter);

// === 生产模式：托管前端静态文件 ===
const clientDist = path.resolve(__dirname, "../../client/dist");
if (process.env.NODE_ENV === "production" && fs.existsSync(clientDist)) {
  app.use(express.static(clientDist, {
    // index.html 不缓存，强制每次重新校验，避免浏览器长期缓存旧的资源引用
    setHeaders: (res, filePath) => {
      if (path.basename(filePath) === "index.html") {
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  }));
  // SPA fallback：仅对「无扩展名的导航路径」返回 index.html。
  // 带扩展名(如 .js/.css/.png) 的请求若缺失，不再伪装成 HTML（会触发
  // "Expected a JavaScript module script but the server responded with text/html" 报错），
  // 而是直接 404，让问题显性化。
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    if (path.extname(req.path)) return res.status(404).end();
    res.sendFile(path.join(clientDist, "index.html"));
  });
  console.log(`[HPM] Serving static files from ${clientDist}`);
}

// === 错误处理 ===
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ ok: false, error: err.message || "Internal Server Error" });
});

app.listen(PORT, () => {
  console.log(`HPM Server running on http://localhost:${PORT}`);
  if (process.env.NODE_ENV === "production") {
    console.log("[HPM] Production mode — single process, no Vite dev server needed");
  }
});
