import { Link } from 'react-router-dom';
import { Bell, Camera, CheckCircle2, Clock } from 'lucide-react';
import { buildNotifications } from '../../utils/adminNotifications';

const ICONS = { pending: Clock, shoot: Camera, new: Bell };

/** "What needs my attention", worked out from the dashboard data (no extra requests). */
export default function NotificationPanel({ stats, recent, loading }) {
  const items = loading ? [] : buildNotifications({ stats, recent });

  return (
    <section className="panel" aria-labelledby="notif-title">
      <header className="panel__head">
        <h2 id="notif-title" className="panel__title">Notifications</h2>
        {items.length > 0 && <span className="panel__count">{items.length}</span>}
      </header>

      {loading && <div className="panel__body"><span className="skeleton recent__skeleton" aria-hidden="true" /><span className="skeleton recent__skeleton" aria-hidden="true" /></div>}

      {!loading && items.length === 0 && (
        <p className="panel__state panel__state--ok"><CheckCircle2 size={18} /> You're all caught up.</p>
      )}

      {!loading && items.length > 0 && (
        <ul className="notif">
          {items.map(({ id, kind, title, detail, to }) => {
            const Icon = ICONS[kind] ?? Bell;
            return (
              <li key={id}>
                <Link to={to} className={`notif__item notif__item--${kind}`}>
                  <span className="notif__icon"><Icon size={16} aria-hidden="true" /></span>
                  <span>
                    <strong>{title}</strong>
                    <small>{detail}</small>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
