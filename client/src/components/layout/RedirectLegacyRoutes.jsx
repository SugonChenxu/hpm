import { useParams, Navigate } from "react-router-dom";
import { Routes, Route } from "react-router-dom";

/**
 * Internal component that reads the :id route param and redirects
 * to the new flat route with ?projectId=<id>.
 */
function LegacyRedirect({ to }) {
  const { id } = useParams();
  const search = id ? `?projectId=${id}` : "";
  return <Navigate to={`${to}${search}`} replace />;
}

/**
 * Catch-all for legacy nested routes under /projects/*.
 * Redirects them to the new flat routes with query params.
 *
 * Mapping:
 *   /projects/new           → /dashboard?create=true
 *   /projects/:id           → /plans?projectId=:id
 *   /projects/:id/schedule  → /plans?projectId=:id
 *   /projects/:id/tasks     → /todos?projectId=:id
 *   /projects/:id/issues    → /issues?projectId=:id
 *   /projects/:id/materials → /materials?projectId=:id
 *   /projects/:id/meetings  → /meetings?projectId=:id
 *   /projects/:id/weekly    → /reports?projectId=:id
 */
export default function RedirectLegacyRoutes() {
  return (
    <Routes>
      <Route
        path="new"
        element={<Navigate to="/dashboard?create=true" replace />}
      />
      <Route path=":id/schedule" element={<LegacyRedirect to="/plans" />} />
      <Route path=":id/tasks" element={<LegacyRedirect to="/todos" />} />
      <Route path=":id/issues" element={<LegacyRedirect to="/issues" />} />
      <Route
        path=":id/materials"
        element={<LegacyRedirect to="/materials" />}
      />
      <Route path=":id/meetings" element={<LegacyRedirect to="/meetings" />} />
      <Route path=":id/weekly" element={<LegacyRedirect to="/reports" />} />
      {/* :id alone must come last to avoid matching before the more specific routes */}
      <Route path=":id" element={<LegacyRedirect to="/plans" />} />
    </Routes>
  );
}
