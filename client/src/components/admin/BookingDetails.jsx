import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Ban, Check, CheckCheck, Mail, Phone, RotateCcw, Save, Trash2, X } from 'lucide-react';
import Badge from '../common/Badge';
import Button from '../common/Button';
import Textarea from '../common/Textarea';
import ConfirmModal from '../common/ConfirmModal';
import useAuth from '../../hooks/useAuth';
import useFetch from '../../hooks/useFetch';
import { deleteBooking, getBooking, updateBooking } from '../../services/adminService';
import { LOCATIONS, SHOOT_TYPES, formatDate, formatTime, labelOf, money } from '../booking/bookingData';
import { STATUS_META, actionsFor, isFutureShoot } from '../../utils/bookingStatus';

const ICONS = { confirmed: Check, completed: CheckCheck, cancelled: Ban, pending: RotateCcw };
const stamp = (iso) => new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

function Row({ label, children }) {
  return <div className="drawer__row"><dt>{label}</dt><dd>{children}</dd></div>;
}

/**
 * Slide-in panel with everything about one booking and the buttons to move it along:
 *   Pending → Confirm / Cancel · Confirmed → Mark completed / Cancel · Cancelled → Reopen · Delete (any status)
 * `reference` is the AM-XXXXXX code (also in the URL as ?view=AM-XXXXXX, so it can be shared and Back closes it).
 */
export default function BookingDetails({ reference, onClose, onChanged, onDeleted }) {
  const { token } = useAuth();
  const { data, loading, error, reload } = useFetch(() => getBooking(token, reference), [token, reference]);
  const [booking, setBooking] = useState(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(''); // name of the action in progress
  const [actionError, setActionError] = useState('');
  const [confirm, setConfirm] = useState(null); // { kind: 'status', to, future? } | { kind: 'delete' }
  const panelRef = useRef(null);

  // The fetched booking becomes local state so an action can update the panel without another request
  useEffect(() => { setBooking(null); setActionError(''); setConfirm(null); }, [reference]);
  useEffect(() => { if (data) { setBooking(data); setNotes(data.adminNotes ?? ''); } }, [data]);
  const b = booking && booking.reference === reference ? booking : null;

  // Focus the panel, lock page scroll, hand focus back when closed
  useEffect(() => {
    const previous = document.activeElement;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => { document.body.style.overflow = ''; previous?.focus?.(); };
  }, []);

  // Esc closes the panel (but not while a confirmation dialog is open: that handles Esc itself)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !confirm) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, confirm]);

  const run = async (name, changes) => {
    setBusy(name);
    setActionError('');
    try {
      const updated = await updateBooking(token, reference, changes);
      setBooking(updated);
      setNotes(updated.adminNotes ?? '');
      onChanged();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy('');
      setConfirm(null);
    }
  };

  const remove = async () => {
    setBusy('delete');
    setActionError('');
    try {
      await deleteBooking(token, reference);
      onDeleted();
    } catch (err) {
      setActionError(err.message);
      setBusy('');
      setConfirm(null);
    }
  };

  const onAction = (to) => {
    if (to === 'cancelled') setConfirm({ kind: 'status', to });
    else if (to === 'completed' && isFutureShoot(b.date)) setConfirm({ kind: 'status', to, future: true });
    else run(to, { status: to });
  };

  const meta = b ? STATUS_META[b.status] : null;
  const shoot = b ? labelOf(SHOOT_TYPES, b.shootType) || b.shootType : '';
  const notesChanged = b ? notes !== (b.adminNotes ?? '') : false;

  let dialog = { title: '', message: '', confirmText: '' };
  if (b && confirm?.kind === 'delete') {
    dialog = { title: 'Delete this booking permanently?', confirmText: 'Delete', message: 'This cannot be undone and the customer is not notified. To keep a record and free the time slot, cancel the booking instead.' };
  } else if (b && confirm?.to === 'cancelled') {
    dialog = { title: 'Cancel this booking?', confirmText: 'Cancel booking', message: `${b.name}'s ${shoot.toLowerCase()} shoot on ${formatDate(b.date)} will be cancelled. The customer is emailed and the time slot is freed.` };
  } else if (b && confirm?.future) {
    dialog = { title: 'Mark as completed?', confirmText: 'Mark completed', message: `This shoot is on ${formatDate(b.date)}, which hasn't happened yet. Mark it completed anyway?` };
  }

  return createPortal(
    <div className="drawer" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside ref={panelRef} className="drawer__panel" role="dialog" aria-modal="true" aria-label={`Booking ${reference}`} tabIndex={-1}>
        <header className="drawer__head">
          <div>
            <p className="drawer__ref">{reference}</p>
            {meta && <Badge variant={meta.variant}>{meta.label}</Badge>}
          </div>
          <button type="button" className="drawer__close" onClick={onClose} aria-label="Close details"><X size={22} /></button>
        </header>

        <div className="drawer__body">
          {loading && !b && <div className="drawer__loading">{[0, 1, 2, 3].map((i) => <span key={i} className="skeleton bk-skeleton" aria-hidden="true" />)}</div>}

          {error && !b && (
            <p className="form-alert" role="alert">
              <AlertCircle size={18} /> {error} <button type="button" className="panel__retry" onClick={reload}>Try again</button>
            </p>
          )}

          {b && (
            <>
              <section>
                <h3 className="drawer__h">Customer</h3>
                <dl>
                  <Row label="Name">{b.name}</Row>
                  <Row label="Email"><a href={`mailto:${b.email}`}><Mail size={14} /> {b.email}</a></Row>
                  <Row label="Phone"><a href={`tel:${b.phone.replace(/[^\d+]/g, '')}`}><Phone size={14} /> {b.phone}</a></Row>
                </dl>
              </section>

              <section>
                <h3 className="drawer__h">Shoot</h3>
                <dl>
                  <Row label="Type">{shoot}</Row>
                  <Row label="Location">{labelOf(LOCATIONS, b.location) || b.location}{b.locationDetails ? ` · ${b.locationDetails}` : ''}</Row>
                  <Row label="People">{b.numberOfPeople}</Row>
                  <Row label="Style">{b.styles?.length ? b.styles.join(', ') : 'No preference'}</Row>
                  <Row label="Request">{b.specialRequest ? <span className="drawer__text">{b.specialRequest}</span> : 'None'}</Row>
                </dl>
              </section>

              <section>
                <h3 className="drawer__h">Schedule &amp; package</h3>
                <dl>
                  <Row label="Date">{formatDate(b.date)}</Row>
                  <Row label="Time">{formatTime(b.time)} · blocks {b.package?.durationHours}h</Row>
                  <Row label="Package">{b.package?.name} <small>({b.package?.duration})</small></Row>
                  <Row label="Price">{b.package?.price != null ? money(b.package.price) : 'Custom quote to follow'}</Row>
                  {b.budget && <Row label="Budget">{b.budget}</Row>}
                </dl>
              </section>

              <section>
                <h3 className="drawer__h">Private notes</h3>
                <Textarea id="admin-notes" maxLength={1000} placeholder="Only you can see these…" value={notes} onChange={(e) => setNotes(e.target.value)} />
                <Button variant="ghost" size="sm" icon={<Save size={15} />} onClick={() => run('notes', { adminNotes: notes })}
                  loading={busy === 'notes'} disabled={!notesChanged || !!busy} className="drawer__save">Save notes</Button>
              </section>

              <p className="drawer__stamps">Requested {stamp(b.createdAt)} · Updated {stamp(b.updatedAt)}</p>
            </>
          )}
        </div>

        {b && (
          <footer className="drawer__foot">
            {actionError && <p className="form-alert" role="alert"><AlertCircle size={18} /> {actionError}</p>}
            <div className="drawer__actions">
              {actionsFor(b.status).map(({ to, label, hint, style }) => {
                const Icon = ICONS[to];
                return (
                  <Button key={to} variant={style} icon={<Icon size={16} />} title={hint} onClick={() => onAction(to)}
                    loading={busy === to} disabled={!!busy && busy !== to}>
                    {label}
                  </Button>
                );
              })}
              <Button variant="ghost" icon={<Trash2 size={16} />} onClick={() => setConfirm({ kind: 'delete' })} disabled={!!busy} className="drawer__delete">Delete</Button>
            </div>
            {b.status === 'completed' && <p className="drawer__hint">Completed bookings are final.</p>}
          </footer>
        )}

        <ConfirmModal
          isOpen={!!confirm && !!b}
          onClose={() => setConfirm(null)}
          onConfirm={() => (confirm.kind === 'delete' ? remove() : run(confirm.to, { status: confirm.to }))}
          title={dialog.title}
          message={dialog.message}
          confirmText={dialog.confirmText}
          loading={!!busy}
          danger={confirm?.kind === 'delete' || confirm?.to === 'cancelled'}
        />
      </aside>
    </div>,
    document.body
  );
}
