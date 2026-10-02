import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/** Fades each route in and resets scroll to the top. Wrap <Outlet /> with it. */
export default function PageTransition({ children }) {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);

  return (
    <div key={pathname} className="page-transition">
      {children}
    </div>
  );
}
