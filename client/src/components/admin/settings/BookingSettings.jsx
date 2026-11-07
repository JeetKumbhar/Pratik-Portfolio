import Input from '../../common/Input';
import Textarea from '../../common/Textarea';
import useSettingsForm from '../../../hooks/useSettingsForm';
import { Card, Notice, SaveBar, Toggle } from './ui';

/** The booking messages that belong with booking rules (the rest are in Settings → Notifications). */
const BOOKING_EVENTS = ['new_booking_admin', 'booking_received_customer', 'booking_confirmed_customer', 'booking_cancelled_customer'];
const EVENT_HELP = {
  new_booking_admin: 'You get a WhatsApp message when a customer sends a booking request.',
  booking_received_customer: 'The customer gets "we received your request" (only if they agreed to WhatsApp updates).',
  booking_confirmed_customer: 'The customer is told when you confirm their booking (only if they agreed).',
  booking_cancelled_customer: 'The customer is told when a booking is cancelled (only if they agreed).',
};

const validate = (d) => {
  const found = {};
  if (d.minAdvanceDays > d.maxAdvanceDays) found.maxAdvanceDays = 'The maximum advance period cannot be shorter than the minimum.';
  return found;
};

/** Settings → Booking: switch bookings on/off, the booking window, required fields and the booking messages. */
export default function BookingSettings({ saved, savedNotifications, options, token, onSaved, report }) {
  const f = useSettingsForm({ group: 'booking', saved, token, onSaved, report, validate });
  const n = useSettingsForm({ group: 'notifications', saved: savedNotifications, token, onSaved, report });
  const { draft: d, errors: e, set } = f;

  const setSameDay = (on) => {
    f.setDraft((cur) => ({ ...cur, allowSameDay: on, minAdvanceDays: on ? 0 : Math.max(1, cur.minAdvanceDays) }));
    f.setErrors((cur) => ({ ...cur, allowSameDay: undefined }));
  };
  const num = (field, label, props = {}) => (
    <Input id={`k-${field}`} label={label} type="number" inputMode="numeric" min="0" step="1" value={String(d[field])}
      onChange={(ev) => set(field, ev.target.value === '' ? '' : Number(ev.target.value))} error={e[field]} {...props} />
  );
  const limits = options.limits;

  return (
    <div className="st-stack">
      <form className="st-form" onSubmit={(ev) => { ev.preventDefault(); f.save(); }} noValidate>
        <Card title="Online booking" description="Turn the booking form off while you are away or fully booked.">
          <Toggle label="Accept online bookings" description="When off, the booking page shows your message instead of the form, and the server refuses new requests." checked={d.enabled} onChange={(v) => set('enabled', v)} error={e.enabled} />
          {!d.enabled && (
            <Textarea id="k-msg" label="Message shown to visitors" maxLength={300} rows={3} value={d.disabledMessage} onChange={(ev) => set('disabledMessage', ev.target.value)} error={e.disabledMessage} />
          )}
        </Card>

        <Card title="Booking window" description="How far ahead customers can book, and how much breathing room you need.">
          <Toggle label="Allow same-day bookings" description="Customers can book later today, for hours that have not passed yet." checked={d.allowSameDay} onChange={setSameDay} error={e.allowSameDay} />
          <div className="st-grid">
            {num('minAdvanceDays', 'Minimum notice (days)', { disabled: d.allowSameDay, max: String(limits.maxAdvanceDays), hint: d.allowSameDay ? 'Same-day bookings are on, so there is no minimum.' : '1 = customers can book from tomorrow.' })}
            {num('maxAdvanceDays', 'How far ahead (days)', { min: '1', max: String(limits.maxAdvanceDays), hint: `Up to ${limits.maxAdvanceDays} days.` })}
            {num('bufferHours', 'Gap between shoots (hours)', { max: String(limits.maxBufferHours), hint: 'Free time kept before and after each booking for travel and rest. 0 = none.' })}
            {num('customDurationHours', '"Not sure yet" shoot length (hours)', { min: '1', max: String(limits.maxDurationHours), hint: 'Time held for a customer who has not picked a package.' })}
          </div>
        </Card>

        <Card title="What customers must fill in" description="Name, shoot type, date and time are always required.">
          <Toggle label="Phone number required" checked={d.phoneRequired} onChange={(v) => set('phoneRequired', v)} error={e.phoneRequired} />
          <Toggle label="Email required" checked={d.emailRequired} onChange={(v) => set('emailRequired', v)} error={e.emailRequired}
            description={d.emailRequired ? undefined : 'Without an email, the customer gets no confirmation email.'} />
          <Toggle label="Location required" checked={d.locationRequired} onChange={(v) => set('locationRequired', v)} error={e.locationRequired}
            description={d.locationRequired ? undefined : 'Bookings without a choice are saved as "Not sure yet".'} />
          <Toggle label="Let customers add notes" description="Shows the 'special requests' box on the booking form." checked={d.allowNotes} onChange={(v) => set('allowNotes', v)} error={e.allowNotes} />
        </Card>

        <Card title="Confirmation message" description="Shown to the customer right after they send a request.">
          <Textarea id="k-confirm" label="Message (optional)" maxLength={500} rows={3} value={d.confirmationMessage} onChange={(ev) => set('confirmationMessage', ev.target.value)} error={e.confirmationMessage}
            hint="Leave empty to use the standard wording." />
        </Card>

        <SaveBar dirty={f.dirty} saving={f.saving} onSave={f.save} onReset={f.reset} status={f.status} />
      </form>

      <form className="st-form" onSubmit={(ev) => { ev.preventDefault(); n.save(); }} noValidate>
        <Card title="Booking messages" description="Which WhatsApp messages are sent about bookings. A message that is switched off is not sent at all. (Connection status and the contact-form alert are in Notifications.)">
          {BOOKING_EVENTS.map((key) => {
            const label = options.notificationEvents.find((x) => x.key === key)?.label ?? key;
            return <Toggle key={key} label={label} description={EVENT_HELP[key]} checked={n.draft.events[key] !== false} onChange={(v) => n.set(`events.${key}`, v)} error={n.errors[`events.${key}`]} />;
          })}
          <Notice tone="warn">There is no "booking rescheduled" message yet: WhatsApp messages exist only for new, confirmed and cancelled bookings.</Notice>
        </Card>
        <SaveBar dirty={n.dirty} saving={n.saving} onSave={n.save} onReset={n.reset} status={n.status} saveLabel="Save messages" />
      </form>
    </div>
  );
}
