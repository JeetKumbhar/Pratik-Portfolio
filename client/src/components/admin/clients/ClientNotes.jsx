import { useState } from 'react';
import { Lock, NotebookPen, Pencil, Trash2 } from 'lucide-react';
import Button from '../../common/Button';
import ConfirmModal from '../../common/ConfirmModal';
import EmptyState from '../../common/EmptyState';
import Textarea from '../../common/Textarea';
import useAuth from '../../../hooks/useAuth';
import { addClientNote, deleteClientNote, updateClientNote } from '../../../services/clientService';
import { NOTE_MAX, dateTime } from '../../../utils/clientUtils';

/**
 * Section D: private notes. Only admins ever receive them (the API is admin-only and no public response includes notes).
 *   notes: array from the API (newest first)   onChange(): reload the list after any change
 *   composerOpen / onComposerClose: the profile's "Add note" button opens the composer
 */
export default function ClientNotes({ clientId, notes, loading, error, onRetry, onChange, composerOpen, onComposerOpen, onComposerClose }) {
  const { token } = useAuth();
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(null); // { id, text }
  const [toDelete, setToDelete] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const run = async (fn, after) => {
    if (busy) return;
    setBusy(true); setMessage('');
    try { await fn(); after?.(); await onChange(); } catch (err) { setMessage(err.message || 'Something went wrong. Please try again.'); } finally { setBusy(false); }
  };

  const add = (e) => {
    e.preventDefault();
    if (!draft.trim()) { setMessage('Write something before saving.'); return; }
    run(() => addClientNote(token, clientId, draft.trim()), () => { setDraft(''); onComposerClose(); });
  };
  const saveEdit = (e) => {
    e.preventDefault();
    if (!editing.text.trim()) { setMessage('A note cannot be empty. Delete it instead.'); return; }
    run(() => updateClientNote(token, clientId, editing.id, editing.text.trim()), () => setEditing(null));
  };
  const remove = () => run(() => deleteClientNote(token, clientId, toDelete.id), () => setToDelete(null));

  return (
    <section className="panel cl-section" aria-labelledby="cl-notes-title">
      <div className="panel__head">
        <h2 className="panel__title" id="cl-notes-title">Private notes</h2>
        <span className="cl-private"><Lock size={13} aria-hidden="true" /> Only admins can see these</span>
      </div>

      <div className="cl-notes">
        {composerOpen ? (
          <form className="cl-note-form" onSubmit={add}>
            <Textarea label="New note" value={draft} onChange={(e) => { setDraft(e.target.value); setMessage(''); }} maxLength={NOTE_MAX} rows={4} autoFocus placeholder="Preferences, budget, things to remember…" />
            <div className="cl-note-form__actions">
              <Button variant="ghost" size="sm" onClick={() => { setDraft(''); setMessage(''); onComposerClose(); }} disabled={busy}>Cancel</Button>
              <Button size="sm" type="submit" loading={busy}>Save note</Button>
            </div>
          </form>
        ) : (
          !error && <Button variant="outline" size="sm" icon={<NotebookPen size={16} />} onClick={onComposerOpen}>Add note</Button>
        )}
        {message && <p className="cl-form__error" role="alert">{message}</p>}

        {error && <EmptyState title="Couldn't load notes" message={error} action={<Button onClick={onRetry}>Try again</Button>} />}
        {!error && loading && !notes && <span className="skeleton cl-skeleton" aria-hidden="true" />}
        {!error && notes && notes.length === 0 && !composerOpen && <p className="cl-muted">No notes yet. Notes you add here stay private to the admin team.</p>}

        {!error && notes && notes.length > 0 && (
          <ul className="cl-note-list">
            {notes.map((n) => (
              <li key={n.id} className="cl-note">
                {editing?.id === n.id ? (
                  <form className="cl-note-form" onSubmit={saveEdit}>
                    <Textarea label="Edit note" value={editing.text} onChange={(e) => { setEditing({ ...editing, text: e.target.value }); setMessage(''); }} maxLength={NOTE_MAX} rows={4} autoFocus />
                    <div className="cl-note-form__actions">
                      <Button variant="ghost" size="sm" onClick={() => { setEditing(null); setMessage(''); }} disabled={busy}>Cancel</Button>
                      <Button size="sm" type="submit" loading={busy}>Save</Button>
                    </div>
                  </form>
                ) : (
                  <>
                    <p className="cl-note__body">{n.body}</p>
                    <div className="cl-note__meta">
                      <span>{n.authorName || 'Admin'} · {dateTime(n.createdAt)}{n.editedAt ? ` · edited ${dateTime(n.editedAt)}` : ''}</span>
                      <span className="cl-note__actions">
                        <button type="button" onClick={() => { setEditing({ id: n.id, text: n.body }); setMessage(''); }} aria-label="Edit note"><Pencil size={15} /></button>
                        <button type="button" onClick={() => setToDelete(n)} aria-label="Delete note"><Trash2 size={15} /></button>
                      </span>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmModal
        isOpen={Boolean(toDelete)} onClose={() => !busy && setToDelete(null)} onConfirm={remove} loading={busy} danger
        title="Delete this note?" message="This permanently deletes the note. It cannot be undone." confirmText="Delete note"
      />
    </section>
  );
}
