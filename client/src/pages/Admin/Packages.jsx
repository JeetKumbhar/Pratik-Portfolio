import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Package, Pencil, Plus, Trash2 } from 'lucide-react';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import ConfirmModal from '../../components/common/ConfirmModal';
import EmptyState from '../../components/common/EmptyState';
import PackageFormModal from '../../components/admin/PackageFormModal';
import { SHOOT_TYPES, labelOf, money } from '../../components/booking/bookingData';
import useAuth from '../../hooks/useAuth';
import useFetch from '../../hooks/useFetch';
import { deletePackage, getPackagesAdmin, updatePackage } from '../../services/adminService';
import { cx } from '../../utils/helpers';

const categoryName = (c) => (c === 'general' || !c ? 'All shoots' : labelOf(SHOOT_TYPES, c) || c);

/** Admin → Packages. Create · edit · change price and features · activate / deactivate · delete. Changes go live on the Services page straight away. */
export default function Packages() {
  const { token } = useAuth();
  const list = useFetch(() => getPackagesAdmin(token), [token]);
  const [status, setStatus] = useState(''); // '' | 'active' | 'hidden'
  const [modal, setModal] = useState({ open: false, pkg: null });
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [notice, setNotice] = useState(null); // { text, warn }

  const packages = list.data?.data ?? [];
  const usage = list.data?.usage ?? {};
  const live = packages.filter((p) => p.active).length;
  const shown = packages.filter((p) => !status || (status === 'active' ? p.active : !p.active));

  const saved = (pkg, action) => {
    setModal({ open: false, pkg: null });
    setNotice({ text: `"${pkg.name}" ${action}.${!pkg.active ? ' It is hidden from the website.' : ''}` });
    list.reload();
  };

  const toggleActive = async (p) => {
    setBusyId(p._id);
    try {
      const updated = await updatePackage(token, p._id, { active: !p.active });
      setNotice({ text: updated.active ? `"${p.name}" is now shown on the website.` : `"${p.name}" is now hidden from the website. Customers can no longer book it.`, warn: !updated.active });
      list.reload();
    } catch (err) {
      setNotice({ text: err.message, warn: true });
    } finally {
      setBusyId('');
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      const result = await deletePackage(token, toDelete._id);
      setNotice({ text: result.message });
      list.reload();
    } catch (err) {
      setNotice({ text: err.message, warn: true });
    } finally {
      setDeleting(false);
      setToDelete(null);
    }
  };

  const used = toDelete ? usage[toDelete.slug] ?? 0 : 0;

  return (
    <div className="pk">
      <div className="pk__head">
        <p className="pk__count">{list.loading && !list.data ? 'Loading…' : `${packages.length} package${packages.length === 1 ? '' : 's'} · ${live} on the website`}</p>
        <div className="pk__tools">
          <select className="bk-select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter packages">
            <option value="">All packages</option>
            <option value="active">On the website</option>
            <option value="hidden">Hidden</option>
          </select>
          <Button icon={<Plus size={16} />} onClick={() => { setNotice(null); setModal({ open: true, pkg: null }); }}>New package</Button>
        </div>
      </div>

      {notice && (
        <p className={cx('pk-notice', notice.warn && 'pk-notice--warn')} role="status">
          {notice.warn ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />} {notice.text}
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">×</button>
        </p>
      )}

      {list.error && <EmptyState icon={<Package size={28} />} title="Couldn't load the packages" message={list.error} action={<Button onClick={list.reload}>Try again</Button>} />}

      {!list.error && !list.loading && packages.length === 0 && (
        <EmptyState icon={<Package size={28} />} title="No packages yet" message="Create your first package and it appears on the Services page and in the booking form."
          action={<Button icon={<Plus size={16} />} onClick={() => setModal({ open: true, pkg: null })}>New package</Button>} />
      )}

      {!list.error && packages.length > 0 && shown.length === 0 && <EmptyState icon={<Package size={28} />} title="Nothing matches" message="Try a different filter." />}

      {shown.length > 0 && (
        <ul className="pk-grid">
          {shown.map((p) => (
            <li key={p._id} className={cx('pk-card', !p.active && 'is-hidden')}>
              <div className="pk-card__head">
                <div>
                  <h3 className="pk-card__name">{p.name}</h3>
                  <p className="pk-card__desc">{p.description || 'No description'}</p>
                </div>
                <button type="button" role="switch" aria-checked={p.active} aria-label={`${p.name}: ${p.active ? 'active' : 'hidden'}`} title={p.active ? 'Click to hide from the website' : 'Click to show on the website'}
                  className={cx('pk-switch', p.active && 'is-on')} onClick={() => toggleActive(p)} disabled={busyId === p._id}><span /></button>
              </div>

              <p className="pk-card__price">{money(p.price)}</p>
              <p className="pk-card__meta"><Clock size={14} /> {p.duration} · blocks {p.durationHours}h · {categoryName(p.category)}</p>

              <ul className="pk-card__features">
                {p.features.slice(0, 4).map((f) => <li key={f}>{f}</li>)}
                {p.features.length > 4 && <li className="pk-card__more">+{p.features.length - 4} more</li>}
                {p.features.length === 0 && <li className="pk-card__more">No features listed</li>}
              </ul>

              <div className="pk-card__badges">
                {p.popular && <Badge variant="solid">Most popular</Badge>}
                {!p.active && <Badge variant="warning">Hidden</Badge>}
                {usage[p.slug] > 0 && <small>Used in {usage[p.slug]} booking{usage[p.slug] === 1 ? '' : 's'}</small>}
              </div>

              <div className="pk-card__actions">
                <Button variant="ghost" size="sm" icon={<Pencil size={14} />} onClick={() => { setNotice(null); setModal({ open: true, pkg: p }); }}>Edit</Button>
                <Button variant="ghost" size="sm" icon={<Trash2 size={14} />} className="pk-danger" onClick={() => setToDelete(p)}>Delete</Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <PackageFormModal isOpen={modal.open} pkg={modal.pkg} onClose={() => setModal({ open: false, pkg: null })} onSaved={saved} />

      <ConfirmModal
        isOpen={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        danger
        title="Delete this package?"
        message={toDelete
          ? `"${toDelete.name}" will be removed from your website and booking form.${used ? ` ${used} existing booking${used === 1 ? '' : 's'} used it and will keep the name and price they were booked with.` : ''} This can't be undone. To stop offering it but keep it for later, hide it instead.`
          : ''}
        confirmText="Delete package"
      />
    </div>
  );
}
