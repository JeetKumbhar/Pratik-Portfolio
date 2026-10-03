import { useLocation } from 'react-router-dom';
import { LogOut, Menu } from 'lucide-react';
import Button from '../common/Button';
import { ADMIN_NAV } from './adminNav';

export default function AdminHeader({ onMenuClick }) {
  const { pathname } = useLocation();

  // Title = the sidebar item whose path matches the current URL
  const current = ADMIN_NAV.find((i) => (i.end ? pathname === i.to : pathname.startsWith(i.to)));

  const handleLogout = () => {
    // TODO: call logout() from AuthContext, then navigate('/login')
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
        <span className="admin-header__avatar" aria-hidden="true">AM</span>
        <Button variant="ghost" size="sm" icon={<LogOut size={16} />} onClick={handleLogout}>
          Logout
        </Button>
      </div>
    </header>
  );
}
