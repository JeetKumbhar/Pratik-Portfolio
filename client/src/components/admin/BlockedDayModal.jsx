import { useEffect, useState } from 'react';
import { AlertTriangle, Calendar } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Input from '../common/Input';
import Select from '../common/Select';
import Textarea from '../common/Textarea';
import useAuth from '../../hooks/useAuth';
import { createBlockedDates } from '../../services/adminService';
import { formatDate, formatTime, fromKey, toKey } from '../booking/bookingData';
import { BLOCK_TYPES, EVENT_TYPES } from '../../utils/calendarEvents';
import { cx } from '../../utils/helpers';

const HOURS = Array.from({ length: 15 }, (_, i) => `${String(7 + i).padStart(2, '0')}:00`); // 07:00 to 21:00
const TYPE_OPTIONS = BLOCK_TYPES.map((value) => ({ value, label: EVENT_TYPES[value].label }));
const MAX_DAYS = 60;

const blank = (date, todayKey) => ({ type: 'editing', start: date || todayKey, end: '', allDay: true, times: [], reason: '', note: '' });

/**
 * "Block dates" dialog: pick a type, one day or a range, the whole day or only some hours.
 * If customer bookings are already in that time the server says so (409): you see them and can still choose "Block anyway".
 * onDone({ created, skipped }) is called after a successful save.
 */
export default function BlockedDayModal({ isOpen, onClose, initialDate = '', onDone }) {
  const { token } = useAuth();
  const todayKey = toKey(new Date());
  const [form, setForm] = useState(() => blank(initialDate, todayKey));
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [conflicts, setConflicts] = useState([]);
  const [saving, setSaving] = useState(false);

  // A fresh form every time the dialog opens
  useEffect(() => {
    if (!isOpen) return;
    setForm(blank(initialDate, todayKey));
    setErrors({});
    setSubmitError('');
    setConflicts([]);
  }, [isOpen, initialDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch) => {
    setForm((f) => ({ ...f, ...patch }));
    setConflicts([]); // what the admin asks for changed: the old warning no longer applies
    setSubmitError('');
  };

  const changeType = (type) => set({ type, ...(type === 'offline_booking' ? { allDay: false } : {}) }); // phone jobs usually cover a few hours
  const toggleHour = (hour) => set({ times: form.times.includes(hour) ? form.times.filter((h) => h !== hour) : [...form.times, hour].sort() });

  const days = form.start ? Math.round((fromKey(form.end || form.start) - fromKey(form.start)) / 86400000) + 1 : 0;

  const validate = () => {
    const e = {};
    if (!form.start) e.start = 'Choose a date.';
    else if (form.start < todayKey) e.start = 'Pick today or a later date.';
    if (form.end && form.end < form.start) e.end = "The end date can't be before the start date.";
    else if (days > MAX_DAYS) e.end = `At most ${MAX_DAYS} days at once.`;
    if (!form.allDay && form.times.length === 0) e.times = 'Pick at least one hour.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (force = false) => {
    if (!validate()) return;
    setSaving(true);
    setSubmitError('');
    try {
      const result = await createBlockedDates(token, {
        type: form.type,
        startDate: form.start,
        endDate: form.end || form.start,
        blockedTimes: form.allDay ? [] : form.times,
        reason: form.reason,
        note: form.note,
        force,
      });
      onDone?.({ created: result.created, skipped: result.skipped });
    } catch (err) {
      if (err.status === 409 && err.data?.conflicts) setConflicts(err.data.conflicts);
      else setSubmitError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const hasConflicts = conflicts.length > 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Block dates"
      size="md"
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant={hasConflicts ? 'danger' : 'primary'} onClick={() => submit(hasConflicts)} loading={saving}>
            {hasConflicts ? 'Block anyway' : days > 1 ? `Block ${days} days` : 'Block'}
          </Button>
        </>
      )}
    >
      <form className="block-form" onSubmit={(e) => { e.preventDefault(); submit(false); }} noValidate>
        <Select id="block-type" label="Type" options={TYPE_OPTIONS} value={form.type} onChange={(e) => changeType(e.target.value)} />

        <div className="block-form__dates">
          <Input id="block-start" type="date" label="From" required icon={<Calendar size={18} />} min={todayKey}
            value={form.start} onChange={(e) => set({ start: e.target.value })} error={errors.start} />
          <Input id="block-end" type="date" label="To (optional)" icon={<Calendar size={18} />} min={form.start || todayKey}
            value={form.end} onChange={(e) => set({ end: e.target.value })} error={errors.end}
            hint={days > 1 ? `${days} days` : 'Leave empty for a single day'} />
        </div>

        <fieldset className="block-form__when">
          <legend className="field__label">Which hours?</legend>
          <div className="block-form__toggle" role="group">
            <button type="button" className={cx('chip', form.allDay && 'is-selected')} aria-pressed={form.allDay} onClick={() => set({ allDay: true })}>Whole day</button>
            <button type="button" className={cx('chip', !form.allDay && 'is-selected')} aria-pressed={!form.allDay} onClick={() => set({ allDay: false })}>Only some hours</button>
          </div>
          {!form.allDay && (
            <div className="block-form__hours" role="group" aria-label="Hours to block">
              {HOURS.map((h) => (
                <button key={h} type="button" className={cx('chip', form.times.includes(h) && 'is-selected')} aria-pressed={form.times.includes(h)} onClick={() => toggleHour(h)}>
                  {formatTime(h)}
                </button>
              ))}
            </div>
          )}
          {errors.times && <p className="field__error" role="alert">{errors.times}</p>}
        </fieldset>

        <Input id="block-reason" label="Label (shown on your calendar)" maxLength={200} placeholder="e.g. Wedding for the Patels"
          value={form.reason} onChange={(e) => set({ reason: e.target.value })} />
        <Textarea id="block-note" label="Private note (optional)" maxLength={1000} rows={3}
          value={form.note} onChange={(e) => set({ note: e.target.value })} />

        {hasConflicts && (
          <div className="block-form__conflicts" role="alert">
            <p><AlertTriangle size={16} /> <strong>{conflicts.length === 1 ? 'A customer booking is' : `${conflicts.length} customer bookings are`} already in this time:</strong></p>
            <ul>
              {conflicts.map((c) => (
                <li key={c.reference}>{c.name} · {formatDate(c.date)} at {formatTime(c.time)} · {c.reference} ({c.status})</li>
              ))}
            </ul>
            <p>Blocking anyway does not cancel them: change those bookings yourself in Bookings.</p>
          </div>
        )}
        {submitError && <p className="form-alert" role="alert">{submitError}</p>}
        <button type="submit" className="sr-only" tabIndex={-1}>Block</button>
      </form>
    </Modal>
  );
}
