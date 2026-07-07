import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Box, Typography, Card, CardContent, TextField, Button, Chip, CircularProgress, MenuItem } from "@mui/material";
import { Add } from "@mui/icons-material";
import api from "../api/client";

const PRIORITY_COLORS = { P0: "error", P1: "warning", P2: "primary" };
const COLUMNS = ["待开始", "进行中", "待验证", "已完成"];

export default function TaskKanbanPage() {
  const { id } = useParams();
  const [tasks, setTasks] = useState([]);
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState("P2");

  const load = () => {
    Promise.all([api.projects.get(id), api.tasks.list({ project_id: id })]).then(([p, t]) => { setProject(p.data); setTasks(t.data); setLoading(false); });
  };

  useEffect(load, [id]);

  const addTask = async () => {
    if (!newTitle.trim()) return;
    await api.tasks.create({ project_id: Number(id), title: newTitle, priority: newPriority, kanban_column: "待开始" });
    setNewTitle(""); load();
  };

  if (loading) return <CircularProgress sx={{ display: "block", mx: "auto", mt: 8 }} />;

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} mb={2}>
        {project?.name} — 待办看板
      </Typography>

      <Box sx={{ display: "flex", gap: 1, mb: 3 }}>
        <TextField size="small" placeholder="新增任务标题" value={newTitle} onChange={e => setNewTitle(e.target.value)} onKeyDown={e => e.key === "Enter" && addTask()} sx={{ width: 300 }} />
        <TextField size="small" select value={newPriority} onChange={e => setNewPriority(e.target.value)} sx={{ width: 100 }}>
          {["P0","P1","P2"].map(p => <MenuItem key={p} value={p}>{p}</MenuItem>)}
        </TextField>
        <Button variant="contained" startIcon={<Add />} onClick={addTask}>添加</Button>
      </Box>

      <Box sx={{ display: "flex", gap: 2, overflowX: "auto" }}>
        {COLUMNS.map(col => {
          const colTasks = tasks.filter(t => t.kanban_column === col);
          return (
            <Card key={col} sx={{ minWidth: 250, flex: 1, bgcolor: "#fafafa" }}>
              <CardContent>
                <Typography variant="subtitle2" fontWeight={700} mb={1}>
                  {col} <Chip label={colTasks.length} size="small" sx={{ ml: 0.5 }} />
                </Typography>
                {colTasks.map(t => (
                  <Card key={t.id} sx={{ mb: 1, p: 1.5 }}>
                    <Typography variant="body2" fontWeight={600}>{t.title}</Typography>
                    <Box sx={{ display: "flex", gap: 1, mt: 0.5 }}>
                      <Chip label={t.priority} color={PRIORITY_COLORS[t.priority]} size="small" />
                      {t.due_date && <Typography variant="caption">{new Date(t.due_date).toLocaleDateString("zh-CN")}</Typography>}
                    </Box>
                  </Card>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </Box>
    </Box>
  );
}
