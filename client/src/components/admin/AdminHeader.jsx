import { useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { ADMIN_NAV } from './adminNav';
import useAuth from '../../hooks/useAuth';

export default function AdminHeader({ onMenuClick }) {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const initials = (user?.name || 'Admin').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  // Title = the sidebar item whose path matches the current URL (so /admin/bookings/123 still says "Bookings")
  const current = ADMIN_NAV.find((i) => (i.end ? pathname === i.to : pathname.startsWith(i.to)));

  return (
    <header className="admin-header">
      <div className="admin-header__left">
        <button type="button" className="admin-header__menu" onClick={onMenuClick} aria-label="Open menu">
          <Menu size={24} />
        </button>
        <h1 className="admin-header__title">{current?.label ?? 'Admin'}</h1>
      </div>

      <div className="admin-header__right">
        <span className="admin-header__name">{user?.name}</span>
        <span className="admin-header__avatar" title={user?.email} aria-hidden="true">{initials}</span>
      </div>
    </header>
  );
}
