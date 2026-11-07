import { useEffect, useState } from 'react';
import Modal from '../../common/Modal';
import Button from '../../common/Button';
import Input from '../../common/Input';
import Textarea from '../../common/Textarea';
import { createService, updateService } from '../../../services/settingsService';
import { ImageField, Toggle } from './ui';

const blank = () => ({ name: '', description: '', coverImage: { url: '', publicId: '' }, active: true });

/** Add or edit one photography service. The id used by old bookings is made once from the name and never changes. */
export default function ServiceFormModal({ isOpen, service, token, imageEnabled, onClose, onSaved }) {
  const editing = Boolean(service);
  const [form, setForm] = useState(blank());
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setForm(service ? { name: service.name, description: service.description ?? '', coverImage: service.coverImage?.url ? service.coverImage : { url: '', publicId: '' }, active: service.active } : blank());
    setErrors({}); setError(''); setSaving(false);
  }, [isOpen, service]);

  const set = (patch) => { setForm((f) => ({ ...f, ...patch })); setErrors((e) => ({ ...e, ...Object.fromEntries(Object.keys(patch).map((k) => [k, undefined])) })); };

  const submit = async () => {
    const name = form.name.replace(/\s+/g, ' ').trim();
    if (name.length < 2) { setErrors({ name: 'Enter a service name of at least 2 characters.' }); return; }
    setSaving(true); setError('');
    try {
      const body = { name, description: form.description.trim(), active: form.active, coverImage: form.coverImage };
      const saved = editing ? await updateService(token, service.id, body) : await createService(token, body);
      onSaved(saved, editing ? 'updated' : 'added');
    } catch (err) {
      if (err.errors) setErrors(err.errors); else setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={() => !saving && onClose()} title={editing ? 'Edit service' : 'Add a service'} size="md"
      footer={(<><Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button><Button onClick={submit} loading={saving}>{editing ? 'Save changes' : 'Add service'}</Button></>)}>
      <form className="st-form" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
        <Input id="sv-name" label="Name" required maxLength={60} placeholder="e.g. Maternity" value={form.name} onChange={(e) => set({ name: e.target.value })} error={errors.name}
          hint={editing ? `Link name: "${service.slug}". It never changes when you rename, so old bookings stay correct.` : 'This is what customers see in the booking form and on the Services page.'} />
        <Textarea id="sv-desc" label="Description (optional)" maxLength={300} rows={3} value={form.description} onChange={(e) => set({ description: e.target.value })} error={errors.description} />
        <ImageField label="Cover image (optional)" value={form.coverImage} onChange={(v) => set({ coverImage: v })} error={errors.coverImage} token={token} enabled={imageEnabled}
          hint="JPG, PNG or WebP up to 5 MB." />
        <Toggle label="Active" description="Shown on the website and bookable. Switch off to hide it without deleting it." checked={form.active} onChange={(v) => set({ active: v })} />
        {error && <p className="form-alert" role="alert">{error}</p>}
        <button type="submit" className="sr-only" tabIndex={-1}>Save</button>
      </form>
    </Modal>
  );
}
