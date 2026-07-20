import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Box, Typography } from "@mui/material";
import api from "../api/client";
import PageHeader from "../components/common/PageHeader";
import PageLoading from "../components/common/PageLoading";
import RefreshBar from "../components/issue/RefreshBar";
import StatsCards from "../components/issue/StatsCards";
import DITrendChart from "../components/issue/DITrendChart";
import CategoryBarChart from "../components/issue/CategoryBarChart";
import ReportPanel from "../components/issue/ReportPanel";
import ErrorState from "../components/issue/ErrorState";
import MantisConnectionCard from "../components/issue/MantisConnectionCard";

export default function IssueDashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = searchParams.get("projectId") || "";
  const [mantisProjects, setMantisProjects] = useState([]);
  const [stats, setStats] = useState(null);
  const [diTrend, setDiTrend] = useState([]);
  const [categoryDI, setCategoryDI] = useState([]);
  const [reportText, setReportText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const reloadProjects = useCallback(() => {
    api.mantis.projects().then((r) => setMantisProjects(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => { reloadProjects(); }, [reloadProjects]);

  const load = async (pid) => {
    if (!pid) return;
    setLoading(true); setError(null);
    try {
      const [s, d, c, r] = await Promise.all([
        api.issues.summary(pid),
        api.issues.diTrend(pid),
        api.issues.categoryStats(pid, "di"),
        api.issues.report(pid),
      ]);
      setStats(s.data); setDiTrend(d.data||[]); setCategoryDI(c.data||[]); setReportText(r.data||"");
    } catch (e) {
      setError(e?.message || "加载失败");
    } finally { setLoading(false); }
  };

  useEffect(() => { load(projectId); }, [projectId]);

  const refresh = () => { api.cache.invalidate(projectId).catch(()=>{}); load(projectId); };

  if (!projectId) return (
    <Box sx={{ p: 3 }}>
      <PageHeader title="故障仪表板" subtitle="DI 趋势与分类统计" />
      <MantisConnectionCard onSaved={reloadProjects} />
      <Box sx={{ textAlign:"center", py:8 }}>
        <Typography variant="h6" color="text.secondary" gutterBottom>请选择一个 Mantis 项目</Typography>
        <RefreshBar projectId="" projects={mantisProjects} onRefresh={()=>{}} onProjectChange={(pid)=>setSearchParams(pid?{projectId:pid}:{})} />
      </Box>
    </Box>
  );

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader title="故障仪表板" subtitle="DI 趋势与分类统计" />
      <MantisConnectionCard onSaved={reloadProjects} />
      <RefreshBar projectId={projectId} projects={mantisProjects} loading={loading} onRefresh={refresh} onProjectChange={(pid)=>setSearchParams(pid?{projectId:pid}:{})} />
      {loading ? <PageLoading /> :
       error ? <ErrorState type="unknown" message={error} onRetry={refresh} /> : (
        <>
          <StatsCards di={stats?.di||0} total={stats?.total||0} rate={stats?.rate||0} />
          <Box sx={{ display:"grid", gridTemplateColumns:{xs:"1fr",md:"1fr 1fr"}, gap:3, mt:3 }}>
            <DITrendChart data={diTrend} />
            <CategoryBarChart data={categoryDI} />
          </Box>
          <Box sx={{ mt: 3 }}>
            <ReportPanel reportText={reportText} />
          </Box>
        </>
      )}
    </Box>
  );
}
