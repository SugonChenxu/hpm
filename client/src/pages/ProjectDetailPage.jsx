import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Box, Typography, Card, CardContent, Chip, Button, CircularProgress, Tabs, Tab, List, ListItem, ListItemText, Divider } from "@mui/material";
import { Edit, CheckCircle, RadioButtonUnchecked, Timeline } from "@mui/icons-material";
import api from "../api/client";

const STATUS_COLORS = { 进行中: "primary", 已结项: "success", 已归档: "default" };

export default function ProjectDetailPage() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    api.projects.get(id).then(r => { setProject(r.data); setLoading(false); }).catch(() => setLoading(false));
  }, [id]);

  if (loading) return <CircularProgress sx={{ display: "block", mx: "auto", mt: 8 }} />;
  if (!project) return <Typography color="error">项目不存在</Typography>;

  const phases = project.phases || [];

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Box>
          <Typography variant="subtitle2" color="text.secondary">{project.code}</Typography>
          <Typography variant="h5" fontWeight={700}>{project.name}</Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Chip label={project.category} variant="outlined" />
          <Chip label={project.status} color={STATUS_COLORS[project.status] || "default"} />
          <Button size="small" startIcon={<Edit />}>编辑</Button>
        </Box>
      </Box>

      <Box sx={{ display: "flex", gap: 1, mb: 3 }}>
        <Button component={Link} to={`/projects/${id}/tasks`} size="small" variant="outlined">待办看板</Button>
        <Button component={Link} to={`/projects/${id}/issues`} size="small" variant="outlined">故障管理</Button>
        <Button component={Link} to={`/projects/${id}/materials`} size="small" variant="outlined">物料管理</Button>
        <Button component={Link} to={`/projects/${id}/meetings`} size="small" variant="outlined">会议纪要</Button>
        <Button component={Link} to={`/projects/${id}/weekly`} size="small" variant="outlined">周报</Button>
      </Box>

      <Card>
        <CardContent>
          <Typography variant="h6" mb={2} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Timeline /> 阶段时间线
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {phases.map((p, i) => (
              <Box key={p.id} sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                <Box sx={{ width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", bgcolor: p.status === "已完成" ? "#2E7D32" : p.status === "进行中" ? "#1565C0" : "#e0e0e0", color: p.status === "已完成" || p.status === "进行中" ? "#fff" : "#666", flexShrink: 0 }}>
                  {p.status === "已完成" ? <CheckCircle fontSize="small" /> : String(p.phase_order)}
                </Box>
                <Box sx={{ flexGrow: 1 }}>
                  <Typography variant="body2" fontWeight={p.status === "进行中" ? 700 : 400}>
                    {p.name}
                    {p.type === "GATE" && <Chip label="门禁" size="small" sx={{ ml: 1 }} />}
                  </Typography>
                  {p.di_threshold && p.type === "GATE" && <Typography variant="caption" color="text.secondary">DI阈值: {p.di_threshold}</Typography>}
                </Box>
                <Chip label={p.status} size="small" color={p.status === "已完成" ? "success" : p.status === "进行中" ? "primary" : "default"} />
              </Box>
            ))}
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
