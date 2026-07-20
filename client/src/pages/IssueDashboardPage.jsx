import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Box, Typography, Button } from "@mui/material";
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
  const [recentProjects, setRecentProjects] = useState([]); // [{id, name}] 来自 Mantis 真实「最近使用」接口
  const [showSettings, setShowSettings] = useState(false);
  const [stats, setStats] = useState(null);
  const [diTrend, setDiTrend] = useState([]);
  const [categoryDI, setCategoryDI] = useState([]);
  const [reportText, setReportText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // 下拉只显示 Mantis「最近使用」的项目（真实接口，非全量）
  const reloadProjects = useCallback(() => {
    api.mantis.recentProjects().then((r) => setRecentProjects(r.data || [])).catch(() => {});
  }, []);
  useEffect(() => { reloadProjects(); }, [reloadProjects]);

  const fetchAll = useCallback(async (pid) => {
    const [s, d, c, r] = await Promise.all([
      api.issues.summary(pid),
      api.issues.diTrend(pid),
      api.issues.categoryStats(pid, "di"),
      api.issues.report(pid),
    ]);
    setStats(s.data);
    setDiTrend(d.data || []);
    setCategoryDI(c.data || []);
    setReportText(r.data || "");
    return s.data;
  }, []);

  const load = useCallback(async (pid) => {
    if (!pid) return;
    setLoading(true); setError(null);
    try {
      // 仪表盘为 Mantis 原生实时数据，无需同步到 Forge issues 表
      await fetchAll(pid);
    } catch (e) {
      setError(e?.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }, [fetchAll]);

  useEffect(() => { load(projectId); }, [projectId, load]);

  const refresh = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      await api.cache.invalidate(projectId).catch(() => {});
      await load(projectId);
    } finally {
      setLoading(false);
    }
  };

  const dropdownProjects = recentProjects.map((p) => ({
    id: p.id,
    name: p.name || p.id,
  }));

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
        <PageHeader title="故障仪表板" subtitle="DI 趋势与分类统计" />
        <Button variant="outlined" size="small" onClick={() => setShowSettings((s) => !s)}>
          ⚙ Mantis 设置
        </Button>
      </Box>

      {showSettings && (
        <MantisConnectionCard onSaved={reloadProjects} onClose={() => setShowSettings(false)} />
      )}

      {!projectId && (
        <Box sx={{ textAlign: "center", py: 8 }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            {recentProjects.length ? "请选择一个 Mantis 项目" : "暂无最近使用的 Mantis 项目"}
          </Typography>
          {!recentProjects.length && (
            <Typography variant="body2" color="text.secondary">
              下拉展示的是你在 Mantis 中「最近使用的项目」。若为空，请先在 Mantis 中打开过项目，或点右上角「⚙ Mantis 设置」确认 Cookie 有效。
            </Typography>
          )}
          <Box sx={{ mt: 2 }}>
            <RefreshBar projectId="" projects={dropdownProjects} onRefresh={() => {}} onProjectChange={(pid) => setSearchParams(pid ? { projectId: pid } : {})} />
          </Box>
        </Box>
      )}

      {projectId && (
        <>
          <RefreshBar projectId={projectId} projects={dropdownProjects} loading={loading} onRefresh={refresh} onProjectChange={(pid) => setSearchParams(pid ? { projectId: pid } : {})} />
          {loading ? <PageLoading /> :
           error ? <ErrorState type="unknown" message={error} onRetry={refresh} /> : (
            <>
              <StatsCards di={stats?.di || 0} total={stats?.total || 0} rate={stats?.rate || 0} />
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 3, mt: 3 }}>
                <DITrendChart data={diTrend} />
                <CategoryBarChart data={categoryDI} />
              </Box>
              <Box sx={{ mt: 3 }}>
                <ReportPanel reportText={reportText} />
              </Box>
            </>
          )}
        </>
      )}
    </Box>
  );
}
