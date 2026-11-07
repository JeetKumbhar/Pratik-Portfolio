import { ChevronRight } from 'lucide-react';
import Badge from '../common/Badge';
import { useFormatters } from '../../hooks/useSettings';
import { STATUS_META } from '../../utils/bookingStatus';
import { cx } from '../../utils/helpers';

/** One booking in the list. The whole row is a button that opens the details drawer. */
export default function BookingRow({ booking: b, active, onOpen }) {
  const meta = STATUS_META[b.status] ?? STATUS_META.pending;
  const { money, formatDate, formatTime, serviceLabel } = useFormatters();

  return (
    <li>
      <button type="button" className={cx('bk-row', active && 'is-active')} onClick={() => onOpen(b.reference)} aria-label={`Open booking ${b.reference}, ${b.name}`}>
        <span className="bk-cell bk-cell--who"><strong>{b.name}</strong><small>{b.reference}</small></span>
        <span className="bk-cell bk-cell--shoot">{serviceLabel(b.shootType, b.shootTypeName)}<small>{b.numberOfPeople} {b.numberOfPeople === 1 ? 'person' : 'people'}</small></span>
        <span className="bk-cell bk-cell--when">{formatDate(b.date)}<small>{formatTime(b.time)} · {b.package?.durationHours}h</small></span>
        <span className="bk-cell bk-cell--pkg">{b.package?.name}<small>{b.package?.price != null ? money(b.package.price) : 'Custom quote'}</small></span>
        <span className="bk-cell bk-cell--status"><Badge variant={meta.variant}>{meta.label}</Badge></span>
        <ChevronRight size={18} className="bk-row__chevron" aria-hidden="true" />
      </button>
    </li>
  );
}
