import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Box, Typography, CircularProgress, Snackbar, Alert, Card } from "@mui/material";
import api from "../api/client";
import ProjectSelector from "../components/common/ProjectSelector";
import KanbanGlobalView from "../components/kanban/KanbanGlobalView";
import KanbanProjectView from "../components/kanban/KanbanProjectView";

/**
 * 看板页面入口
 *
 * 路由分发：
 * - projectId === null → KanbanGlobalView（全部项目四列看板）
 * - projectId !== null → KanbanProjectView（项目双栏看板）
 */
export default function TaskKanbanPage() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("projectId") || null;

  const [tasks, setTasks] = useState([]);
  const [project, setProject] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);

    const apiParams = projectId ? { project_id: Number(projectId) } : {};
    const promises = [api.tasks.list(apiParams)];

    if (projectId) {
      const pid = Number(projectId);
      promises.push(api.projects.get(pid));
      promises.push(api.projects.kanbanStats(pid));
    }

    Promise.all(promises)
      .then((results) => {
        setTasks(results[0].data);
        if (projectId) {
          setProject(results[1].data);
          setStats(results[2].data);
        } else {
          setProject(null);
          setStats(null);
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "加载失败");
        setLoading(false);
      });
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* 项目选择器 */}
      <Box sx={{ mb: 2 }}>
        <ProjectSelector />
      </Box>

      {/* 标题 */}
      <Typography variant="h5" fontWeight={700} mb={2}>
        {project ? `${project.name} — 待办看板` : "全部项目 — 待办看板"}
      </Typography>

      {/* 错误提示 */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* 路由分发 */}
      {projectId ? (
        <KanbanProjectView
          tasks={tasks}
          project={project}
          stats={stats}
          onTasksChange={setTasks}
          onRefresh={load}
        />
      ) : tasks.length === 0 ? (
        <Card sx={{ textAlign: "center", py: 6 }}>
          <Typography color="text.secondary">
            暂无待办任务
          </Typography>
        </Card>
      ) : (
        <KanbanGlobalView
          tasks={tasks}
          onTasksChange={setTasks}
        />
      )}

      {/* 全局错误 Snackbar */}
      <Snackbar
        open={!!error}
        autoHideDuration={4000}
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="error" onClose={() => setError(null)} variant="filled">
          {error}
        </Alert>
      </Snackbar>
    </Box>
  );
}
