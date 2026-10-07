import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import useAuth from '../../hooks/useAuth';
import useFetch from '../../hooks/useFetch';
import { getAdminCalendar } from '../../services/adminService';
import { formatDate, formatTime, toKey } from '../booking/bookingData';
import { cx } from '../../utils/helpers';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const BLOCK_LABELS = { offline_booking: 'Offline booking', editing: 'Editing', vacation: 'Vacation', personal: 'Personal', other: 'Other' };
const pad = (n) => String(n).padStart(2, '0');

/** Month overview from GET /api/availability/admin/calendar: gold dot = bookings, blue dot = blocked time. */
export default function AdminCalendar({ refreshKey = 0 }) {
  const { token } = useAuth();
  const today = new Date();
  const todayKey = toKey(today);
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [selected, setSelected] = useState(todayKey);

  const { data, loading, error, reload } = useFetch(
    () => getAdminCalendar(token, view.year, view.month + 1),
    [token, view.year, view.month, refreshKey]
  );

  const days = data ?? [];
  const byDate = Object.fromEntries(days.map((d) => [d.date, d]));
  const firstWeekday = new Date(view.year, view.month, 1).getDay();
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const monthLabel = new Date(view.year, view.month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const prefix = `${view.year}-${pad(view.month + 1)}-`;
  const activeKey = selected?.startsWith(prefix) ? selected : null;
  const detail = activeKey ? byDate[activeKey] : null;

  const shift = (delta) => setView(({ year, month }) => {
    const d = new Date(year, month + delta, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const goToday = () => { setView({ year: today.getFullYear(), month: today.getMonth() }); setSelected(todayKey); };

  return (
    <section className="panel" aria-labelledby="acal-title">
      <header className="panel__head">
        <h2 id="acal-title" className="panel__title">Calendar</h2>
        <Link to="/admin/calendar" className="panel__link">Manage <ArrowRight size={14} /></Link>
      </header>

      <div className="acal">
        <div className="acal__nav">
          <button type="button" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft size={18} /></button>
          <span className="acal__month" aria-live="polite">{monthLabel}</span>
          <button type="button" onClick={() => shift(1)} aria-label="Next month"><ChevronRight size={18} /></button>
          <button type="button" className="acal__today" onClick={goToday}>Today</button>
        </div>

        <div className={cx('acal__grid', loading && 'is-loading')} role="grid" aria-label={monthLabel} aria-busy={loading}>
          {WEEKDAYS.map((d) => <span key={d} className="acal__weekday" role="columnheader">{d}</span>)}
          {Array.from({ length: firstWeekday }, (_, i) => <span key={`b${i}`} />)}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const key = `${prefix}${pad(i + 1)}`;
            const day = byDate[key];
            const bookingCount = day?.bookings.length ?? 0;
            const blockCount = day?.blocks.length ?? 0;
            return (
              <button
                key={key}
                type="button"
                role="gridcell"
                aria-pressed={key === activeKey}
                aria-label={`${formatDate(key)}${bookingCount ? `, ${bookingCount} booking${bookingCount > 1 ? 's' : ''}` : ''}${blockCount ? `, ${blockCount} block${blockCount > 1 ? 's' : ''}` : ''}`}
                className={cx('acal__day', key === todayKey && 'is-today', key < todayKey && 'is-past', key === activeKey && 'is-selected')}
                onClick={() => setSelected(key)}
              >
                {i + 1}
                <span className="acal__dots" aria-hidden="true">
                  {bookingCount > 0 && <i className="acal__dot acal__dot--booking" />}
                  {blockCount > 0 && <i className="acal__dot acal__dot--block" />}
                </span>
              </button>
            );
          })}
        </div>

        <ul className="acal__legend">
          <li><i className="acal__dot acal__dot--booking" /> Booking</li>
          <li><i className="acal__dot acal__dot--block" /> Blocked / unavailable</li>
        </ul>

        {error && (
          <p className="panel__state" role="alert">{error} <button type="button" className="panel__retry" onClick={reload}>Try again</button></p>
        )}

        {!error && activeKey && (
          <div className="acal__detail" aria-live="polite">
            <h3 className="acal__detail-title">{formatDate(activeKey)}</h3>
            {!detail && loading && <p className="acal__empty">Loading…</p>}
            {detail && detail.bookings.length === 0 && detail.blocks.length === 0 && <p className="acal__empty">Nothing scheduled. This day is free.</p>}
            {detail?.bookings.map((b) => (
              <p key={b.reference} className="acal__item acal__item--booking">
                <strong>{formatTime(b.time)}</strong> {b.name} <small>{b.reference} · {b.hours}h</small>
              </p>
            ))}
            {detail?.blocks.map((b, i) => (
              <p key={`${b.type}-${i}`} className="acal__item acal__item--block">
                <strong>{BLOCK_LABELS[b.type] ?? b.type}</strong>
                {b.reason ? ` · ${b.reason}` : ''}
                <small>{b.allDay ? 'All day' : b.blockedTimes.map(formatTime).join(', ')}</small>
              </p>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
