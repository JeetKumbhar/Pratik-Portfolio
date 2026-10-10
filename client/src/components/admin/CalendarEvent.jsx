import { Link } from 'react-router-dom';
import { Unlock } from 'lucide-react';
import Badge from '../common/Badge';
import { formatTime, fromKey } from '../booking/bookingData';
import { cx } from '../../utils/helpers';

/**
 * One thing on the calendar.
 *   variant="chip"  a tiny coloured label inside a day cell
 *   variant="row"   a full line in the selected-day panel (bookings link to their details; blocks can be removed)
 */
export default function CalendarEvent({ event, variant = 'row', onRemove }) {
  const colour = `ev--${event.type}`;
  const shortDate = (key) => fromKey(key).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  if (variant === 'chip') {
    return <span className={cx('cev-chip', colour)}>{event.kind === 'booking' ? event.subtitle : event.title}</span>;
  }

  const when = event.kind === 'booking'
    ? `${formatTime(event.time)} · ${event.hours}h`
    : event.allDay ? 'All day' : event.times.map(formatTime).join(', ');
  const detail = [event.subtitle, when].filter(Boolean).join(' · ');

  return (
    <div className={cx('cev', colour)}>
      <div className="cev__main">
        <p className="cev__title">
          {event.kind === 'booking' ? <Link to={`/admin/bookings?view=${event.reference}`}>{event.title}</Link> : event.title}
          {event.status === 'pending' && <Badge variant="warning">Pending</Badge>}
        </p>
        <p className="cev__sub">{detail}{event.kind === 'booking' && <small> · {event.reference}</small>}</p>
        {event.note && <p className="cev__note">{event.note}</p>}
        {event.group && <p className="cev__note">Part of a {event.group.count}-day block ({shortDate(event.group.start)} to {shortDate(event.group.end)})</p>}
      </div>
      {onRemove && event.kind === 'block' && (
        <button type="button" className="cev__unblock" onClick={() => onRemove(event)} aria-label={`Unblock ${event.title}`}>
          <Unlock size={14} /> Unblock
        </button>
      )}
    </div>
  );
}
