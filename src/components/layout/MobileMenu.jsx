import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { NavLink } from 'react-router-dom';
import { Calendar, X } from 'lucide-react';
import Button from '../common/Button';
import { Logo } from './Navbar';
import SocialLinks from './SocialLinks';
import { NAV_LINKS, BOOKING_PATH } from '../../utils/constants';
import { cx } from '../../utils/helpers';

export default function MobileMenu({ isOpen, onClose }) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="mobile-menu">
      <div className="mobile-menu__backdrop" onClick={onClose} />
      <aside className="mobile-menu__panel" role="dialog" aria-modal="true" aria-label="Menu">
        <div className="mobile-menu__top">
          <Logo onClick={onClose} />
          <button type="button" className="mobile-menu__close" onClick={onClose} aria-label="Close menu">
            <X size={28} />
          </button>
        </div>

        <nav className="mobile-menu__nav" aria-label="Mobile">
          {NAV_LINKS.map(({ label, to }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={onClose}
              className={({ isActive }) => cx('mobile-menu__link', isActive && 'is-active')}
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="mobile-menu__footer">
          <Button to={BOOKING_PATH} fullWidth icon={<Calendar size={16} />} onClick={onClose}>
            Book a shoot
          </Button>
          <SocialLinks />
        </div>
      </aside>
    </div>,
    document.body
  );
}
