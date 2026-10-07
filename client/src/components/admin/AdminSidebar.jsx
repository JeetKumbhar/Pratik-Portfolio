import { useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { ExternalLink, LogOut, X } from 'lucide-react';
import { Logo } from '../layout/Navbar';
import useAuth from '../../hooks/useAuth';
import { ADMIN_NAV } from './adminNav';
import { cx } from '../../utils/helpers';

export default function AdminSidebar({ isOpen, onClose }) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  // Drawer mode (below 1024px): Esc closes it, and the page behind it stops scrolling
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    if (window.matchMedia('(max-width: 1023px)').matches) document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  const handleLogout = () => {
    logout(); // forgets the token in this browser
    navigate('/admin/login', { replace: true });
  };

  return (
    <>
      {isOpen && <div className="admin-sidebar__backdrop" onClick={onClose} />}

      <aside className={cx('admin-sidebar', isOpen && 'is-open')} aria-label="Admin navigation">
        <div className="admin-sidebar__top">
          <Logo />
          <button type="button" className="admin-sidebar__close" onClick={onClose} aria-label="Close menu">
            <X size={22} />
          </button>
        </div>

        <nav className="admin-sidebar__nav" aria-label="Admin sections">
          {ADMIN_NAV.map(({ label, to, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => cx('admin-sidebar__link', isActive && 'is-active')}
            >
              <Icon size={18} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="admin-sidebar__footer">
          <a className="admin-sidebar__link" href="/" target="_blank" rel="noopener noreferrer">
            <ExternalLink size={18} aria-hidden="true" />
            View site
          </a>
          <button type="button" className="admin-sidebar__link admin-sidebar__logout" onClick={handleLogout}>
            <LogOut size={18} aria-hidden="true" />
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}
