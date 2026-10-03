import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import Loader from '../common/Loader';
import StepNav from './StepNav';
import useBooking from '../../hooks/useBooking';
import { cx } from '../../utils/helpers';
import { getAvailability, getTimeSlots } from '../../services/bookingService';
import { formatDate, formatTime, toKey } from './bookingData';
import { validateDateTime } from './bookingValidation';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const STATUS_TEXT = { available: 'available', limited: 'limited availability', unavailable: 'unavailable' };

export default function DateTimePicker() {
  const { values, update, next, selectedPackage } = useBooking();
  const [errors, setErrors] = useState({});

  const today = useMemo(() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; }, []);
  const initial = values.date ? new Date(`${values.date}T00:00:00`) : today;
  const [view, setView] = useState({ year: initial.getFullYear(), month: initial.getMonth() });

  const [availability, setAvailability] = useState(null); // null while loading
  const [slots, setSlots] = useState(null);

  // Month availability (swap for a backend call in bookingService later)
  useEffect(() => {
    let cancelled = false;
    setAvailability(null);
    getAvailability(view.year, view.month).then((a) => { if (!cancelled) setAvailability(a); });
    return () => { cancelled = true; };
  }, [view]);

  // Time slots for the chosen date
  useEffect(() => {
    if (!values.date) { setSlots(null); return undefined; }
    let cancelled = false;
    setSlots(null);
    getTimeSlots(values.date).then((s) => { if (!cancelled) setSlots(s); });
    return () => { cancelled = true; };
  }, [values.date]);

  const firstWeekday = new Date(view.year, view.month, 1).getDay();
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const monthLabel = new Date(view.year, view.month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const atCurrentMonth = view.year === today.getFullYear() && view.month === today.getMonth();

  const shiftMonth = (delta) => setView(({ year, month }) => {
    const d = new Date(year, month + delta, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const pickDate = (key) => { update({ date: key, time: '' }); setErrors({}); };
  const pickTime = (time) => { update({ time }); setErrors({}); };

  const onNext = () => {
    const found = validateDateTime(values);
    setErrors(found);
    if (!Object.keys(found).length) next();
  };

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div className="step">
      <div className="dt">
        {/* ---------- Calendar ---------- */}
        <section aria-labelledby="dt-date">
          <h2 id="dt-date" className="block__title">Select a date</h2>
          <div className="cal">
            <div className="cal__head">
              <button type="button" onClick={() => shiftMonth(-1)} disabled={atCurrentMonth} aria-label="Previous month"><ChevronLeft size={18} /></button>
              <span className="cal__month" aria-live="polite">{monthLabel}</span>
              <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month"><ChevronRight size={18} /></button>
            </div>

            <div className="cal__grid" role="grid" aria-label={monthLabel}>
              {WEEKDAYS.map((d) => <span key={d} className="cal__weekday" role="columnheader">{d}</span>)}
              {Array.from({ length: firstWeekday }, (_, i) => <span key={`b${i}`} />)}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1;
                const key = toKey(new Date(view.year, view.month, day));
                const status = availability?.[key] ?? 'unavailable';
                const selected = values.date === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="gridcell"
                    disabled={!availability || status === 'unavailable'}
                    aria-pressed={selected}
                    aria-label={`${formatDate(key)}, ${STATUS_TEXT[status]}`}
                    className={cx('cal__day', `is-${status}`, selected && 'is-selected')}
                    onClick={() => pickDate(key)}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            <ul className="cal__legend">
              <li><i className="dot dot--available" /> Available</li>
              <li><i className="dot dot--limited" /> Limited</li>
              <li><i className="dot dot--unavailable" /> Unavailable</li>
            </ul>
          </div>
          {errors.date && <p className="field__error" role="alert">{errors.date}</p>}
        </section>

        {/* ---------- Time slots ---------- */}
        <section aria-labelledby="dt-time">
          <h2 id="dt-time" className="block__title">Select a time</h2>
          <p className="block__hint">All times shown in your local time ({timeZone}).</p>

          {!values.date && <p className="dt__empty">Choose a date to see available times.</p>}
          {values.date && !slots && <div className="dt__empty"><Loader label="Loading times" /></div>}
          {values.date && slots && (
            <div className="slots" role="radiogroup" aria-label={`Times on ${formatDate(values.date)}`}>
              {slots.map(({ time, available }) => {
                const selected = values.time === time;
                return (
                  <button key={time} type="button" role="radio" aria-checked={selected} disabled={!available}
                    className={cx('slot', selected && 'is-selected')} onClick={() => pickTime(time)}>
                    {formatTime(time)} {selected && <Check size={15} />}
                  </button>
                );
              })}
            </div>
          )}
          {errors.time && <p className="field__error" role="alert">{errors.time}</p>}

          <p className="dt__note"><Clock size={15} /> Standard shoot duration: {selectedPackage?.duration ?? 'up to 2 hours'}.</p>
        </section>
      </div>

      <StepNav onNext={onNext} />
    </div>
  );
}
