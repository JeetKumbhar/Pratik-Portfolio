import { CalendarX, ChevronLeft, ChevronRight, CloudOff } from 'lucide-react';
import EmptyState from '../common/EmptyState';
import Button from '../common/Button';
import BookingRow from './BookingRow';
import { cx } from '../../utils/helpers';

/** The list + loading/error/empty states + pagination. All data comes from the Bookings page. */
export default function BookingTable({
  bookings = [], loading, error, onRetry, onOpen, activeRef,
  page = 1, pages = 1, total = 0, pageSize = 15, onPage, filtered = false,
}) {
  const hasRows = bookings.length > 0;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <section className="bk-table" aria-busy={loading}>
      <div className="bk-head" aria-hidden="true">
        <span>Customer</span><span>Shoot</span><span>Date &amp; time</span><span>Package</span><span>Status</span><span />
      </div>

      {error && (
        <EmptyState icon={<CloudOff size={28} />} title="Couldn't load bookings" message={error} action={<Button onClick={onRetry}>Try again</Button>} />
      )}

      {!error && !hasRows && loading && (
        <div className="bk-skeletons">{[0, 1, 2, 3, 4].map((i) => <span key={i} className="skeleton bk-skeleton" aria-hidden="true" />)}</div>
      )}

      {!error && !hasRows && !loading && (
        <EmptyState
          icon={<CalendarX size={28} />}
          title={filtered ? 'No bookings match' : 'No bookings yet'}
          message={filtered ? 'Try a different search or clear the filters.' : 'Requests from the booking form will appear here.'}
        />
      )}

      {!error && hasRows && (
        <ul className={cx('bk-list', loading && 'is-loading')}>
          {bookings.map((b) => <BookingRow key={b.reference} booking={b} active={b.reference === activeRef} onOpen={onOpen} />)}
        </ul>
      )}

      {!error && total > 0 && (
        <footer className="bk-pager">
          <span>Showing {from}–{to} of {total}</span>
          <div>
            <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1 || loading} aria-label="Previous page"><ChevronLeft size={18} /></button>
            <span className="bk-pager__page">Page {page} of {pages}</span>
            <button type="button" onClick={() => onPage(page + 1)} disabled={page >= pages || loading} aria-label="Next page"><ChevronRight size={18} /></button>
          </div>
        </footer>
      )}
    </section>
  );
}
