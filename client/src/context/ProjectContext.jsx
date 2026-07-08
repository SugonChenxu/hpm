import { createContext, useContext, useState, useEffect, useCallback } from "react";
import api from "../api/client";

const ProjectContext = createContext(null);

/**
 * Provider that caches the full project list globally.
 * Exposes { projects, loading, error, refreshProjects }.
 */
export function ProjectProvider({ children }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refreshProjects = useCallback(async () => {
    try {
      setLoading(true);
      const r = await api.projects.list({});
      setProjects(r.data || []);
      setError(null);
    } catch (err) {
      setError(err.message || "加载项目列表失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  return (
    <ProjectContext.Provider value={{ projects, loading, error, refreshProjects }}>
      {children}
    </ProjectContext.Provider>
  );
}

/**
 * Hook to consume project list from context.
 * Must be used inside <ProjectProvider>.
 */
export function useProjectContext() {
  const ctx = useContext(ProjectContext);
  if (!ctx) {
    throw new Error("useProjectContext must be used within <ProjectProvider>");
  }
  return ctx;
}

export default ProjectContext;
