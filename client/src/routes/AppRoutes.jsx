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
        <Route path="portfolio" element={<Portfolio />} />
        <Route path="services" element={<Services />} />
        <Route path="booking" element={<Booking />} />
        <Route path="blog" element={<Placeholder title="Blog" />} />
        <Route path="contact" element={<Contact />} />
        <Route
          path="gallery/:id"
          element={<Placeholder title="Client Gallery" />}
        />
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
          <Route path="calendar" element={<Placeholder title="Calendar" />} />
          <Route path="clients" element={<Placeholder title="Clients" />} />
          <Route path="portfolio" element={<Placeholder title="Portfolio" />} />
          <Route path="packages" element={<Placeholder title="Packages" />} />
          <Route path="messages" element={<Placeholder title="Messages" />} />
          <Route path="settings" element={<Placeholder title="Settings" />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}