import { Link } from 'react-router-dom';
import { CalendarX, Clock, Mail, Package, Upload } from 'lucide-react';

export default function QuickActions({ pending = 0 }) {
  const actions = [
    { label: 'Review pending requests', to: '/admin/bookings?status=pending', icon: Clock, badge: pending },
    { label: 'Block a date', to: '/admin/calendar', icon: CalendarX },
    { label: 'Upload photos', to: '/admin/portfolio', icon: Upload },
    { label: 'Edit packages', to: '/admin/packages', icon: Package },
    { label: 'Read messages', to: '/admin/messages', icon: Mail },
  ];

  return (
    <section className="panel" aria-labelledby="qa-title">
      <header className="panel__head"><h2 id="qa-title" className="panel__title">Quick actions</h2></header>
      <ul className="qa">
        {actions.map(({ label, to, icon: Icon, badge }) => (
          <li key={label}>
            <Link to={to} className="qa__link">
              <Icon size={18} strokeWidth={1.5} aria-hidden="true" />
              {label}
              {badge > 0 && <span className="qa__badge">{badge}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
