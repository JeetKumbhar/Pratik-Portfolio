import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Calendar, Camera, Menu } from 'lucide-react';
import Button from '../common/Button';
import MobileMenu from './MobileMenu';
import { NAV_LINKS, BOOKING_PATH, SITE } from '../../utils/constants';
import { cx } from '../../utils/helpers';

export function Logo({ onClick }) {
  return (
    <Link to="/" className="logo" onClick={onClick} aria-label={`${SITE.name} ${SITE.tagline} – home`}>
      <Camera size={34} strokeWidth={1.3} aria-hidden="true" />
      <span className="logo__text">
        <span className="logo__name">{SITE.name}</span>
        <span className="logo__sub">{SITE.tagline}</span>
      </span>
    </Link>
  );
}

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close the mobile menu whenever the route changes
  useEffect(() => setMenuOpen(false), [pathname]);

  return (
    <>
      <header className={cx('navbar', scrolled && 'navbar--scrolled')}>
        <div className="container navbar__inner">
          <Logo />

          <nav className="navbar__links" aria-label="Primary">
            {NAV_LINKS.map(({ label, to }) => (
              <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => cx('navbar__link', isActive && 'is-active')}>
                {label}
              </NavLink>
            ))}
          </nav>

          <Button to={BOOKING_PATH} variant="outline" size="sm" className="navbar__cta" icon={<Calendar size={16} />}>
            Book a shoot
          </Button>

          <button
            type="button"
            className="navbar__toggle"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
          >
            <Menu size={28} />
          </button>
        </div>
      </header>

      <MobileMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}