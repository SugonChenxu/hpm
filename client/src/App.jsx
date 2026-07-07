import { Routes, Route } from "react-router-dom";
import Layout from "./components/layout/Layout";
import DashboardPage from "./pages/DashboardPage";
import ProjectDetailPage from "./pages/ProjectDetailPage";
import TaskKanbanPage from "./pages/TaskKanbanPage";
import IssueListPage from "./pages/IssueListPage";
import MaterialListPage from "./pages/MaterialListPage";
import MeetingListPage from "./pages/MeetingListPage";
import WeeklyReportPage from "./pages/WeeklyReportPage";
import CreateProjectPage from "./pages/CreateProjectPage";
import SchedulePage from "./pages/SchedulePage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/projects/new" element={<CreateProjectPage />} />
        <Route path="/projects/:id" element={<ProjectDetailPage />} />
        <Route path="/projects/:id/tasks" element={<TaskKanbanPage />} />
        <Route path="/projects/:id/issues" element={<IssueListPage />} />
        <Route path="/projects/:id/materials" element={<MaterialListPage />} />
        <Route path="/projects/:id/meetings" element={<MeetingListPage />} />
        <Route path="/projects/:id/weekly" element={<WeeklyReportPage />} />
        <Route path="/projects/:id/schedule" element={<SchedulePage />} />
      </Route>
    </Routes>
  );
}
