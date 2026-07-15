import express from "express";
import cors from "cors";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import db from "./db.js";
import "./seed.js";

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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(express.json());

app.get("/api/health", (req, res) => {
  const count = db.prepare("SELECT COUNT(*) as cnt FROM projects").get();
  res.json({ ok: true, uptime: process.uptime(), projects: count.cnt });
});

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

// === 生产模式：托管前端静态文件 ===
const clientDist = path.resolve(__dirname, "../../client/dist");
if (process.env.NODE_ENV === "production" && fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // SPA fallback：所有非 API 路由返回 index.html
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api")) return; // 不应该到这里，兜底
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
