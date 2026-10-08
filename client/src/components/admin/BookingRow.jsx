import { ChevronRight } from 'lucide-react';
import Badge from '../common/Badge';
import { SHOOT_TYPES, formatTime, fromKey, labelOf, money } from '../booking/bookingData';
import { STATUS_META } from '../../utils/bookingStatus';
import { cx } from '../../utils/helpers';

const shortDate = (key) => fromKey(key).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** One booking in the list. The whole row is a button that opens the details drawer. */
export default function BookingRow({ booking: b, active, onOpen }) {
  const meta = STATUS_META[b.status] ?? STATUS_META.pending;

  return (
    <li>
      <button type="button" className={cx('bk-row', active && 'is-active')} onClick={() => onOpen(b.reference)} aria-label={`Open booking ${b.reference}, ${b.name}`}>
        <span className="bk-cell bk-cell--who"><strong>{b.name}</strong><small>{b.reference}</small></span>
        <span className="bk-cell bk-cell--shoot">{labelOf(SHOOT_TYPES, b.shootType) || b.shootType}<small>{b.numberOfPeople} {b.numberOfPeople === 1 ? 'person' : 'people'}</small></span>
        <span className="bk-cell bk-cell--when">{shortDate(b.date)}<small>{formatTime(b.time)} · {b.package?.durationHours}h</small></span>
        <span className="bk-cell bk-cell--pkg">{b.package?.name}<small>{b.package?.price != null ? money(b.package.price) : 'Custom quote'}</small></span>
        <span className="bk-cell bk-cell--status"><Badge variant={meta.variant}>{meta.label}</Badge></span>
        <ChevronRight size={18} className="bk-row__chevron" aria-hidden="true" />
      </button>
    </li>
  );
}
