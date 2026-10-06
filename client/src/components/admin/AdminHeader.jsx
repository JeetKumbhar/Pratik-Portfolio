import { useLocation, useNavigate } from 'react-router-dom';
import { LogOut, Menu } from 'lucide-react';
import Button from '../common/Button';
import { ADMIN_NAV } from './adminNav';
import useAuth from '../../hooks/useAuth';

export default function AdminHeader({ onMenuClick }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const initials = (user?.name || 'Admin').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  // Title = the sidebar item whose path matches the current URL
  const current = ADMIN_NAV.find((i) => (i.end ? pathname === i.to : pathname.startsWith(i.to)));

  const handleLogout = () => {
    logout(); // forgets the token in this browser
    navigate('/admin/login', { replace: true });
  };

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
        <span className="admin-header__avatar" aria-hidden="true">{initials}</span>
        <Button variant="ghost" size="sm" icon={<LogOut size={16} />} onClick={handleLogout}>
          Logout
        </Button>
      </div>
    </header>
  );
}
