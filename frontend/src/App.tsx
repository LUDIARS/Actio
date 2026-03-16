import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { Dashboard } from "./pages/Dashboard";
import { SchedulePage } from "./pages/SchedulePage";
import { SchedulerPage } from "./pages/SchedulerPage";
import { ReservationsPage } from "./pages/ReservationsPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { CurriculumPlanPage } from "./pages/CurriculumPlanPage";
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
        <Route path="/schedule" element={<SchedulePage />} />
        <Route path="/scheduler" element={<SchedulerPage />} />
        <Route path="/reservations" element={<ReservationsPage />} />
        <Route path="/reservations/new" element={<ReservationsPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/curriculum-plan" element={<CurriculumPlanPage />} />
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
