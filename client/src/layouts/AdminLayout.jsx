import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import AdminSidebar from '../components/admin/AdminSidebar';
import AdminHeader from '../components/admin/AdminHeader';
import useAuth from '../hooks/useAuth';
import useUnreadMessages from '../hooks/useUnreadMessages';

/**
 * AdminLayout
 * ├── AdminSidebar   fixed column on desktop, slide-in drawer below 1024px
 * ├── AdminHeader    page title + signed-in admin
 * └── <main>         the current admin page (<Outlet />)
 * Sits inside <ProtectedRoute />, so it only ever renders for a verified admin.
 */
export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pathname } = useLocation();
  const { token } = useAuth();
  const { unread, refresh } = useUnreadMessages(token); // one count for the sidebar badge AND the pages (via the outlet context)
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  // Close the mobile drawer whenever the page changes
  useEffect(() => { closeSidebar(); }, [pathname, closeSidebar]);

  return (
    <div className="admin">
      <a href="#admin-main" className="skip-link">Skip to content</a>

      <AdminSidebar isOpen={sidebarOpen} onClose={closeSidebar} unreadMessages={unread} />

      <div className="admin__main">
        <AdminHeader onMenuClick={() => setSidebarOpen(true)} />
        <main id="admin-main" className="admin__content" tabIndex={-1}>
          <Outlet context={{ unreadMessages: unread, refreshUnread: refresh }} />
        </main>
      </div>
    </div>
  );
}
