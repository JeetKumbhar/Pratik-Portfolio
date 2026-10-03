import { NavLink } from 'react-router-dom';
import { ExternalLink, X } from 'lucide-react';
import { Logo } from '../layout/Navbar';
import { ADMIN_NAV } from './adminNav';
import { cx } from '../../utils/helpers';

export default function AdminSidebar({ isOpen, onClose }) {
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

        <nav className="admin-sidebar__nav">
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

        <NavLink to="/" className="admin-sidebar__link admin-sidebar__site">
          <ExternalLink size={18} aria-hidden="true" />
          View site
        </NavLink>
      </aside>
    </>
  );
}
