import { CalendarX, ChevronRight, CloudOff } from 'lucide-react';
import Badge from '../../common/Badge';
import Button from '../../common/Button';
import EmptyState from '../../common/EmptyState';
import { SHOOT_TYPES, formatTime, fromKey, labelOf } from '../../booking/bookingData';
import { STATUS_META } from '../../../utils/bookingStatus';
import { BOOKING_FILTERS, shortDate } from '../../../utils/clientUtils';
import { cx } from '../../../utils/helpers';

const shootDate = (key) => (key ? fromKey(key).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

/**
 * Section B: booking history. Clicking a row opens the existing booking details drawer (the profile page renders it).
 * `counts` come from the API so the tabs can show how many bookings are in each.
 */
export default function ClientBookings({ bookings, counts, filter, onFilter, loading, error, onRetry, onOpen }) {
  const rows = bookings ?? [];
  return (
    <section className="panel cl-section" aria-labelledby="cl-bookings-title" aria-busy={loading}>
      <div className="panel__head">
        <h2 className="panel__title" id="cl-bookings-title">Booking history</h2>
      </div>

      <div className="cl-tabs bk__tabs" role="group" aria-label="Filter bookings">
        {BOOKING_FILTERS.map(({ value, label }) => (
          <button key={value} type="button" className={cx('bk-tab', filter === value && 'is-active')} aria-pressed={filter === value} onClick={() => onFilter(value)}>
            {label}
            {counts && <span className="bk-tab__count">{counts[value] ?? 0}</span>}
          </button>
        ))}
      </div>

      {error && <EmptyState icon={<CloudOff size={28} />} title="Couldn't load bookings" message={error} action={<Button onClick={onRetry}>Try again</Button>} />}
      {!error && !bookings && loading && <div className="bk-skeletons">{[0, 1, 2].map((i) => <span key={i} className="skeleton bk-skeleton" aria-hidden="true" />)}</div>}
      {!error && bookings && rows.length === 0 && (
        <EmptyState
          icon={<CalendarX size={28} />}
          title={filter === 'all' ? 'No bookings yet' : 'No bookings in this view'}
          message={filter === 'all' ? 'Bookings made with this phone number will appear here.' : 'Try another filter.'}
        />
      )}

      {!error && rows.length > 0 && (
        <>
          <div className="cl-bk-head" aria-hidden="true">
            <span>Booking</span><span>Service</span><span>Event date</span><span>Time</span><span>Status</span><span>Created</span><span />
          </div>
          <ul className={cx('bk-list', loading && 'is-loading')}>
            {rows.map((b) => {
              const meta = STATUS_META[b.status] ?? STATUS_META.pending;
              return (
                <li key={b.reference}>
                  <button type="button" className="cl-bk-row" onClick={() => onOpen(b.reference)} aria-label={`Open booking ${b.reference}`}>
                    <span className="cl-cell cl-cell--ref"><strong>{b.reference}</strong></span>
                    <span className="cl-cell"><span>{labelOf(SHOOT_TYPES, b.shootType) || b.shootType}</span>{b.packageName && <small>{b.packageName}</small>}</span>
                    <span className="cl-cell"><span>{shootDate(b.date)}</span></span>
                    <span className="cl-cell"><span>{formatTime(b.time)}</span></span>
                    <span className="cl-cell cl-cell--status"><Badge variant={meta.variant}>{meta.label}</Badge></span>
                    <span className="cl-cell cl-cell--created"><small>Requested {shortDate(b.createdAt)}</small></span>
                    <ChevronRight size={18} className="cl-bk-row__chevron" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
