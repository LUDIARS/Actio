import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { Dashboard } from "./pages/Dashboard";
import { DataManagementPage } from "./pages/DataManagementPage";
import { SchedulerPage } from "./pages/SchedulerPage";
import { ReservationsPage } from "./pages/ReservationsPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { CurriculumPlanPage } from "./pages/CurriculumPlanPage";
import { VotingPage } from "./pages/VotingPage";
import { CalendarPage } from "./pages/CalendarPage";
import { GroupsPage } from "./pages/GroupsPage";
import { MyPlanPage } from "./pages/MyPlanPage";
import { SmartSchedulerPage } from "./pages/SmartSchedulerPage";
import { SchemaManagementPage } from "./pages/SchemaManagementPage";
import { UserManagementPage } from "./pages/UserManagementPage";
import { DbViewerPage } from "./pages/DbViewerPage";
import "./global.css";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <span style={{ color: "var(--text-muted)" }}>読み込み中...</span>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <span style={{ color: "var(--text-muted)" }}>読み込み中...</span>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Dashboard />} />
        <Route path="/data-management" element={<DataManagementPage />} />
        <Route path="/schema-management" element={<SchemaManagementPage />} />
        <Route path="/schedule" element={<DataManagementPage />} />
        <Route path="/curriculum-plan" element={<CurriculumPlanPage />} />
        <Route path="/groups" element={<GroupsPage />} />
        <Route path="/my-plan" element={<MyPlanPage />} />
        <Route path="/scheduler" element={<SchedulerPage />} />
        <Route path="/smart-scheduler" element={<SmartSchedulerPage />} />
        <Route path="/reservations" element={<ReservationsPage />} />
        <Route path="/reservations/new" element={<ReservationsPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/voting" element={<VotingPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/admin/users" element={<UserManagementPage />} />
        <Route path="/admin/db" element={<DbViewerPage />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
