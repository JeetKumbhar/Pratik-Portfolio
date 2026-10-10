import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import Button from '../common/Button';
import Modal from '../common/Modal';
import CalendarEvent from './CalendarEvent';
import useAuth from '../../hooks/useAuth';
import useFetch from '../../hooks/useFetch';
import { deleteBlockedDate, getAdminCalendar } from '../../services/adminService';
import { SHOOT_TYPES, formatDate, labelOf, toKey } from '../booking/bookingData';
import { BLOCK_TYPES, EVENT_TYPES, buildEvents, typesOf } from '../../utils/calendarEvents';
import { cx } from '../../utils/helpers';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n) => String(n).padStart(2, '0');
const shootLabel = (type) => labelOf(SHOOT_TYPES, type) || type;

/**
 * Month calendar from GET /api/availability/admin/calendar.
 *   variant="compact"  dashboard: coloured dots + the selected day's events
 *   variant="full"     Calendar page: event labels inside the days, "Block dates" and removing blocks
 * onBlockDay(dateKey) is called when you ask to block a day (the page opens <BlockedDayModal />).
 */
export default function AdminCalendar({ variant = 'compact', refreshKey = 0, onBlockDay, onChanged }) {
  const full = variant === 'full';
  const { token } = useAuth();
  const today = new Date();
  const todayKey = toKey(today);
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [selected, setSelected] = useState(todayKey);
  const [toRemove, setToRemove] = useState(null);
  const [removing, setRemoving] = useState(''); // '' | 'day' | 'group' (which button is working)
  const [removeError, setRemoveError] = useState('');

  const { data, loading, error, reload } = useFetch(
    () => getAdminCalendar(token, view.year, view.month + 1),
    [token, view.year, view.month, refreshKey]
  );

  const byDate = useMemo(
    () => Object.fromEntries((data ?? []).map((d) => [d.date, { ...d, events: buildEvents(d, shootLabel) }])),
    [data]
  );

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

  // scope 'day' = just this block, 'group' = the whole series it was created with
  const confirmRemove = async (scope) => {
    setRemoving(scope);
    setRemoveError('');
    try {
      const result = await deleteBlockedDate(token, toRemove.blockId, scope === 'group' ? 'group' : undefined);
      reload();
      onChanged?.({ removed: result.removed ?? 1 });
    } catch (err) {
      setRemoveError(err.message);
    } finally {
      setRemoving('');
      setToRemove(null);
    }
  };

  const legend = full ? ['booking', ...BLOCK_TYPES] : ['booking', 'blocked'];

  return (
    <section className="panel" aria-labelledby="acal-title">
      <header className="panel__head">
        <h2 id="acal-title" className="panel__title">Calendar</h2>
        {full ? (
          <Button size="sm" icon={<Plus size={15} />} onClick={() => onBlockDay?.(activeKey && activeKey >= todayKey ? activeKey : todayKey)}>Block dates</Button>
        ) : (
          <Link to="/admin/calendar" className="panel__link">Manage <ArrowRight size={14} /></Link>
        )}
      </header>

      <div className={cx('acal', full && 'acal--full')}>
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
            const events = byDate[key]?.events ?? [];
            const wholeDay = events.find((e) => e.kind === 'block' && e.allDay);
            return (
              <button
                key={key}
                type="button"
                role="gridcell"
                aria-pressed={key === activeKey}
                aria-label={`${formatDate(key)}: ${events.length ? events.map((e) => e.title).join(', ') : 'free'}`}
                className={cx('acal__day', key === todayKey && 'is-today', key < todayKey && 'is-past', key === activeKey && 'is-selected', wholeDay && `ev--${wholeDay.type} is-blocked`)}
                onClick={() => setSelected(key)}
              >
                <span className="acal__num">{i + 1}</span>
                <span className="acal__dots" aria-hidden="true">
                  {typesOf(events).slice(0, 3).map((t) => <i key={t} className={cx('acal__dot', `ev--${t}`)} />)}
                </span>
                {full && (
                  <span className="acal__chips" aria-hidden="true">
                    {events.slice(0, 2).map((e) => <CalendarEvent key={e.id} event={e} variant="chip" />)}
                    {events.length > 2 && <span className="acal__more">+{events.length - 2} more</span>}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <ul className="acal__legend">
          {legend.map((t) => (
            <li key={t}>
              <i className={cx('acal__dot', t === 'blocked' ? 'ev--other' : `ev--${t}`)} />
              {t === 'blocked' ? 'Blocked / unavailable' : EVENT_TYPES[t].label}
            </li>
          ))}
        </ul>

        {error && <p className="panel__state" role="alert">{error} <button type="button" className="panel__retry" onClick={reload}>Try again</button></p>}
        {removeError && <p className="form-alert" role="alert">{removeError}</p>}

        {!error && activeKey && (
          <div className="acal__detail" aria-live="polite">
            <div className="acal__detail-head">
              <h3 className="acal__detail-title">{formatDate(activeKey)}</h3>
              {full && activeKey >= todayKey && (
                <Button variant="ghost" size="sm" icon={<Plus size={14} />} onClick={() => onBlockDay?.(activeKey)}>Block this day</Button>
              )}
            </div>
            {!detail && loading && <p className="acal__empty">Loading…</p>}
            {detail && detail.events.length === 0 && <p className="acal__empty">Nothing scheduled: this day is available.</p>}
            {detail?.events.map((e) => (
              <CalendarEvent key={e.id} event={e} onRemove={full ? setToRemove : undefined} />
            ))}
          </div>
        )}
      </div>

      <Modal
        isOpen={!!toRemove}
        onClose={() => !removing && setToRemove(null)}
        title={toRemove?.group ? `Unblock ${toRemove.title.toLowerCase()}?` : 'Unblock this?'}
        size="sm"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setToRemove(null)} disabled={!!removing}>Cancel</Button>
            {toRemove?.group && (
              <Button variant="outline" onClick={() => confirmRemove('day')} loading={removing === 'day'} disabled={!!removing}>This day only</Button>
            )}
            <Button variant="danger" onClick={() => confirmRemove(toRemove?.group ? 'group' : 'day')}
              loading={removing === (toRemove?.group ? 'group' : 'day')} disabled={!!removing}>
              {toRemove?.group ? `All ${toRemove.group.count} days` : 'Unblock'}
            </Button>
          </>
        )}
      >
        {toRemove && (
          <p className="confirm__message">
            {toRemove.group
              ? `This day is part of a ${toRemove.group.count}-day ${toRemove.title.toLowerCase()} (${formatDate(toRemove.group.start)} to ${formatDate(toRemove.group.end)}). Unblock just this day, or the whole series? Customers can book unblocked time again straight away.`
              : `${toRemove.title} on ${formatDate(activeKey ?? todayKey)} will be removed, and ${toRemove.allDay ? 'the whole day' : 'those hours'} can be booked again straight away.`}
          </p>
        )}
      </Modal>
    </section>
  );
}
