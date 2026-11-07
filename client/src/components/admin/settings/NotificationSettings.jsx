import { useState } from 'react';
import { MessageCircle, RefreshCw, Send } from 'lucide-react';
import { Link } from 'react-router-dom';
import Badge from '../../common/Badge';
import Button from '../../common/Button';
import ConfirmModal from '../../common/ConfirmModal';
import useFetch from '../../../hooks/useFetch';
import useSettingsForm from '../../../hooks/useSettingsForm';
import { getWhatsAppStatus, sendWhatsAppTest } from '../../../services/settingsService';
import { dateTime } from '../../../utils/clientUtils';
import { Card, Notice, SaveBar, Toggle } from './ui';

const CONNECTION = {
  connected: { label: 'Connected', variant: 'success', text: 'WhatsApp answered and accepted the credentials.' },
  unchecked: { label: 'Not checked yet', variant: 'neutral', text: 'The server has WhatsApp credentials. Press "Check connection" to ask WhatsApp.' },
  disconnected: { label: 'Not set up', variant: 'warning', text: 'The WhatsApp credentials are not on the server yet, so no messages are sent.' },
  error: { label: 'Problem', variant: 'danger', text: '' },
};
const APPROVAL = { APPROVED: ['Approved', 'success'], PENDING: ['Waiting for approval', 'warning'], REJECTED: ['Rejected', 'danger'], PAUSED: ['Paused', 'warning'], NOT_FOUND: ['Not found at WhatsApp', 'danger'] };
const BOOKING_EVENTS = ['new_booking_admin', 'booking_received_customer', 'booking_confirmed_customer', 'booking_cancelled_customer'];

/**
 * Settings → Notifications.
 *  • WhatsApp status: read from the server. It shows WHETHER things are set up and the last success/error, never a token or secret
 *    (those live only in the server's .env).
 *  • The contact-form alert switch (the booking messages are switched in Settings → Booking).
 *  • A test message: one sample message to YOUR OWN business number, only after you confirm.
 */
export default function NotificationSettings({ saved, options, token, onSaved, report }) {
  const f = useSettingsForm({ group: 'notifications', saved, token, onSaved, report });
  const [live, setLive] = useState(false);
  const status = useFetch(() => getWhatsAppStatus(token, live), [token, live]);
  const [confirmTest, setConfirmTest] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const s = status.data;
  const conn = CONNECTION[s?.connection?.state] ?? CONNECTION.unchecked;
  const labelOf = (key) => options.notificationEvents.find((x) => x.key === key)?.label ?? key;

  const checkNow = () => { if (live) status.reload(); else setLive(true); };
  const runTest = async () => {
    setTesting(true);
    try { const r = await sendWhatsAppTest(token); setTestResult({ tone: 'ok', text: r.message }); status.reload(); }
    catch (err) { setTestResult({ tone: 'error', text: err.message }); }
    finally { setTesting(false); setConfirmTest(false); }
  };

  return (
    <div className="st-stack">
      <Card title="WhatsApp connection" description="Messages are sent through the WhatsApp Business Cloud API. The access token and other secrets are stored on the server only and are never shown here.">
        {status.error && <Notice tone="error">{status.error}</Notice>}
        {!status.error && !s && <p className="st-muted">Loading…</p>}
        {s && (
          <>
            <div className="st-conn">
              <span className="st-conn__icon"><MessageCircle size={22} aria-hidden="true" /></span>
              <div>
                <p className="st-conn__state"><Badge variant={conn.variant}>{conn.label}</Badge></p>
                <p className="st-muted">{s.connection?.state === 'error' ? s.connection.message : conn.text}</p>
                {s.connection?.state === 'connected' && (s.connection.displayPhoneNumber || s.connection.verifiedName) && (
                  <p className="st-muted">{[s.connection.verifiedName, s.connection.displayPhoneNumber].filter(Boolean).join(' · ')}{s.connection.quality ? ` · quality ${String(s.connection.quality).toLowerCase()}` : ''}</p>
                )}
              </div>
              <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={checkNow} loading={status.loading && live} disabled={!s.configured}>Check connection</Button>
            </div>

            {s.missing?.length > 0 && <Notice tone="warn">Missing on the server: {s.missing.join(', ')}. Add them to the server's environment settings (never in this screen).</Notice>}
            <dl className="st-facts">
              <div><dt>Last message accepted</dt><dd>{s.lastSuccessAt ? dateTime(s.lastSuccessAt) : 'None yet'}</dd></div>
              <div><dt>Last error</dt><dd>{s.lastError ? `${s.lastError.message || 'Unknown error'} (${dateTime(s.lastError.at)})` : 'None'}</dd></div>
              <div><dt>Your own number set</dt><dd>{s.photographerNumberSet ? 'Yes' : 'No (needed for alerts to you)'}</dd></div>
              <div><dt>Replies from customers (webhook)</dt><dd>{s.webhook?.appSecretSet && s.webhook?.verifyTokenSet ? 'Set up' : 'Not fully set up'}</dd></div>
            </dl>
          </>
        )}
      </Card>

      <form className="st-form" onSubmit={(ev) => { ev.preventDefault(); f.save(); }} noValidate>
        <Card title="Alerts" description="Messages about bookings are switched in Settings → Booking.">
          <Toggle label={labelOf('new_message_admin')} description="You get a WhatsApp message when someone sends the website contact form."
            checked={f.draft.events.new_message_admin !== false} onChange={(v) => f.set('events.new_message_admin', v)} error={f.errors['events.new_message_admin']} />
        </Card>
        <SaveBar dirty={f.dirty} saving={f.saving} onSave={f.save} onReset={f.reset} status={f.status} />
      </form>

      <Card title="Message templates" description="WhatsApp only allows pre-approved templates for business-started messages. The approval status comes from WhatsApp itself, only when you press Check connection.">
        {s ? (
          <ul className="st-templates">
            {s.templates.map((t) => {
              const approval = t.approval ? APPROVAL[t.approval] ?? [t.approval, 'neutral'] : null;
              const on = saved.events[t.event] !== false;
              return (
                <li key={t.event} className="st-template">
                  <div>
                    <p className="st-template__name">{t.label} <code>{t.template}</code></p>
                    <p className="st-muted">{t.purpose}</p>
                    <p className="st-muted">To: {t.recipient === 'photographer' ? 'you' : 'the customer'} · {String(t.category).toLowerCase()} · {on ? 'switched on' : 'switched off'}{BOOKING_EVENTS.includes(t.event) ? ' (Settings → Booking)' : ''}</p>
                  </div>
                  {approval ? <Badge variant={approval[1]}>{approval[0]}</Badge> : <Badge variant="neutral">Not checked</Badge>}
                </li>
              );
            })}
          </ul>
        ) : <p className="st-muted">Loading…</p>}
        {s?.templateCheck?.state === 'error' && <Notice tone="warn">{s.templateCheck.message}</Notice>}
      </Card>

      <Card title="Send a test message" description="Sends one sample message to your own business number from the server's settings. It shows made-up example text, is not saved anywhere, and never goes to customers.">
        <Notice tone={testResult?.tone} onDismiss={() => setTestResult(null)}>{testResult?.text}</Notice>
        <div>
          <Button icon={<Send size={16} />} variant="outline" onClick={() => { setTestResult(null); setConfirmTest(true); }} disabled={!s?.configured || !s?.photographerNumberSet}>Send test message</Button>
          {s && (!s.configured || !s.photographerNumberSet) && <p className="st-muted">Needs the WhatsApp credentials and your own number on the server first.</p>}
        </div>
        <p className="st-muted">Delivery history of real messages: <Link to="/admin/notifications">Notifications</Link>.</p>
      </Card>

      <ConfirmModal isOpen={confirmTest} onClose={() => setConfirmTest(false)} onConfirm={runTest} loading={testing} title="Send a test message?"
        message="One WhatsApp message with sample text will be sent to your business number. It may count towards your WhatsApp message charges." confirmText="Send test" />
    </div>
  );
}
