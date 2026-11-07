import { useState } from 'react';
import { ArrowDown, ArrowUp, Camera, Pencil, Plus, Trash2 } from 'lucide-react';
import Badge from '../../common/Badge';
import Button from '../../common/Button';
import ConfirmModal from '../../common/ConfirmModal';
import EmptyState from '../../common/EmptyState';
import useFetch from '../../../hooks/useFetch';
import { deleteService, getServicesAdmin, reorderServices, updateService } from '../../../services/settingsService';
import { cx } from '../../../utils/helpers';
import ServiceFormModal from './ServiceFormModal';
import { Notice } from './ui';

/**
 * Settings → Services. Each action here saves straight away (there is no Save button): the list below always shows what the
 * server has. Services used by bookings cannot be deleted, only switched off, and bookings keep the name they were made under.
 */
export default function ServicesSettings({ token, imageEnabled, onChanged }) {
  const list = useFetch(() => getServicesAdmin(token), [token]);
  const [modal, setModal] = useState({ open: false, service: null });
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState(null); // { text, tone }

  const services = list.data ?? [];
  const changed = (text, tone = 'ok') => { setNotice({ text, tone }); list.reload(); onChanged?.(); };

  const toggle = async (s) => {
    setBusy(s.id);
    try {
      const saved = await updateService(token, s.id, { active: !s.active });
      changed(saved.active ? `"${s.name}" is now on the website.` : `"${s.name}" is now hidden. Customers can no longer book it, and old bookings keep their details.`);
    } catch (err) { setNotice({ text: err.message, tone: 'error' }); } finally { setBusy(''); }
  };

  const move = async (index, delta) => {
    const next = [...services];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    setBusy(item.id);
    try { await reorderServices(token, next.map((s) => s.id)); changed('Order saved.'); }
    catch (err) { setNotice({ text: err.message, tone: 'error' }); list.reload(); } finally { setBusy(''); }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try { const r = await deleteService(token, toDelete.id); changed(r.message || 'Service deleted.'); }
    catch (err) { setNotice({ text: err.message, tone: 'error' }); } finally { setDeleting(false); setToDelete(null); }
  };

  const usedBy = (s) => (s.usage?.bookings ?? 0) + (s.usage?.packages ?? 0);
  const usageText = (s) => [s.usage?.bookings ? `${s.usage.bookings} booking${s.usage.bookings === 1 ? '' : 's'}` : '', s.usage?.packages ? `${s.usage.packages} package${s.usage.packages === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');

  return (
    <div className="st-stack">
      <div className="st-card">
        <div className="st-card__head st-card__head--row">
          <div>
            <h3 className="st-card__title">Photography services</h3>
            <p className="st-card__desc">What customers can choose in the booking form and see on the Services page. Changes go live straight away.</p>
          </div>
          <Button icon={<Plus size={16} />} onClick={() => { setNotice(null); setModal({ open: true, service: null }); }}>Add service</Button>
        </div>

        <div className="st-card__body">
          <Notice tone={notice?.tone} onDismiss={() => setNotice(null)}>{notice?.text}</Notice>

          {list.error && <EmptyState icon={<Camera size={28} />} title="Couldn't load the services" message={list.error} action={<Button onClick={list.reload}>Try again</Button>} />}
          {!list.error && list.loading && !list.data && <p className="st-muted">Loading…</p>}
          {!list.error && !list.loading && services.length === 0 && (
            <EmptyState icon={<Camera size={28} />} title="No services yet" message="Add your first service so customers can choose it when booking."
              action={<Button icon={<Plus size={16} />} onClick={() => setModal({ open: true, service: null })}>Add service</Button>} />
          )}

          {services.length > 0 && (
            <ul className="st-services">
              {services.map((s, i) => (
                <li key={s.id} className={cx('st-service', !s.active && 'is-hidden')}>
                  <div className="st-service__thumb">{s.coverImage?.url ? <img src={s.coverImage.url} alt="" /> : <Camera size={20} aria-hidden="true" />}</div>
                  <div className="st-service__main">
                    <p className="st-service__name">{s.name} {!s.active && <Badge variant="warning">Hidden</Badge>}</p>
                    <p className="st-service__desc">{s.description || 'No description'}</p>
                    {usedBy(s) > 0 && <p className="st-service__used">Used by {usageText(s)}</p>}
                  </div>
                  <div className="st-service__actions">
                    <button type="button" role="switch" aria-checked={s.active} aria-label={`${s.name}: ${s.active ? 'active' : 'hidden'}`} title={s.active ? 'Click to hide from the website' : 'Click to show on the website'}
                      className={cx('st-switch', s.active && 'is-on')} onClick={() => toggle(s)} disabled={busy === s.id}><span /></button>
                    <Button variant="ghost" size="sm" aria-label={`Move ${s.name} up`} disabled={i === 0 || !!busy} onClick={() => move(i, -1)} icon={<ArrowUp size={14} />} />
                    <Button variant="ghost" size="sm" aria-label={`Move ${s.name} down`} disabled={i === services.length - 1 || !!busy} onClick={() => move(i, 1)} icon={<ArrowDown size={14} />} />
                    <Button variant="ghost" size="sm" icon={<Pencil size={14} />} onClick={() => { setNotice(null); setModal({ open: true, service: s }); }}>Edit</Button>
                    <Button variant="ghost" size="sm" className="st-danger" icon={<Trash2 size={14} />} onClick={() => setToDelete(s)}
                      disabled={usedBy(s) > 0} title={usedBy(s) > 0 ? 'Used by existing bookings: switch it off instead' : 'Delete'}>Delete</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <ServiceFormModal isOpen={modal.open} service={modal.service} token={token} imageEnabled={imageEnabled}
        onClose={() => setModal({ open: false, service: null })}
        onSaved={(s, action) => { setModal({ open: false, service: null }); changed(`"${s.name}" ${action}.`); }} />

      <ConfirmModal isOpen={!!toDelete} onClose={() => setToDelete(null)} onConfirm={confirmDelete} loading={deleting} danger title="Delete this service?"
        message={toDelete ? `"${toDelete.name}" will be removed from the website and the booking form. No booking uses it, so nothing else changes. This can't be undone.` : ''} confirmText="Delete service" />
    </div>
  );
}
