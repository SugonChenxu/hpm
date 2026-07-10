import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  TextField,
  Button,
  MenuItem,
  Card,
} from "@mui/material";
import { Add } from "@mui/icons-material";
import api from "../api/client";
import ProjectSelector from "../components/common/ProjectSelector";
import PageHeader from "../components/common/PageHeader";
import PageLoading from "../components/common/PageLoading";

const SEV_COLORS = {
  Critical: "error",
  Major: "warning",
  Minor: "info",
  Trivial: "default",
};

export default function IssueListPage() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("projectId") || null;
  const [issues, setIssues] = useState([]);
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ title: "", severity: "Minor" });

  const load = () => {
    setLoading(true);
    const apiParams = projectId ? { project_id: Number(projectId) } : {};
    const promises = [api.issues.list(apiParams)];
    if (projectId) {
      promises.push(api.projects.get(Number(projectId)));
    }
    Promise.all(promises)
      .then((results) => {
        setIssues(results[0].data);
        if (projectId) {
          setProject(results[1].data);
        } else {
          setProject(null);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(load, [projectId]);

  const addIssue = async () => {
    if (!form.title || !projectId) return;
    await api.issues.create({
      project_id: Number(projectId),
      title: form.title,
      severity: form.severity,
    });
    setForm({ title: "", severity: "Minor" });
    load();
  };

  if (loading)
    return <PageLoading />;

  return (
    <Box>
      <Box sx={{ mb: 2 }}>
        <ProjectSelector />
      </Box>

      <PageHeader title="故障管理" subtitle="缺陷跟踪与 DI 计算" />

      {projectId ? (
        <Box sx={{ display: "flex", gap: 1, mb: 3 }}>
          <TextField
            size="small"
            placeholder="缺陷标题"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && addIssue()}
            sx={{ width: 300 }}
          />
          <TextField
            size="small"
            select
            value={form.severity}
            onChange={(e) => setForm({ ...form, severity: e.target.value })}
            sx={{ width: 130 }}
          >
            {["Critical", "Major", "Minor", "Trivial"].map((s) => (
              <MenuItem key={s} value={s}>
                {s}
              </MenuItem>
            ))}
          </TextField>
          <Button variant="contained" startIcon={<Add />} onClick={addIssue}>
            登记缺陷
          </Button>
        </Box>
      ) : (
        <Card sx={{ textAlign: "center", py: 4, mb: 2 }}>
          <Typography color="text.secondary">
            请选择项目后登记缺陷
          </Typography>
        </Card>
      )}

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>编号</TableCell>
              <TableCell>严重度</TableCell>
              <TableCell>标题</TableCell>
              <TableCell>状态</TableCell>
              <TableCell>来源</TableCell>
              <TableCell>DI权重</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {issues.map((i) => (
              <TableRow key={i.id} hover>
                <TableCell>{i.code}</TableCell>
                <TableCell>
                  <Chip
                    label={i.severity}
                    color={SEV_COLORS[i.severity]}
                    size="small"
                  />
                </TableCell>
                <TableCell>{i.title}</TableCell>
                <TableCell>
                  <Chip label={i.status} size="small" />
                </TableCell>
                <TableCell>
                  <Chip
                    label={i.source === "mantis" ? "Mantis" : "本地"}
                    size="small"
                    variant="outlined"
                  />
                </TableCell>
                <TableCell>{i.di_weight}</TableCell>
              </TableRow>
            ))}
            {issues.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  暂无缺陷
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
