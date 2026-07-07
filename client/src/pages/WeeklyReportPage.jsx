import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Box, Typography, Card, CardContent, TextField, Button, CircularProgress, Table, TableBody, TableCell, TableHead, TableRow, Paper } from "@mui/material";
import { AutoAwesome } from "@mui/icons-material";
import api from "../api/client";

function getWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { start: monday.toISOString().slice(0, 10), end: sunday.toISOString().slice(0, 10) };
}

export default function WeeklyReportPage() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [reports, setReports] = useState([]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const week = getWeekRange();
  const [weeks, setWeeks] = useState(week);

  const load = () => {
    Promise.all([api.projects.get(id), api.weeklyReports.list({ project_id: id })]).then(([p, r]) => { setProject(p.data); setReports(r.data); setLoading(false); });
  };

  useEffect(load, [id]);

  const generate = async () => {
    const res = await api.weeklyReports.generate({ project_id: Number(id), week_start: weeks.start, week_end: weeks.end });
    setReport(res.data);
  };

  if (loading) return <CircularProgress sx={{ display: "block", mx: "auto", mt: 8 }} />;

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} mb={2}>{project?.name} — 周报</Typography>

      <Box sx={{ display: "flex", gap: 2, mb: 3, alignItems: "center" }}>
        <TextField size="small" type="date" label="周一开始" value={weeks.start} onChange={e => setWeeks({ ...weeks, start: e.target.value })} InputLabelProps={{ shrink: true }} />
        <Typography>~</Typography>
        <TextField size="small" type="date" label="周日结束" value={weeks.end} onChange={e => setWeeks({ ...weeks, end: e.target.value })} InputLabelProps={{ shrink: true }} />
        <Button variant="contained" startIcon={<AutoAwesome />} onClick={generate}>生成周报</Button>
      </Box>

      {report && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" mb={2}>{report.title}</Typography>
            <Section title="一、项目进度" data={report.content.progress} />
            <Section title="二、待办事项" data={report.content.tasks} />
            <Section title="三、故障缺陷" data={report.content.issues} />
            <Section title="四、物料状态" data={report.content.materials} />
            <Section title="五、会议纪要" data={report.content.meetings} />
          </CardContent>
        </Card>
      )}

      <Paper>
        <Table size="small">
          <TableHead><TableRow><TableCell>周范围</TableCell><TableCell>标题</TableCell><TableCell>状态</TableCell><TableCell>版本</TableCell></TableRow></TableHead>
          <TableBody>
            {reports.map(r => (
              <TableRow key={r.id} hover>
                <TableCell>{r.week_start} ~ {r.week_end}</TableCell>
                <TableCell>{r.title}</TableCell>
                <TableCell>{r.status}</TableCell>
                <TableCell>v{r.version}</TableCell>
              </TableRow>
            ))}
            {reports.length === 0 && <TableRow><TableCell colSpan={4} align="center">暂无历史周报</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
}

function Section({ title, data }) {
  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="subtitle1" fontWeight={700}>{title}</Typography>
      <Typography variant="body2" color="text.secondary">
        {data ? JSON.stringify(data, null, 0) : "—"}
      </Typography>
    </Box>
  );
}
