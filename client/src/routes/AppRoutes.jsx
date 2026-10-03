import { Routes, Route } from 'react-router-dom';
import PublicLayout from '../layouts/PublicLayout';
import AdminLayout from '../layouts/AdminLayout';
import Home from '../pages/Home/Home';
import NotFound from '../pages/NotFound/NotFound';

/**
 * Temporary stand-in for pages that aren't built yet.
 * When you build a page, import it above and swap it into its <Route element>.
 */
const Placeholder = ({ title }) => (
  <div className="container" style={{ padding: '80px 24px' }}>
    <h1>{title}</h1>
  </div>
);

export default function AppRoutes() {
  return (
    <Routes>
      {/* ---------- Public site: Navbar + page + Footer ---------- */}
      <Route element={<PublicLayout />}>
        <Route index element={<Home />} />
        <Route path="about" element={<Placeholder title="About" />} />
        <Route path="portfolio" element={<Placeholder title="Portfolio" />} />
        <Route path="services" element={<Placeholder title="Services" />} />
        <Route path="booking" element={<Placeholder title="Book a Shoot" />} />
        <Route path="blog" element={<Placeholder title="Blog" />} />
        <Route path="contact" element={<Placeholder title="Contact" />} />
        <Route path="gallery/:id" element={<Placeholder title="Client Gallery" />} />
        <Route path="login" element={<Placeholder title="Login" />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      {/* ---------- Admin: Sidebar + Header + page ---------- */}
      {/* TODO: wrap in a ProtectedRoute once AuthContext exists */}
      <Route path="admin" element={<AdminLayout />}>
        <Route index element={<Placeholder title="Dashboard" />} />
        <Route path="bookings" element={<Placeholder title="Bookings" />} />
        <Route path="portfolio" element={<Placeholder title="Portfolio" />} />
        <Route path="packages" element={<Placeholder title="Packages" />} />
        <Route path="clients" element={<Placeholder title="Clients" />} />
        <Route path="messages" element={<Placeholder title="Messages" />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
