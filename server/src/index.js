import express from "express";
import cors from "cors";
import morgan from "morgan";
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

const app = express();
const PORT = 3001;

app.use(cors());
app.use(morgan("dev"));
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

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ ok: false, error: err.message || "Internal Server Error" });
});

app.listen(PORT, () => {
  console.log(`HPM Server running on http://localhost:${PORT}`);
});
