import { useMemo, useState } from 'react';
import { CalendarDays, Copy, Plus, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import Button from '../../common/Button';
import ConfirmModal from '../../common/ConfirmModal';
import Input from '../../common/Input';
import Modal from '../../common/Modal';
import BlockedDayModal from '../BlockedDayModal';
import useFetch from '../../../hooks/useFetch';
import useSettingsForm from '../../../hooks/useSettingsForm';
import { useFormatters } from '../../../hooks/useSettings';
import { deleteBlockedDate } from '../../../services/adminService';
import { listBlockedDates } from '../../../services/settingsService';
import { END_HOURS, START_HOURS, WEEKDAY_LABELS, copyDay, nextPeriod, periodsProblem } from '../../../utils/settingsUtils';
import { EVENT_TYPES } from '../../../utils/calendarEvents';
import { cx } from '../../../utils/helpers';
import { Card, Notice, SaveBar, Toggle } from './ui';

const todayKeyIn = (tz) => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); } catch { return new Date().toISOString().slice(0, 10); } };

const validate = (d, limits) => {
  const found = {};
  for (const [day, v] of Object.entries(d.weekly)) {
    if (v.enabled && v.periods.length === 0) found[`weekly.${day}`] = 'Add at least one working period, or mark the day as unavailable.';
    else if (v.enabled) { const p = periodsProblem(v.periods, { maxPeriods: limits.maxPeriodsPerDay }); if (p) found[`weekly.${day}`] = p; }
  }
  const seen = new Set();
  d.specialDays.forEach((s, i) => {
    if (!s.date) found[`specialDays.${i}.date`] = 'Choose a date.';
    else if (seen.has(s.date)) found[`specialDays.${i}.date`] = 'That date is already listed.';
    seen.add(s.date);
    const p = s.periods.length === 0 ? 'Add the working hours for this day.' : periodsProblem(s.periods, { maxPeriods: limits.maxPeriodsPerDay });
    if (p) found[`specialDays.${i}.periods`] = p;
  });
  return found;
};

/** One row of working periods: [09:00 ▾] to [12:00 ▾] ✕  … + Add hours */
function PeriodsEditor({ periods, onChange, idPrefix, error, label, max }) {
  const update = (i, patch) => onChange(periods.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  return (
    <div className="st-periods" role="group" aria-label={label}>
      {periods.map((p, i) => (
        <div className="st-period" key={i}>
          <select aria-label={`${label}: start ${i + 1}`} id={`${idPrefix}-s${i}`} value={p.start} onChange={(e) => update(i, { start: e.target.value })}>
            {START_HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
          <span aria-hidden="true">to</span>
          <select aria-label={`${label}: end ${i + 1}`} id={`${idPrefix}-e${i}`} value={p.end} onChange={(e) => update(i, { end: e.target.value })}>
            {END_HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
          <button type="button" className="st-iconbtn" aria-label={`Remove ${label} period ${i + 1}`} onClick={() => onChange(periods.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
        </div>
      ))}
      <Button variant="ghost" size="sm" icon={<Plus size={14} />} disabled={periods.length >= max} onClick={() => onChange([...periods, nextPeriod(periods)])}>Add hours</Button>
      {error && <p className="field__error" role="alert">{error}</p>}
    </div>
  );
}

/**
 * Settings → Availability.
 *  1. Weekly hours and special working days (saved together with the Save button).
 *  2. Closures (holidays, vacation, fully booked …): the same blocked dates as the Calendar page. They save straight away.
 * Customers can only book hours that are open AND not blocked AND not already booked. Existing bookings are never changed here.
 */
export default function AvailabilitySettings({ saved, options, general, token, onSaved, report }) {
  const limits = options.limits;
  const f = useSettingsForm({ group: 'availability', saved, token, onSaved, report, validate: (d) => validate(d, limits) });
  const { draft: d, errors: e } = f;
  const { formatDate } = useFormatters();
  const today = todayKeyIn(general.timezone);

  const [copyFrom, setCopyFrom] = useState(null);
  const [copyTo, setCopyTo] = useState([]);
  const [blockOpen, setBlockOpen] = useState(false);
  const [toRemove, setToRemove] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [closureNotice, setClosureNotice] = useState(null);

  const closures = useFetch(() => listBlockedDates(token, { from: today }), [token, today]);
  const warning = f.response?.warnings?.bookingsOutsideHours;

  const setDay = (day, patch) => f.set(`weekly.${day}`, { ...d.weekly[day], ...patch });
  const toggleDay = (day, on) => setDay(day, on ? { enabled: true, periods: d.weekly[day].periods.length ? d.weekly[day].periods : [nextPeriod([])] } : { enabled: false });

  const openCopy = (day) => { setCopyFrom(day); setCopyTo([]); };
  const applyCopy = () => { f.set('weekly', copyDay(d.weekly, copyFrom, copyTo)); setCopyFrom(null); };

  const setSpecial = (i, patch) => f.set('specialDays', d.specialDays.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const addSpecial = () => f.set('specialDays', [...d.specialDays, { date: '', periods: [nextPeriod([])], reason: '' }]);
  const removeSpecial = (i) => f.set('specialDays', d.specialDays.filter((_, j) => j !== i));

  const confirmRemove = async () => {
    setRemoving(true);
    try { await deleteBlockedDate(token, toRemove.id); setClosureNotice({ tone: 'ok', text: `${formatDate(toRemove.date)} is open for booking again.` }); closures.reload(); }
    catch (err) { setClosureNotice({ tone: 'error', text: err.message }); } finally { setRemoving(false); setToRemove(null); }
  };

  const closureRows = useMemo(() => closures.data ?? [], [closures.data]);

  return (
    <div className="st-stack">
      <form className="st-form" onSubmit={(ev) => { ev.preventDefault(); f.save(); }} noValidate>
        <Card title="Weekly working hours" description={`Customers can only book inside these hours (${general.timezone}). You can add several periods in a day, for example a lunch break.`}>
          <ul className="st-week">
            {options.weekdays.map((day) => {
              const v = d.weekly[day];
              return (
                <li key={day} className={cx('st-day', !v.enabled && 'is-off')}>
                  <div className="st-day__head">
                    <Toggle id={`wk-${day}`} label={WEEKDAY_LABELS[day]} checked={v.enabled} onChange={(on) => toggleDay(day, on)} />
                    {v.enabled && <Button variant="ghost" size="sm" icon={<Copy size={14} />} onClick={() => openCopy(day)}>Copy to…</Button>}
                  </div>
                  {v.enabled
                    ? <PeriodsEditor periods={v.periods} idPrefix={`wk-${day}`} label={WEEKDAY_LABELS[day]} max={limits.maxPeriodsPerDay} error={e[`weekly.${day}`]} onChange={(p) => setDay(day, { periods: p })} />
                    : <p className="st-day__off">Unavailable: customers cannot book this day.</p>}
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title="Special working days" description="Open a day that is normally closed, or give one date different hours (a festival, a one-off shoot day). These replace the weekly hours for that date.">
          {d.specialDays.length === 0 && <p className="st-muted">No special working days.</p>}
          <ul className="st-specials">
            {d.specialDays.map((s, i) => (
              <li key={s.id ?? `new-${i}`} className="st-special">
                <div className="st-grid">
                  <Input id={`sp-date-${i}`} label="Date" type="date" min={today} value={s.date} onChange={(ev) => setSpecial(i, { date: ev.target.value })} error={e[`specialDays.${i}.date`]} />
                  <Input id={`sp-reason-${i}`} label="Reason (optional)" maxLength={120} value={s.reason ?? ''} onChange={(ev) => setSpecial(i, { reason: ev.target.value })} error={e[`specialDays.${i}.reason`]} />
                </div>
                <PeriodsEditor periods={s.periods} idPrefix={`sp-${i}`} label={`Special day ${i + 1}`} max={limits.maxPeriodsPerDay} error={e[`specialDays.${i}.periods`]} onChange={(p) => setSpecial(i, { periods: p })} />
                <Button variant="ghost" size="sm" className="st-danger" icon={<Trash2 size={14} />} onClick={() => removeSpecial(i)}>Remove this day</Button>
              </li>
            ))}
          </ul>
          {e.specialDays && <p className="field__error" role="alert">{e.specialDays}</p>}
          <Button variant="outline" size="sm" icon={<Plus size={14} />} onClick={addSpecial} disabled={d.specialDays.length >= limits.maxSpecialDays}>Add special working day</Button>
        </Card>

        {warning && (
          <Notice tone="warn">
            Saved. {warning.count} upcoming booking{warning.count === 1 ? ' is' : 's are'} now outside your working hours. They were not changed or cancelled:
            {' '}{warning.examples.slice(0, 5).map((b) => `${b.reference} (${formatDate(b.date)}, ${b.time})`).join('; ')}{warning.count > 5 ? '…' : ''}. Check them in Bookings.
          </Notice>
        )}
        <SaveBar dirty={f.dirty} saving={f.saving} onSave={f.save} onReset={f.reset} status={f.status} />
      </form>

      <div className="st-card">
        <div className="st-card__head st-card__head--row">
          <div>
            <h3 className="st-card__title">Holidays, vacations and closed dates</h3>
            <p className="st-card__desc">Whole days or just some hours that customers cannot book. These are the same dates as on your <Link to="/admin/calendar">Calendar</Link>, and they always win over working hours.</p>
          </div>
          <Button icon={<CalendarDays size={16} />} onClick={() => { setClosureNotice(null); setBlockOpen(true); }}>Add closed dates</Button>
        </div>
        <div className="st-card__body">
          <Notice tone={closureNotice?.tone} onDismiss={() => setClosureNotice(null)}>{closureNotice?.text}</Notice>
          {closures.error && <Notice tone="error">{closures.error} <button type="button" className="panel__retry" onClick={closures.reload}>Try again</button></Notice>}
          {!closures.error && closures.loading && !closures.data && <p className="st-muted">Loading…</p>}
          {!closures.error && !closures.loading && closureRows.length === 0 && <p className="st-muted">No upcoming closed dates.</p>}
          {closureRows.length > 0 && (
            <ul className="st-closures">
              {closureRows.map((b) => (
                <li key={b.id} className="st-closure">
                  <span className={cx('st-closure__dot', `ev--${b.type}`)} aria-hidden="true" />
                  <span className="st-closure__date">{formatDate(b.date)}</span>
                  <span className="st-closure__type">{EVENT_TYPES[b.type]?.label ?? b.type}{b.blockedTimes?.length ? ` · ${b.blockedTimes[0]}${b.blockedTimes.length > 1 ? ` +${b.blockedTimes.length - 1}` : ''}` : ''}</span>
                  <span className="st-closure__reason">{b.reason}</span>
                  <button type="button" className="st-iconbtn" aria-label={`Remove closed date ${formatDate(b.date)}`} onClick={() => setToRemove(b)}><Trash2 size={15} /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <BlockedDayModal isOpen={blockOpen} onClose={() => setBlockOpen(false)} onDone={({ created, skipped }) => { setBlockOpen(false); closures.reload(); setClosureNotice({ tone: 'ok', text: `${created} date${created === 1 ? '' : 's'} closed${skipped ? ` (${skipped} already were)` : ''}.` }); }} />

      <ConfirmModal isOpen={!!toRemove} onClose={() => setToRemove(null)} onConfirm={confirmRemove} loading={removing} title="Open this date again?"
        message={toRemove ? `${formatDate(toRemove.date)} (${EVENT_TYPES[toRemove.type]?.label ?? toRemove.type}) will be bookable again, within your working hours.` : ''} confirmText="Open it again" />

      <Modal isOpen={copyFrom !== null} onClose={() => setCopyFrom(null)} title={copyFrom ? `Copy ${WEEKDAY_LABELS[copyFrom]}'s hours to…` : ''} size="sm"
        footer={(<><Button variant="ghost" onClick={() => setCopyFrom(null)}>Cancel</Button><Button onClick={applyCopy} disabled={copyTo.length === 0}>Copy</Button></>)}>
        <div className="st-copy">
          {copyFrom && options.weekdays.filter((day) => day !== copyFrom).map((day) => (
            <label key={day}><input type="checkbox" checked={copyTo.includes(day)} onChange={(ev) => setCopyTo((c) => (ev.target.checked ? [...c, day] : c.filter((x) => x !== day)))} /> {WEEKDAY_LABELS[day]}</label>
          ))}
          <small>You still need to press Save after copying.</small>
        </div>
      </Modal>
    </div>
  );
}
