import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Box, TextField, Button, Typography, MenuItem, Card, CardContent, FormControl, InputLabel, Select, CircularProgress } from "@mui/material";
import api from "../api/client";

export default function CreateProjectPage() {
  const [templates, setTemplates] = useState([]);
  const [form, setForm] = useState({ code: "", name: "", category: "新品", template_id: "" });
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.templates.list().then(r => { setTemplates(r.data); setLoading(false); });
  }, []);

  const handleSubmit = async () => {
    if (!form.code || !form.name) return;
    await api.projects.create({ ...form, template_id: form.template_id ? Number(form.template_id) : null });
    navigate("/");
  };

  if (loading) return <CircularProgress sx={{ display: "block", mx: "auto", mt: 8 }} />;

  return (
    <Box sx={{ maxWidth: 500, mx: "auto", mt: 2 }}>
      <Typography variant="h5" fontWeight={700} mb={3}>新建项目</Typography>
      <Card>
        <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
          <TextField label="项目代号" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} required helperText="如 HG4-001" />
          <TextField label="项目名称" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
          <TextField select label="项目类别" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
            {["新品","OEM","升级","定制","派生","部件引入","独立板卡","机柜机箱","产品维护"].map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
          </TextField>
          <TextField select label="流程模板" value={form.template_id} onChange={e => setForm({ ...form, template_id: e.target.value })} helperText={form.template_id ? "选择模板后将自动创建阶段和门禁点" : "留空则创建空白项目"}>
            <MenuItem value="">空白模板（手动定义阶段）</MenuItem>
            {templates.map(t => <MenuItem key={t.id} value={String(t.id)}>{t.name}{t.is_preset ? " (预设)" : ""}</MenuItem>)}
          </TextField>
          <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
            <Button onClick={() => navigate("/")}>取消</Button>
            <Button variant="contained" onClick={handleSubmit} disabled={!form.code || !form.name}>创建</Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
