import { Link } from 'react-router-dom';
import { cx } from '../../utils/helpers';

/** One number on the dashboard. Pass `to` to make the whole card a link. */
export default function StatCard({ icon: Icon, label, value, hint, loading = false, to, highlight = false }) {
  const body = (
    <>
      <span className="stat__icon"><Icon size={20} strokeWidth={1.5} aria-hidden="true" /></span>
      <div className="stat__body">
        <p className="stat__label">{label}</p>
        {loading ? <span className="skeleton stat__skeleton" aria-hidden="true" /> : <p className="stat__value">{value}</p>}
        {hint && !loading && <p className="stat__hint">{hint}</p>}
      </div>
    </>
  );
  const className = cx('stat', highlight && 'stat--highlight', to && 'stat--link');
  return to ? <Link to={to} className={className}>{body}</Link> : <div className={className}>{body}</div>;
}
