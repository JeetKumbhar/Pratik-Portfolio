import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Mail, MailOpen, Phone, Reply, Trash2, X } from 'lucide-react';
import Badge from '../common/Badge';
import Button from '../common/Button';
import ConfirmModal from '../common/ConfirmModal';
import useAuth from '../../hooks/useAuth';
import { deleteMessage, updateMessage } from '../../services/adminService';
import { SUBJECT_OPTIONS } from '../contact/contactData';
import { replyHref, subjectLabel } from '../../utils/messageUtils';

const stamp = (iso) => new Date(iso).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' });

function Row({ label, children }) {
  return <div className="drawer__row"><dt>{label}</dt><dd>{children}</dd></div>;
}

/** One message in full, with: Reply (opens your email app) · Mark as read / unread · Delete. */
export default function MessageDetails({ message: m, onClose, onChanged, onDeleted }) {
  const { token } = useAuth();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const panelRef = useRef(null);
  const topic = subjectLabel(m.subject, SUBJECT_OPTIONS);
  const unread = m.status === 'new';

  useEffect(() => { setError(''); setConfirming(false); }, [m.id]);

  // Focus the panel, lock page scroll, hand focus back when closed
  useEffect(() => {
    const previous = document.activeElement;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => { document.body.style.overflow = ''; previous?.focus?.(); };
  }, []);

  // Esc closes the panel (but not while the delete confirmation is open: that handles Esc itself)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !confirming) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, confirming]);

  const toggleRead = async () => {
    setBusy('read');
    setError('');
    try {
      onChanged(await updateMessage(token, m.id, { status: unread ? 'read' : 'new' }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const remove = async () => {
    setBusy('delete');
    setError('');
    try {
      await deleteMessage(token, m.id);
      onDeleted();
    } catch (err) {
      setError(err.message);
      setBusy('');
      setConfirming(false);
    }
  };

  return createPortal(
    <div className="drawer" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside ref={panelRef} className="drawer__panel" role="dialog" aria-modal="true" aria-label={`Message from ${m.name}`} tabIndex={-1}>
        <header className="drawer__head">
          <div>
            <p className="msg-detail__name">{m.name}</p>
            <Badge variant={unread ? 'warning' : 'neutral'}>{unread ? 'Unread' : 'Read'}</Badge>
          </div>
          <button type="button" className="drawer__close" onClick={onClose} aria-label="Close message"><X size={22} /></button>
        </header>

        <div className="drawer__body">
          <section>
            <h3 className="drawer__h">Sender</h3>
            <dl>
              <Row label="Email"><a href={`mailto:${m.email}`}><Mail size={14} /> {m.email}</a></Row>
              {m.phone && <Row label="Phone"><a href={`tel:${m.phone.replace(/[^\d+]/g, '')}`}><Phone size={14} /> {m.phone}</a></Row>}
              <Row label="About">{topic}</Row>
              <Row label="Received">{stamp(m.createdAt)}</Row>
            </dl>
          </section>

          <section>
            <h3 className="drawer__h">Message</h3>
            {/* React escapes this text, so nothing a visitor types can run as code */}
            <p className="msg-detail__text">{m.message}</p>
          </section>
        </div>

        <footer className="drawer__foot">
          {error && <p className="form-alert" role="alert"><AlertCircle size={18} /> {error}</p>}
          <div className="drawer__actions">
            <Button href={replyHref(m, topic)} icon={<Reply size={16} />}>Reply by email</Button>
            <Button variant="ghost" icon={unread ? <MailOpen size={16} /> : <Mail size={16} />} onClick={toggleRead} loading={busy === 'read'} disabled={!!busy}>
              {unread ? 'Mark as read' : 'Mark as unread'}
            </Button>
            <Button variant="ghost" icon={<Trash2 size={16} />} onClick={() => setConfirming(true)} disabled={!!busy} className="drawer__delete">Delete</Button>
          </div>
        </footer>

        <ConfirmModal
          isOpen={confirming}
          onClose={() => setConfirming(false)}
          onConfirm={remove}
          loading={busy === 'delete'}
          danger
          title="Delete this message?"
          message={`The message from ${m.name} will be deleted permanently. Copy anything you need first, such as their email address.`}
          confirmText="Delete message"
        />
      </aside>
    </div>,
    document.body
  );
}
