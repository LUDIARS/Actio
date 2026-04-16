import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { Dashboard } from "./pages/Dashboard";
import { DataManagementPage } from "./pages/DataManagementPage";
import { ReservationsPage } from "./pages/ReservationsPage";
import { FacilityBookingPage } from "./pages/FacilityBookingPage";
import { NotificationsPage } from "./pages/NotificationsPage";

import { VotingPage } from "./pages/VotingPage";
import { CalendarPage } from "./pages/CalendarPage";
import { GroupsPage } from "./pages/GroupsPage";
import { MyPlanPage } from "./pages/MyPlanPage";
import { SchemaManagementPage } from "./pages/SchemaManagementPage";
import { UserManagementPage } from "./pages/UserManagementPage";
import { DbViewerPage } from "./pages/DbViewerPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ActivityLogsPage } from "./pages/ActivityLogsPage";
import { TasksPage } from "./pages/TasksPage";
import { HelpPage } from "./pages/HelpPage";
import { IntegrationsPage } from "./pages/IntegrationsPage";
import { SecretsPage } from "./pages/SecretsPage";
import { InfisicalSetupPage } from "./pages/InfisicalSetupPage";
import { ApiKeysPage } from "./pages/ApiKeysPage";
import { ProfilePage } from "./pages/ProfilePage";
import { MachinaPage } from "./pages/MachinaPage";
import { PMDashboardPage } from "./pages/PMDashboardPage";
import { PMProjectPage } from "./pages/PMProjectPage";
import { PMAnalyticsPage } from "./pages/PMAnalyticsPage";
import { ModuleManagementPage } from "./pages/ModuleManagementPage";
import { setupApi } from "./lib/api";
import { registerAllModules } from "./lib/modules";
import "./global.css";

// 全モジュールをレジストリに登録
registerAllModules();

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
        {/* M2カリキュラムプランは廃止 — M1データ管理に統合 */}
        <Route path="/groups" element={<GroupsPage />} />
        <Route path="/my-plan" element={<MyPlanPage />} />
        <Route path="/scheduler" element={<Navigate to="/reservations" replace />} />
        <Route path="/smart-scheduler" element={<Navigate to="/reservations" replace />} />
        <Route path="/reservations" element={<ReservationsPage />} />
        <Route path="/reservations/facility" element={<FacilityBookingPage />} />
        <Route path="/reservations/new" element={<FacilityBookingPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/voting" element={<VotingPage />} />
        <Route path="/machina" element={<MachinaPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/admin/users" element={<UserManagementPage />} />
        <Route path="/admin/modules" element={<ModuleManagementPage />} />
        <Route path="/admin/settings" element={<SettingsPage />} />
        <Route path="/admin/activity-logs" element={<ActivityLogsPage />} />
        <Route path="/admin/db" element={<DbViewerPage />} />
        <Route path="/admin/secrets" element={<SecretsPage />} />
        <Route path="/pm" element={<PMDashboardPage />} />
        <Route path="/pm/:projectId" element={<PMProjectPage />} />
        <Route path="/pm/:projectId/analytics" element={<PMAnalyticsPage />} />
        <Route path="/integrations" element={<IntegrationsPage />} />
        <Route path="/api-keys" element={<ApiKeysPage />} />
        <Route path="/help" element={<HelpPage />} />
      </Route>
    </Routes>
  );
}

function App() {
  const [setupChecking, setSetupChecking] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    setupApi.getStatus()
      .then((status) => {
        setNeedsSetup(status.needsSetup);
      })
      .catch((err) => {
        console.warn("[App] セットアップ状態チェック失敗:", err);
        // チェック失敗時はセットアップ不要として続行
        setNeedsSetup(false);
      })
      .finally(() => setSetupChecking(false));
  }, []);

  if (setupChecking) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <span style={{ color: "var(--text-muted)" }}>読み込み中...</span>
      </div>
    );
  }

  if (needsSetup) {
    return <InfisicalSetupPage onComplete={() => setNeedsSetup(false)} />;
  }

  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
