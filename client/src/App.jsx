import { Routes, Route, Navigate } from "react-router-dom";
import { Box, CircularProgress } from "@mui/material";
import { ProjectProvider } from "./context/ProjectContext";
import { useAuth } from "./context/AuthContext";
import Layout from "./components/layout/Layout";
import DashboardPage from "./pages/DashboardPage";
import SchedulePage from "./pages/SchedulePage";
import TaskKanbanPage from "./pages/TaskKanbanPage";
import IssueListPage from "./pages/IssueListPage";
import IssueDashboardPage from "./pages/IssueDashboardPage";
import MaterialListPage from "./pages/MaterialListPage";
import MeetingListPage from "./pages/MeetingListPage";
import WeeklyReportPage from "./pages/WeeklyReportPage";
import RedirectLegacyRoutes from "./components/layout/RedirectLegacyRoutes";
import WeekMeetingPage from "./pages/WeekMeetingPage";
import UserManagementPage from "./pages/UserManagementPage";
import LoginPage from "./pages/LoginPage";

function FullScreenLoader() {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "background.default",
      }}
    >
      <CircularProgress />
    </Box>
  );
}

function AppInner() {
  const { user, loading } = useAuth();

  if (loading) return <FullScreenLoader />;
  if (!user) return <LoginPage />;

  return (
    <ProjectProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/plans" element={<SchedulePage />} />
          <Route path="/todos" element={<TaskKanbanPage />} />
          <Route path="/week-meetings" element={<WeekMeetingPage />} />
          <Route path="/issues" element={<IssueDashboardPage />} />
          <Route path="/materials" element={<MaterialListPage />} />
          <Route path="/meetings" element={<MeetingListPage />} />
          <Route path="/reports" element={<WeeklyReportPage />} />
          <Route path="/users" element={<UserManagementPage />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Route>
        {/* Legacy nested route catch-all for /projects/* */}
        <Route path="/projects/*" element={<RedirectLegacyRoutes />} />
      </Routes>
    </ProjectProvider>
  );
}

export default function App() {
  return <AppInner />;
}
