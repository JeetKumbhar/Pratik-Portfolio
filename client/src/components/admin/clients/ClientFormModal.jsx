import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from '../../common/Modal';
import Button from '../../common/Button';
import Input from '../../common/Input';
import Textarea from '../../common/Textarea';
import useAuth from '../../../hooks/useAuth';
import { createClient, updateClient } from '../../../services/clientService';
import { NOTE_MAX } from '../../../utils/clientUtils';

const EMPTY = { name: '', phone: '', email: '', city: '', notes: '' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** What the browser can check before asking the server (the server checks everything again). */
function check(form, { editing }) {
  const errors = {};
  const name = form.name.trim();
  if (name.length < 2) errors.name = 'Enter the client’s full name.';
  else if (name.length > 80) errors.name = 'Name must be 80 characters or fewer.';
  const digits = form.phone.replace(/\D/g, '');
  if (!form.phone.trim()) errors.phone = 'Enter a phone number.';
  else if (digits.length < 7 || digits.length > 15) errors.phone = 'Enter a valid phone number, with the country code if it is not an Indian number.';
  if (form.email.trim() && !EMAIL_RE.test(form.email.trim())) errors.email = 'Enter a valid email address.';
  if (form.city.trim().length > 80) errors.city = 'City must be 80 characters or fewer.';
  if (!editing && form.notes.length > NOTE_MAX) errors.notes = `Notes must be ${NOTE_MAX} characters or fewer.`;
  return errors;
}

/**
 * Add a client (client = null) or edit one (client = the profile data).
 *   onSaved(client, { existing })  existing = true when the phone number already had a client (add only): nothing was changed.
 * A phone number that belongs to a different client is shown as a message under the field, with a link to that client.
 */
export default function ClientFormModal({ isOpen, onClose, client = null, onSaved }) {
  const { token } = useAuth();
  const editing = Boolean(client);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [duplicate, setDuplicate] = useState(null); // { id, name } from a 409 on edit
  const [saving, setSaving] = useState(false);

  // Modal re-focuses its panel whenever onClose changes identity, which would steal focus while typing: keep it stable.
  const closeRef = useRef(onClose);
  const savingRef = useRef(false);
  useEffect(() => { closeRef.current = onClose; savingRef.current = saving; });
  const requestClose = useCallback(() => { if (!savingRef.current) closeRef.current?.(); }, []);

  // Start fresh (or from the client being edited) every time the dialog opens
  useEffect(() => {
    if (!isOpen) return;
    setForm(client ? { name: client.name ?? '', phone: client.phone ?? '', email: client.email ?? '', city: client.city ?? '', notes: '' } : EMPTY);
    setErrors({}); setFormError(''); setDuplicate(null); setSaving(false);
  }, [isOpen, client]);

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setErrors((er) => ({ ...er, [key]: undefined }));
    if (key === 'phone') setDuplicate(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    const found = check(form, { editing });
    if (Object.keys(found).length) { setErrors(found); return; }

    setSaving(true); setFormError('');
    try {
      const values = { name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim(), city: form.city.trim() };
      if (editing) {
        const saved = await updateClient(token, client.id, values);
        onSaved?.(saved, { existing: false });
      } else {
        const res = await createClient(token, { ...values, ...(form.notes.trim() && { notes: form.notes.trim() }) });
        onSaved?.(res.data, { existing: Boolean(res.existing), message: res.message });
      }
    } catch (err) {
      setSaving(false);
      if (err.status === 409 && err.data?.existing) setDuplicate(err.data.existing);
      if (err.errors && typeof err.errors === 'object' && !Array.isArray(err.errors)) setErrors(err.errors);
      else if (err.status !== 409) setFormError(err.message || 'Could not save the client. Please try again.');
    }
  };

  const busy = saving;
  return (
    <Modal
      isOpen={isOpen}
      onClose={requestClose}
      title={editing ? 'Edit client' : 'Add client'}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} loading={busy}>{editing ? 'Save changes' : 'Add client'}</Button>
        </>
      )}
    >
      <form className="cl-form" onSubmit={submit} noValidate>
        <Input label="Full name" required value={form.name} onChange={set('name')} error={errors.name} maxLength={80} autoComplete="off" autoFocus />
        <Input
          label="Phone" required type="tel" inputMode="tel" value={form.phone} onChange={set('phone')} error={errors.phone}
          hint={errors.phone ? undefined : 'An Indian number can be typed as 98765 43210. Other countries: start with + and the country code.'} autoComplete="off"
        />
        {duplicate && (
          <p className="cl-form__dup" role="status">
            This number already belongs to <Link to={`/admin/clients/${duplicate.id}`} onClick={onClose}>{duplicate.name}</Link>.
          </p>
        )}
        <Input label="Email" type="email" value={form.email} onChange={set('email')} error={errors.email} hint="Optional" autoComplete="off" />
        <Input label="City" value={form.city} onChange={set('city')} error={errors.city} hint="Optional" maxLength={80} autoComplete="off" />
        {!editing && (
          <Textarea
            label="Additional notes" value={form.notes} onChange={set('notes')} error={errors.notes} maxLength={NOTE_MAX} rows={3}
            hint="Optional. Saved as a private note on this client."
          />
        )}
        {formError && <p className="cl-form__error" role="alert">{formError}</p>}
        <button type="submit" className="sr-only" tabIndex={-1}>Save</button>
      </form>
    </Modal>
  );
}
