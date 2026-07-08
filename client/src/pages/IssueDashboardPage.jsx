import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Box, Typography, CircularProgress } from "@mui/material";
import api from "../api/client";
import RefreshBar from "../components/issue/RefreshBar";
import StatsCards from "../components/issue/StatsCards";
import DITrendChart from "../components/issue/DITrendChart";
import CategoryBarChart from "../components/issue/CategoryBarChart";
import ErrorState from "../components/issue/ErrorState";

export default function IssueDashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = searchParams.get("projectId") || "";
  const [mantisProjects, setMantisProjects] = useState([]);
  const [stats, setStats] = useState(null);
  const [diTrend, setDiTrend] = useState([]);
  const [categoryStats, setCategoryStats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { api.mantis.projects().then(r => setMantisProjects(r.data||[])).catch(() => {}); }, []);

  const load = async (pid) => {
    if (!pid) return;
    setLoading(true); setError(null);
    try {
      const [s, d, c] = await Promise.all([
        api.issues.summary(pid),
        api.issues.diTrend(pid),
        api.issues.categoryStats(pid),
      ]);
      setStats(s.data); setDiTrend(d.data||[]); setCategoryStats(c.data||[]);
    } catch (e) {
      setError(e?.message || "加载失败");
    } finally { setLoading(false); }
  };

  useEffect(() => { load(projectId); }, [projectId]);

  const refresh = () => { api.cache.invalidate(projectId).catch(()=>{}); load(projectId); };

  if (!projectId) return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" fontWeight={600} gutterBottom>故障仪表盘</Typography>
      <Box sx={{ textAlign:"center", py:8 }}>
        <Typography variant="h6" color="text.secondary" gutterBottom>请选择一个 Mantis 项目</Typography>
        <RefreshBar projectId="" projects={mantisProjects} onRefresh={()=>{}} onProjectChange={(pid)=>setSearchParams(pid?{projectId:pid}:{})} />
      </Box>
    </Box>
  );

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" fontWeight={600} gutterBottom>故障仪表盘</Typography>
      <RefreshBar projectId={projectId} projects={mantisProjects} loading={loading} onRefresh={refresh} onProjectChange={(pid)=>setSearchParams(pid?{projectId:pid}:{})} />
      {loading ? <CircularProgress sx={{ mx:"auto", mt:6, display:"block" }} /> :
       error ? <ErrorState type="unknown" message={error} onRetry={refresh} /> : (
        <>
          <StatsCards di={stats?.di||0} total={stats?.total||0} rate={stats?.rate||0} />
          <Box sx={{ display:"grid", gridTemplateColumns:{xs:"1fr",md:"1fr 1fr"}, gap:3, mt:3 }}>
            <DITrendChart data={diTrend} />
            <CategoryBarChart data={categoryStats} />
          </Box>
        </>
      )}
    </Box>
  );
}
