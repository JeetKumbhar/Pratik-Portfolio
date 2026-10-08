import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import Badge from '../common/Badge';
import { SHOOT_TYPES, formatDate, formatTime, labelOf, money } from '../booking/bookingData';

const STATUS_VARIANT = { pending: 'warning', confirmed: 'success', completed: 'neutral', cancelled: 'danger' };

export default function RecentBookings({ bookings = [], loading, error, onRetry }) {
  return (
    <section className="panel" aria-labelledby="recent-title">
      <header className="panel__head">
        <h2 id="recent-title" className="panel__title">Recent bookings</h2>
        <Link to="/admin/bookings" className="panel__link">View all <ArrowRight size={14} /></Link>
      </header>

      {loading && (
        <div className="panel__body">
          {[0, 1, 2].map((i) => <span key={i} className="skeleton recent__skeleton" aria-hidden="true" />)}
        </div>
      )}

      {!loading && error && (
        <p className="panel__state" role="alert">
          {error} <button type="button" className="panel__retry" onClick={onRetry}>Try again</button>
        </p>
      )}

      {!loading && !error && bookings.length === 0 && (
        <p className="panel__state">No bookings yet. Requests from the website will show up here.</p>
      )}

      {!loading && !error && bookings.length > 0 && (
        <ul className="recent">
          {bookings.map((b) => (
            <li key={b.reference}>
              <Link to={`/admin/bookings?view=${b.reference}`} className="recent__row">
                <span className="recent__who">
                  <strong>{b.name}</strong>
                  <small>{b.reference}</small>
                </span>
                <span className="recent__when">
                  {labelOf(SHOOT_TYPES, b.shootType) || b.shootType}
                  <small>{formatDate(b.date)} · {formatTime(b.time)}</small>
                </span>
                <span className="recent__pkg">
                  {b.package?.name}
                  <small>{b.package?.price != null ? money(b.package.price) : 'Custom quote'}</small>
                </span>
                <Badge variant={STATUS_VARIANT[b.status] ?? 'neutral'}>{b.status}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
