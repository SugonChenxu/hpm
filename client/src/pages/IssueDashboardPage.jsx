/**
 * IssueDashboardPage — 故障仪表盘主页面
 *
 * 组装所有 T04 子组件，按 URL searchParams 中的 projectId 驱动数据加载。
 * 覆盖 3 种页面状态：未选项目引导 / 异常错误 / 正常图表。
 */

import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Box, Typography, CircularProgress } from "@mui/material";
import useIssueDashboard from "../hooks/useIssueDashboard";
import api from "../api/client";
import RefreshBar from "../components/issue/RefreshBar";
import StatsCards from "../components/issue/StatsCards";
import DITrendChart from "../components/issue/DITrendChart";
import CategoryBarChart from "../components/issue/CategoryBarChart";
import ReportPanel from "../components/issue/ReportPanel";
import ErrorState from "../components/issue/ErrorState";

export default function IssueDashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = searchParams.get("projectId") || "";

  const [mantisProjects, setMantisProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  const {
    stats,
    diTrend,
    categoryStats,
    reportText,
    loading,
    error,
    errorType,
    refresh,
    lastUpdated,
  } = useIssueDashboard(projectId);

  // 加载 Mantis 项目列表（挂载时执行一次）
  useEffect(() => {
    setLoadingProjects(true);
    api.mantis
      .projects()
      .then((r) => setMantisProjects(r.data || []))
      .catch(() => setMantisProjects([]))
      .finally(() => setLoadingProjects(false));
  }, []);

  const handleProjectChange = (pid) => {
    setSearchParams(pid ? { projectId: pid } : {});
  };

  // ── 状态 A：未选择项目 ────────────────────────────────
  if (!projectId) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h5" gutterBottom fontWeight={600}>
          故障仪表盘
        </Typography>
        <Box sx={{ textAlign: "center", py: 8 }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            请选择一个 Mantis 项目
          </Typography>
          <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
            <RefreshBar
              projectId=""
              projects={mantisProjects}
              loading={loadingProjects}
              onRefresh={() => {}}
              onProjectChange={handleProjectChange}
            />
          </Box>
        </Box>
      </Box>
    );
  }

  // ── 状态 B：加载异常 ────────────────────────────────
  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h5" gutterBottom fontWeight={600}>
          故障仪表盘
        </Typography>
        <RefreshBar
          projectId={projectId}
          projects={mantisProjects}
          lastUpdated={lastUpdated}
          loading={false}
          onRefresh={refresh}
          onProjectChange={handleProjectChange}
        />
        <ErrorState type={errorType} message={error} onRetry={refresh} />
      </Box>
    );
  }

  // ── 状态 C：正常渲染 ────────────────────────────────
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom fontWeight={600}>
        故障仪表盘
      </Typography>
      <RefreshBar
        projectId={projectId}
        projects={mantisProjects}
        lastUpdated={lastUpdated}
        loading={loading}
        onRefresh={refresh}
        onProjectChange={handleProjectChange}
      />

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <StatsCards
            total={stats?.total || 0}
            resolved={stats?.resolved || 0}
            rate={stats?.rate || 0}
          />

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
              gap: 3,
              mt: 3,
            }}
          >
            <DITrendChart data={diTrend} />
            <CategoryBarChart data={categoryStats} />
          </Box>

          <Box sx={{ mt: 3 }}>
            <ReportPanel reportText={reportText} />
          </Box>
        </>
      )}
    </Box>
  );
}
