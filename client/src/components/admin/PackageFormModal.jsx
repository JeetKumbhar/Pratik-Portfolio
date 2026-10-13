import { useEffect, useRef, useState } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Input from '../common/Input';
import Select from '../common/Select';
import Textarea from '../common/Textarea';
import useAuth from '../../hooks/useAuth';
import { createPackage, updatePackage } from '../../services/adminService';
import { SHOOT_TYPES } from '../booking/bookingData';
import { MAX_FEATURES, featuresToText, guessHours, toPayload, validatePackageForm } from '../../utils/packageForm';

const CATEGORY_OPTIONS = [{ value: 'general', label: 'All kinds of shoot (general)' }, ...SHOOT_TYPES.map((t) => ({ value: t.id, label: t.label }))];
const HOUR_OPTIONS = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `${i + 1} hour${i === 0 ? '' : 's'}` }));

const blank = () => ({ name: '', price: '', duration: '', durationHours: '2', category: 'general', description: '', featuresText: '', sortOrder: '', popular: false, active: true });
const fromPackage = (p) => ({
  name: p.name, price: String(p.price), duration: p.duration, durationHours: String(p.durationHours), category: p.category ?? 'general',
  description: p.description ?? '', featuresText: featuresToText(p.features), sortOrder: String(p.sortOrder ?? ''), popular: p.popular, active: p.active,
});

/**
 * Create or edit a package. Everything customers see on the Services page and the booking form comes from here.
 * "How long you are busy" controls availability: a 6-hour package only offers start times with 6 free hours in a row.
 */
export default function PackageFormModal({ isOpen, pkg, onClose, onSaved }) {
  const { token } = useAuth();
  const editing = Boolean(pkg);
  const hoursTouched = useRef(false);

  const [form, setForm] = useState(blank());
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setForm(pkg ? fromPackage(pkg) : blank());
    hoursTouched.current = Boolean(pkg); // an existing package keeps its hours unless you change them
    setErrors({}); setSubmitError(''); setSaving(false);
  }, [isOpen, pkg]);

  const set = (patch) => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors((e) => ({ ...e, ...Object.fromEntries(Object.keys(patch).map((k) => [k, undefined])) }));
  };

  // Typing "90 minutes" or "Up to 6 hours" suggests the hours, until you choose them yourself
  const changeDuration = (value) => {
    const guess = guessHours(value);
    set({ duration: value, ...(!hoursTouched.current && guess ? { durationHours: String(guess) } : {}) });
  };

  const submit = async () => {
    const found = validatePackageForm(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    setSubmitError('');
    try {
      const payload = toPayload(form);
      const saved = editing ? await updatePackage(token, pkg._id, payload) : await createPackage(token, payload);
      onSaved(saved, editing ? 'updated' : 'created');
    } catch (err) {
      setSubmitError(err.errors ? Object.values(err.errors)[0] : err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !saving && onClose()}
      title={editing ? 'Edit package' : 'New package'}
      size="md"
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} loading={saving}>{editing ? 'Save changes' : 'Create package'}</Button>
        </>
      )}
    >
      <form className="pk-form" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
        <Input id="pk-name" label="Name" required maxLength={60} placeholder="e.g. Standard" value={form.name} onChange={(e) => set({ name: e.target.value })} error={errors.name}
          hint={editing ? `Link name: "${pkg.slug}" (used in booking links, it never changes when you rename)` : undefined} />

        <div className="pk-form__row">
          <Input id="pk-price" label="Price (USD)" required type="number" min="0" step="1" inputMode="decimal" placeholder="1200" value={form.price} onChange={(e) => set({ price: e.target.value })} error={errors.price} />
          <Input id="pk-duration" label="Duration (as shown)" required maxLength={40} placeholder="e.g. 2 hours" value={form.duration} onChange={(e) => changeDuration(e.target.value)} error={errors.duration} />
        </div>

        <div className="pk-form__row">
          <Select id="pk-hours" label="Hours you are busy" options={HOUR_OPTIONS} value={form.durationHours}
            onChange={(e) => { hoursTouched.current = true; set({ durationHours: e.target.value }); }} error={errors.durationHours}
            hint="Customers can only book start times where this many hours in a row are free." />
          <Select id="pk-category" label="Offered for" options={CATEGORY_OPTIONS} value={form.category} onChange={(e) => set({ category: e.target.value })} error={errors.category} />
        </div>

        <Input id="pk-description" label="Short description (optional)" maxLength={200} placeholder="e.g. Great for couples & small events" value={form.description} onChange={(e) => set({ description: e.target.value })} error={errors.description} />

        <Textarea id="pk-features" label="What's included" maxLength={MAX_FEATURES * 110} rows={6} placeholder={'2 hours session\n75+ edited photos\nOnline gallery'}
          value={form.featuresText} onChange={(e) => set({ featuresText: e.target.value })} error={errors.featuresText}
          hint={`One per line, up to ${MAX_FEATURES}.`} />

        <Input id="pk-order" label="Display order (optional)" type="number" min="1" step="1" placeholder="Leave empty to add at the end" value={form.sortOrder}
          onChange={(e) => set({ sortOrder: e.target.value })} error={errors.sortOrder} hint="1 shows first. Lower numbers appear before higher ones." />

        <div className="pk-form__checks">
          <label><input type="checkbox" checked={form.active} onChange={(e) => set({ active: e.target.checked })} /> Active <small>(shown on the website and bookable)</small></label>
          <label><input type="checkbox" checked={form.popular} onChange={(e) => set({ popular: e.target.checked })} /> Show the "Most popular" badge</label>
        </div>

        {submitError && <p className="form-alert" role="alert">{submitError}</p>}
        <button type="submit" className="sr-only" tabIndex={-1}>Save</button>
      </form>
    </Modal>
  );
}
