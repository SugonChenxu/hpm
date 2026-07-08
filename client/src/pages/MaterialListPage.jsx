import { useState, useEffect } from "react";
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
  CircularProgress,
  MenuItem,
  Card,
} from "@mui/material";
import { Add } from "@mui/icons-material";
import api from "../api/client";
import ProjectSelector from "../components/common/ProjectSelector";

const STATUS_COLORS = {
  待下单: "default",
  已下单: "info",
  在途: "warning",
  已到货: "success",
  已逾期: "error",
};
const TYPE_LIST = ["通用", "开发", "包材"];

export default function MaterialListPage() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("projectId") || null;
  const [materials, setMaterials] = useState([]);
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    part_no: "",
    name: "",
    material_type: "开发",
    supplier: "",
    planned_delivery: "",
  });

  const load = () => {
    setLoading(true);
    const apiParams = projectId ? { project_id: Number(projectId) } : {};
    const promises = [api.materials.list(apiParams)];
    if (projectId) {
      promises.push(api.projects.get(Number(projectId)));
    }
    Promise.all(promises)
      .then((results) => {
        setMaterials(results[0].data);
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

  const addMaterial = async () => {
    if (!form.part_no || !form.name || !projectId) return;
    await api.materials.create({
      ...form,
      project_id: Number(projectId),
    });
    setForm({
      part_no: "",
      name: "",
      material_type: "开发",
      supplier: "",
      planned_delivery: "",
    });
    load();
  };

  if (loading)
    return <CircularProgress sx={{ display: "block", mx: "auto", mt: 8 }} />;

  return (
    <Box>
      <Box sx={{ mb: 2 }}>
        <ProjectSelector />
      </Box>

      <Typography variant="h5" fontWeight={700} mb={2}>
        {project ? `${project.name} — 物料管理` : "全部项目 — 物料管理"}
      </Typography>

      {projectId ? (
        <Box sx={{ display: "flex", gap: 1, mb: 3, flexWrap: "wrap" }}>
          <TextField
            size="small"
            label="料号"
            value={form.part_no}
            onChange={(e) => setForm({ ...form, part_no: e.target.value })}
            sx={{ width: 130 }}
          />
          <TextField
            size="small"
            label="名称"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            sx={{ width: 200 }}
          />
          <TextField
            size="small"
            select
            label="类型"
            value={form.material_type}
            onChange={(e) =>
              setForm({ ...form, material_type: e.target.value })
            }
            sx={{ width: 100 }}
          >
            {TYPE_LIST.map((t) => (
              <MenuItem key={t} value={t}>
                {t}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            label="供应商"
            value={form.supplier}
            onChange={(e) => setForm({ ...form, supplier: e.target.value })}
            sx={{ width: 150 }}
          />
          <TextField
            size="small"
            type="date"
            label="计划交期"
            value={form.planned_delivery}
            onChange={(e) =>
              setForm({ ...form, planned_delivery: e.target.value })
            }
            InputLabelProps={{ shrink: true }}
            sx={{ width: 160 }}
          />
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={addMaterial}
          >
            添加物料
          </Button>
        </Box>
      ) : (
        <Card sx={{ textAlign: "center", py: 4, mb: 2 }}>
          <Typography color="text.secondary">
            请选择项目后添加物料
          </Typography>
        </Card>
      )}

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>料号</TableCell>
              <TableCell>名称</TableCell>
              <TableCell>类型</TableCell>
              <TableCell>数量</TableCell>
              <TableCell>供应商</TableCell>
              <TableCell>计划交期</TableCell>
              <TableCell>状态</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {materials.map((m) => (
              <TableRow key={m.id} hover>
                <TableCell>{m.part_no}</TableCell>
                <TableCell>{m.name}</TableCell>
                <TableCell>
                  <Chip
                    label={m.material_type}
                    size="small"
                    variant="outlined"
                  />
                </TableCell>
                <TableCell>{m.quantity}</TableCell>
                <TableCell>{m.supplier}</TableCell>
                <TableCell>{m.planned_delivery || "-"}</TableCell>
                <TableCell>
                  <Chip
                    label={m.status}
                    color={STATUS_COLORS[m.status]}
                    size="small"
                  />
                </TableCell>
              </TableRow>
            ))}
            {materials.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  暂无物料
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
