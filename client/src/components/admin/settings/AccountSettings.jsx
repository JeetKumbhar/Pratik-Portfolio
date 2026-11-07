import { useState } from 'react';
import { KeyRound, LogOut, Mail, ShieldCheck } from 'lucide-react';
import Button from '../../common/Button';
import ConfirmModal from '../../common/ConfirmModal';
import Input from '../../common/Input';
import useAuth from '../../../hooks/useAuth';
import useFetch from '../../../hooks/useFetch';
import { changeEmail, changePassword, getAccount, logoutEverywhere } from '../../../services/settingsService';
import { dateTime } from '../../../utils/clientUtils';
import { errorsFrom } from '../../../utils/settingsUtils';
import { Card, Notice } from './ui';

/** A small self-contained form: its own fields, errors and result. Passwords are cleared after every attempt. */
function useAction(run) {
  const [state, setState] = useState({ busy: false, errors: {}, notice: null });
  const submit = async (...args) => {
    setState({ busy: true, errors: {}, notice: null });
    try {
      const result = await run(...args);
      setState({ busy: false, errors: {}, notice: { tone: 'ok', text: result.message } });
      return result;
    } catch (err) {
      const { fields, message } = errorsFrom(err);
      setState({ busy: false, errors: fields, notice: { tone: 'error', text: Object.keys(fields).length ? 'Please fix the highlighted fields.' : message } });
      return null;
    }
  };
  return [state, submit, () => setState((s) => ({ ...s, notice: null }))];
}

/**
 * Settings → Account & Security. Every change asks for the CURRENT password. The server never sends a password or a hash.
 * After a password change or "sign out everywhere" the server ends all other sessions and gives this one a new token.
 */
export default function AccountSettings({ token }) {
  const { replaceToken, updateUser } = useAuth();
  const account = useFetch(() => getAccount(token), [token]);
  const [mail, setMail] = useState({ email: '', currentPassword: '' });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [out, setOut] = useState({ currentPassword: '' });
  const [confirmOut, setConfirmOut] = useState(false);

  const [mailState, runMail] = useAction((body) => changeEmail(token, body));
  const [pwState, runPw] = useAction((body) => changePassword(token, body));
  const [outState, runOut, clearOut] = useAction((password) => logoutEverywhere(token, password));

  const a = account.data;

  const submitEmail = async (ev) => {
    ev.preventDefault();
    const r = await runMail(mail);
    if (r) { updateUser({ email: r.data.email }); setMail({ email: '', currentPassword: '' }); account.reload(); } else setMail((m) => ({ ...m, currentPassword: '' }));
  };
  const submitPassword = async (ev) => {
    ev.preventDefault();
    const r = await runPw(pw);
    setPw({ currentPassword: '', newPassword: '', confirmPassword: '' });
    if (r?.token) { replaceToken(r.token); account.reload(); }
  };
  const submitLogout = async () => {
    const r = await runOut(out.currentPassword);
    setConfirmOut(false);
    setOut({ currentPassword: '' });
    if (r?.token) { replaceToken(r.token); account.reload(); }
  };

  return (
    <div className="st-stack">
      <Card title="Your account" description="The administrator account for this website.">
        {account.error && <Notice tone="error">{account.error}</Notice>}
        {!account.error && !a && <p className="st-muted">Loading…</p>}
        {a && (
          <dl className="st-facts">
            <div><dt>Name</dt><dd>{a.name}</dd></div>
            <div><dt>Email</dt><dd>{a.email}</dd></div>
            <div><dt>This session started</dt><dd>{a.session.signedInAt ? dateTime(a.session.signedInAt) : 'Unknown'}</dd></div>
            <div><dt>This session ends</dt><dd>{a.session.expiresAt ? dateTime(a.session.expiresAt) : 'Unknown'}</dd></div>
          </dl>
        )}
      </Card>

      <form onSubmit={submitEmail} noValidate>
        <Card title="Change email" description="Your sign-in email. You will use the new address the next time you log in.">
          <Notice tone={mailState.notice?.tone}>{mailState.notice?.text}</Notice>
          <div className="st-grid">
            <Input id="ac-email" label="New email address" type="email" autoComplete="email" icon={<Mail size={18} />} value={mail.email} onChange={(e) => setMail({ ...mail, email: e.target.value })} error={mailState.errors.email} />
            <Input id="ac-email-pw" label="Current password" type="password" autoComplete="current-password" value={mail.currentPassword} onChange={(e) => setMail({ ...mail, currentPassword: e.target.value })} error={mailState.errors.currentPassword} />
          </div>
          <div><Button type="submit" loading={mailState.busy} disabled={!mail.email || !mail.currentPassword}>Change email</Button></div>
        </Card>
      </form>

      <form onSubmit={submitPassword} noValidate>
        <Card title="Change password" description="Use at least 8 characters. Changing it signs you out of every other device.">
          <Notice tone={pwState.notice?.tone}>{pwState.notice?.text}</Notice>
          <Input id="ac-pw" label="Current password" type="password" autoComplete="current-password" icon={<KeyRound size={18} />} value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} error={pwState.errors.currentPassword} />
          <div className="st-grid">
            <Input id="ac-new" label="New password" type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} error={pwState.errors.newPassword} hint="8 to 72 characters." />
            <Input id="ac-confirm" label="Repeat new password" type="password" autoComplete="new-password" value={pw.confirmPassword} onChange={(e) => setPw({ ...pw, confirmPassword: e.target.value })} error={pwState.errors.confirmPassword} />
          </div>
          <div><Button type="submit" loading={pwState.busy} disabled={!pw.currentPassword || !pw.newPassword || !pw.confirmPassword}>Change password</Button></div>
        </Card>
      </form>

      <Card title="Sessions" description="">
        <p className="st-muted"><ShieldCheck size={16} aria-hidden="true" /> The server does not keep a list of devices, so individual sessions cannot be shown or ended one by one. You can end all other sessions at once instead. This device stays signed in.</p>
        <Notice tone={outState.notice?.tone} onDismiss={clearOut}>{outState.notice?.text}</Notice>
        <div className="st-grid">
          <Input id="ac-out-pw" label="Current password" type="password" autoComplete="current-password" value={out.currentPassword} onChange={(e) => setOut({ currentPassword: e.target.value })} error={outState.errors.currentPassword} />
        </div>
        <div><Button variant="outline" icon={<LogOut size={16} />} disabled={!out.currentPassword} onClick={() => setConfirmOut(true)}>Sign out all other devices</Button></div>
      </Card>

      <ConfirmModal isOpen={confirmOut} onClose={() => setConfirmOut(false)} onConfirm={submitLogout} loading={outState.busy} danger title="Sign out other devices?"
        message="Every other browser or device that is signed in to the admin panel will be signed out and must log in again. This device stays signed in." confirmText="Sign them out" />
    </div>
  );
}
