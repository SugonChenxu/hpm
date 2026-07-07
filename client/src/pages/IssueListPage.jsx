import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Box, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Chip, TextField, Button, CircularProgress, MenuItem } from "@mui/material";
import { Add } from "@mui/icons-material";
import api from "../api/client";

const SEV_COLORS = { Critical: "error", Major: "warning", Minor: "info", Trivial: "default" };

export default function IssueListPage() {
  const { id } = useParams();
  const [issues, setIssues] = useState([]);
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ title: "", severity: "Minor" });

  const load = () => {
    Promise.all([api.projects.get(id), api.issues.list({ project_id: id })]).then(([p, i]) => { setProject(p.data); setIssues(i.data); setLoading(false); });
  };

  useEffect(load, [id]);

  const addIssue = async () => {
    if (!form.title) return;
    await api.issues.create({ project_id: Number(id), title: form.title, severity: form.severity });
    setForm({ title: "", severity: "Minor" }); load();
  };

  if (loading) return <CircularProgress sx={{ display: "block", mx: "auto", mt: 8 }} />;

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} mb={2}>{project?.name} — 故障管理</Typography>
      <Box sx={{ display: "flex", gap: 1, mb: 3 }}>
        <TextField size="small" placeholder="缺陷标题" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} onKeyDown={e => e.key === "Enter" && addIssue()} sx={{ width: 300 }} />
        <TextField size="small" select value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })} sx={{ width: 130 }}>
          {["Critical","Major","Minor","Trivial"].map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
        </TextField>
        <Button variant="contained" startIcon={<Add />} onClick={addIssue}>登记缺陷</Button>
      </Box>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead><TableRow><TableCell>编号</TableCell><TableCell>严重度</TableCell><TableCell>标题</TableCell><TableCell>状态</TableCell><TableCell>来源</TableCell><TableCell>DI权重</TableCell></TableRow></TableHead>
          <TableBody>
            {issues.map(i => (
              <TableRow key={i.id} hover>
                <TableCell>{i.code}</TableCell>
                <TableCell><Chip label={i.severity} color={SEV_COLORS[i.severity]} size="small" /></TableCell>
                <TableCell>{i.title}</TableCell>
                <TableCell><Chip label={i.status} size="small" /></TableCell>
                <TableCell><Chip label={i.source === "mantis" ? "Mantis" : "本地"} size="small" variant="outlined" /></TableCell>
                <TableCell>{i.di_weight}</TableCell>
              </TableRow>
            ))}
            {issues.length === 0 && <TableRow><TableCell colSpan={6} align="center">暂无缺陷</TableCell></TableRow>}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
