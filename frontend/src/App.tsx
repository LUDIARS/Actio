import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { SchedulePage } from "./pages/SchedulePage";
import { SchedulerPage } from "./pages/SchedulerPage";
import { ReservationsPage } from "./pages/ReservationsPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import "./global.css";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="/schedule" element={<SchedulePage />} />
          <Route path="/scheduler" element={<SchedulerPage />} />
          <Route path="/reservations" element={<ReservationsPage />} />
          <Route path="/reservations/new" element={<ReservationsPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
