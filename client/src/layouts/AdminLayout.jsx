import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import AdminSidebar from '../components/admin/AdminSidebar';
import AdminHeader from '../components/admin/AdminHeader';

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pathname } = useLocation();

  // Close the mobile drawer on navigation
  useEffect(() => setSidebarOpen(false), [pathname]);

  return (
    <div className="admin">
      <AdminSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="admin__main">
        <AdminHeader onMenuClick={() => setSidebarOpen(true)} />
        <main className="admin__content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
