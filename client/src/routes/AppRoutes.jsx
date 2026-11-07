import { Routes, Route, Navigate } from "react-router-dom";
import PublicLayout from "../layouts/PublicLayout";
import AdminLayout from "../layouts/AdminLayout";
import Home from "../pages/Home/Home";
import NotFound from "../pages/NotFound/NotFound";
import About from "../pages/About/About";
import Portfolio from "../pages/Portfolio/Portfolio";
import Services from "../pages/Services/Services";
import Contact from "../pages/Contact/Contact";
import Booking from "../pages/Booking/Booking";
import AdminLogin from "../pages/Auth/AdminLogin";
import ProtectedRoute from "../components/auth/ProtectedRoute";
import Dashboard from "../pages/Admin/Dashboard";
import Bookings from "../pages/Admin/Bookings";
import Calendar from "../pages/Admin/Calendar";
import AdminPortfolio from "../pages/Admin/Portfolio";
import Packages from "../pages/Admin/Packages";
import Messages from "../pages/Admin/Messages";
import Notifications from "../pages/Admin/Notifications";
import Clients from "../pages/Admin/Clients";
import ClientProfile from "../pages/Admin/ClientProfile";
import Settings from "../pages/Admin/Settings";
import FeatureGate from "../components/common/FeatureGate";

/**
 * Temporary stand-in for pages that aren't built yet.
 * When you build a page, import it above and swap it into its <Route element>.
 */
const Placeholder = ({ title }) => (
  <div className="container" style={{ padding: "80px 24px" }}>
    <h1>{title}</h1>
  </div>
);

export default function AppRoutes() {
  return (
    <Routes>
      {/* ---------- Public site: Navbar + page + Footer ---------- */}
      <Route element={<PublicLayout />}>
        <Route index element={<Home />} />
        <Route path="about" element={<About />} />
        <Route path="portfolio" element={<FeatureGate feature="portfolio"><Portfolio /></FeatureGate>} />
        <Route path="services" element={<Services />} />
        <Route path="booking" element={<Booking />} />
        <Route path="blog" element={<Placeholder title="Blog" />} />
        <Route path="contact" element={<FeatureGate feature="contact"><Contact /></FeatureGate>} />
        <Route path="gallery/:id" element={<Placeholder title="Client Gallery" />} />
        <Route path="login" element={<Navigate to="/admin/login" replace />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      {/* ---------- Admin sign-in: standalone page ---------- */}
      <Route path="admin/login" element={<AdminLogin />} />

      {/* ---------- Admin: only for a verified admin session ---------- */}
      <Route element={<ProtectedRoute />}>
        <Route path="admin" element={<AdminLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="bookings" element={<Bookings />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="clients" element={<Clients />} />
          <Route path="clients/:id" element={<ClientProfile />} />
          <Route path="portfolio" element={<AdminPortfolio />} />
          <Route path="packages" element={<Packages />} />
          <Route path="messages" element={<Messages />} />
          <Route path="settings" element={<Settings />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}