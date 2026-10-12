import { useState } from 'react';
import { CheckCircle2, AlertTriangle, ImageOff, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import ConfirmModal from '../../components/common/ConfirmModal';
import EmptyState from '../../components/common/EmptyState';
import PhotoFormModal from '../../components/admin/PhotoFormModal';
import PortfolioImage from '../../components/portfolio/PortfolioImage';
import { CATEGORIES, categoryLabel } from '../../components/portfolio/portfolioData';
import useAuth from '../../hooks/useAuth';
import useFetch from '../../hooks/useFetch';
import { deletePhoto, getPortfolioAdmin } from '../../services/adminService';

const when = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/**
 * Admin → Portfolio.   Add (upload) · Edit title / category · Delete.
 * Admin → Cloudinary (file) → MongoDB (URL) → public Portfolio page.
 */
export default function AdminPortfolio() {
  const { token } = useAuth();
  const list = useFetch(() => getPortfolioAdmin(token), [token]);
  const [category, setCategory] = useState('');
  const [visibility, setVisibility] = useState(''); // '' | 'published' | 'draft'
  const [modal, setModal] = useState({ open: false, photo: null });
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState(null); // { text, warn }

  const photos = list.data ?? [];
  const published = photos.filter((p) => p.isPublished).length;
  const shown = photos.filter((p) => (!category || p.category === category) && (!visibility || (visibility === 'published' ? p.isPublished : !p.isPublished)));
  const filtered = Boolean(category || visibility);

  const saved = (photo, action) => {
    setModal({ open: false, photo: null });
    setNotice({ text: `"${photo.title}" ${action}.${action === 'added' && !photo.isPublished ? ' It is saved as a draft.' : ''}` });
    list.reload();
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      const result = await deletePhoto(token, toDelete.id);
      setNotice({ text: result.message, warn: result.storageDeleted === false });
      list.reload();
    } catch (err) {
      setNotice({ text: err.message, warn: true });
    } finally {
      setDeleting(false);
      setToDelete(null);
    }
  };

  return (
    <div className="pa">
      <div className="pa__head">
        <p className="pa__count">
          {list.loading && !list.data ? 'Loading…' : `${photos.length} photo${photos.length === 1 ? '' : 's'} · ${published} on the website`}
        </p>
        <Button icon={<Plus size={16} />} onClick={() => { setNotice(null); setModal({ open: true, photo: null }); }}>Add photo</Button>
      </div>

      {notice && (
        <p className={notice.warn ? 'pa-notice pa-notice--warn' : 'pa-notice'} role="status">
          {notice.warn ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />} {notice.text}
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">×</button>
        </p>
      )}

      <div className="pa__tools">
        <select className="bk-select" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category">
          <option value="">All categories</option>
          {CATEGORIES.filter((c) => c.value !== 'all').map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <select className="bk-select" value={visibility} onChange={(e) => setVisibility(e.target.value)} aria-label="Filter by visibility">
          <option value="">Published and drafts</option>
          <option value="published">Published only</option>
          <option value="draft">Drafts only</option>
        </select>
        {filtered && <button type="button" className="bk-clear" onClick={() => { setCategory(''); setVisibility(''); }}>Clear</button>}
      </div>

      {list.error && (
        <EmptyState icon={<ImageOff size={28} />} title="Couldn't load the portfolio" message={list.error} action={<Button onClick={list.reload}>Try again</Button>} />
      )}

      {!list.error && !list.loading && photos.length === 0 && (
        <EmptyState icon={<ImageOff size={28} />} title="No photos yet" message="Add your first photo and it will appear on the Portfolio page." action={<Button icon={<Plus size={16} />} onClick={() => setModal({ open: true, photo: null })}>Add photo</Button>} />
      )}

      {!list.error && photos.length > 0 && shown.length === 0 && (
        <EmptyState icon={<ImageOff size={28} />} title="No photos match" message="Try a different category or clear the filters." />
      )}

      {shown.length > 0 && (
        <ul className="pa-grid">
          {shown.map((p) => (
            <li key={p.id} className="pa-card">
              <button type="button" className="pa-card__media" onClick={() => setModal({ open: true, photo: p })} aria-label={`Edit ${p.title}`}>
                <PortfolioImage item={p} className="pa-card__img" width={500} />
                {!p.isPublished && <Badge variant="warning" className="pa-card__badge">Draft</Badge>}
                {p.featured && <span className="pa-card__star" title="Featured on the home page"><Star size={14} fill="currentColor" /></span>}
              </button>
              <div className="pa-card__body">
                <h3 className="pa-card__title">{p.title}</h3>
                <p className="pa-card__meta">{categoryLabel(p.category)} · {when(p.createdAt)}</p>
                <div className="pa-card__actions">
                  <Button variant="ghost" size="sm" icon={<Pencil size={14} />} onClick={() => setModal({ open: true, photo: p })}>Edit</Button>
                  <Button variant="ghost" size="sm" icon={<Trash2 size={14} />} className="pa-danger" onClick={() => setToDelete(p)}>Delete</Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <PhotoFormModal isOpen={modal.open} photo={modal.photo} onClose={() => setModal({ open: false, photo: null })} onSaved={saved} />

      <ConfirmModal
        isOpen={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        danger
        title="Delete this photo?"
        message={toDelete ? `"${toDelete.title}" will be removed from your website and its stored file deleted. This can't be undone. To hide it without deleting, edit it and untick "Show on the website".` : ''}
        confirmText="Delete photo"
      />
    </div>
  );
}
