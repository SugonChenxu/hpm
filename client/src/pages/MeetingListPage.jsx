import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Box, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Chip, TextField, Button, CircularProgress, MenuItem } from "@mui/material";
import { Add } from "@mui/icons-material";
import api from "../api/client";

export default function MeetingListPage() {
  const { id } = useParams();
  const [meetings, setMeetings] = useState([]);
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ title: "", start_time: "", platform: "manual" });

  const load = () => {
    Promise.all([api.projects.get(id), api.meetings.list({ project_id: id })]).then(([p, m]) => { setProject(p.data); setMeetings(m.data); setLoading(false); });
  };

  useEffect(load, [id]);

  const addMeeting = async () => {
    if (!form.title) return;
    await api.meetings.create({ ...form, project_id: Number(id) });
    setForm({ title: "", start_time: "", platform: "manual" }); load();
  };

  if (loading) return <CircularProgress sx={{ display: "block", mx: "auto", mt: 8 }} />;

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} mb={2}>{project?.name} — 会议纪要</Typography>
      <Box sx={{ display: "flex", gap: 1, mb: 3, flexWrap: "wrap" }}>
        <TextField size="small" label="会议标题" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} sx={{ width: 250 }} />
        <TextField size="small" type="datetime-local" label="开始时间" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} InputLabelProps={{ shrink: true }} sx={{ width: 220 }} />
        <Button variant="contained" startIcon={<Add />} onClick={addMeeting}>手动登记</Button>
      </Box>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead><TableRow><TableCell>标题</TableCell><TableCell>平台</TableCell><TableCell>时间</TableCell><TableCell>参会人数</TableCell><TableCell>纪要状态</TableCell></TableRow></TableHead>
          <TableBody>
            {meetings.map(m => (
              <TableRow key={m.id} hover>
                <TableCell>{m.title}</TableCell>
                <TableCell><Chip label={m.platform === "tencent" ? "腾讯会议" : m.platform === "quanshi" ? "全时会议" : "手动"} size="small" variant="outlined" /></TableCell>
                <TableCell>{m.start_time ? new Date(m.start_time).toLocaleString("zh-CN") : "-"}</TableCell>
                <TableCell>{m.attendee_count || "-"}</TableCell>
                <TableCell><Chip label={m.minutes_status === "已编写" ? "已编写" : "待编写"} size="small" color={m.minutes_status === "已编写" ? "success" : "default"} /></TableCell>
              </TableRow>
            ))}
            {meetings.length === 0 && <TableRow><TableCell colSpan={5} align="center">暂无会议记录</TableCell></TableRow>}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
