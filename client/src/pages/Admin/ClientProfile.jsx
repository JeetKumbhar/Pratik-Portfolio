import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, CloudOff, MessageCircle, NotebookPen, Pencil, UserRoundX } from 'lucide-react';
import BookingDetails from '../../components/admin/BookingDetails';
import ClientBookings from '../../components/admin/clients/ClientBookings';
import ClientFormModal from '../../components/admin/clients/ClientFormModal';
import ClientNotes from '../../components/admin/clients/ClientNotes';
import ClientWhatsApp from '../../components/admin/clients/ClientWhatsApp';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import useAuth from '../../hooks/useAuth';
import useFetch from '../../hooks/useFetch';
import { getClient, getClientBookings, getClientNotes, getClientWhatsApp } from '../../services/clientService';
import { conversationPath, initials, shortDate, sourceLabel, typeLabel } from '../../utils/clientUtils';

/**
 * Admin → Clients → one client. Four sections: information, booking history, WhatsApp summary, private notes.
 * Each section loads on its own, so one failing request does not blank the page.
 */
export default function ClientProfile() {
  const { id } = useParams();
  const { token } = useAuth();
  const location = useLocation();

  const client = useFetch(() => getClient(token, id), [token, id]);
  const [bookingFilter, setBookingFilter] = useState('all');
  const bookings = useFetch(() => getClientBookings(token, id, bookingFilter), [token, id, bookingFilter]);
  const whatsapp = useFetch(() => getClientWhatsApp(token, id), [token, id]);
  const notes = useFetch(() => getClientNotes(token, id), [token, id]);

  const [editing, setEditing] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [openRef, setOpenRef] = useState(null); // booking shown in the details drawer
  const [notice, setNotice] = useState(location.state?.notice ?? '');

  useEffect(() => { if (!notice) return undefined; const t = setTimeout(() => setNotice(''), 5000); return () => clearTimeout(t); }, [notice]);

  const c = client.data;
  const conversation = whatsapp.data?.conversation ?? null;

  // A booking was confirmed, completed, cancelled or deleted in the drawer: the numbers and the list change too
  const bookingChanged = () => { bookings.reload(); client.reload(); whatsapp.reload(); };

  if (client.loading && !c) {
    return <div className="cl-profile"><span className="skeleton cl-skeleton cl-skeleton--tall" aria-hidden="true" /></div>;
  }
  if (client.error && !c) {
    const missing = /not found/i.test(client.error);
    return (
      <div className="cl-profile">
        <Link to="/admin/clients" className="cl-back"><ArrowLeft size={16} aria-hidden="true" /> All clients</Link>
        <section className="panel">
          <EmptyState
            icon={missing ? <UserRoundX size={28} /> : <CloudOff size={28} />}
            title={missing ? 'Client not found' : "Couldn't load this client"}
            message={missing ? 'This client does not exist or the link is out of date.' : client.error}
            action={missing ? <Button to="/admin/clients">Back to clients</Button> : <Button onClick={client.reload}>Try again</Button>}
          />
        </section>
      </div>
    );
  }

  const summary = c.summary;
  return (
    <div className="cl-profile">
      <Link to="/admin/clients" className="cl-back"><ArrowLeft size={16} aria-hidden="true" /> All clients</Link>
      {notice && <p className="cl-notice" role="status">{notice}</p>}

      {/* A. Client information */}
      <section className="panel cl-section" aria-labelledby="cl-info-title">
        <div className="cl-hero">
          <span className="cl-avatar cl-avatar--lg" aria-hidden="true">{initials(c.name)}</span>
          <div className="cl-hero__text">
            <h1 className="cl-hero__name" id="cl-info-title">{c.name}</h1>
            <Badge variant={summary.type === 'repeat' ? 'gold' : 'neutral'}>{typeLabel(summary.type)} client</Badge>
          </div>
          <div className="cl-hero__actions">
            <Button variant="outline" size="sm" icon={<Pencil size={16} />} onClick={() => setEditing(true)}>Edit client</Button>
            {conversation ? (
              <Button variant="outline" size="sm" icon={<MessageCircle size={16} />} to={conversationPath(conversation.id)}>WhatsApp contact</Button>
            ) : (
              <Button variant="outline" size="sm" icon={<MessageCircle size={16} />} disabled title={whatsapp.loading ? 'Checking for a conversation' : 'No WhatsApp conversation with this client yet'}>WhatsApp contact</Button>
            )}
            <Button size="sm" icon={<NotebookPen size={16} />} onClick={() => { setComposerOpen(true); document.getElementById('cl-notes-title')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}>Add note</Button>
          </div>
        </div>
        <dl className="cl-info">
          <div><dt>Phone</dt><dd>{c.phone}</dd></div>
          <div><dt>Email</dt><dd>{c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : <span className="cl-muted">Not added</span>}</dd></div>
          <div><dt>City</dt><dd>{c.city || <span className="cl-muted">Not added</span>}</dd></div>
          <div><dt>Client since</dt><dd>{shortDate(c.createdAt)}</dd></div>
          <div><dt>Total bookings</dt><dd>{summary.totalBookings}{summary.upcomingBookings > 0 && <> · {summary.upcomingBookings} upcoming</>}</dd></div>
          <div><dt>Client type</dt><dd>{typeLabel(summary.type)}</dd></div>
          <div><dt>Added from</dt><dd>{sourceLabel(c.source)}</dd></div>
        </dl>
      </section>

      {/* B. Booking history */}
      <ClientBookings
        bookings={bookings.data?.data} counts={bookings.data?.counts} filter={bookingFilter} onFilter={setBookingFilter}
        loading={bookings.loading} error={bookings.error} onRetry={bookings.reload} onOpen={setOpenRef}
      />

      {/* C. WhatsApp summary (the chat itself lives in Messages → WhatsApp) */}
      <ClientWhatsApp whatsapp={whatsapp.data} loading={whatsapp.loading} error={whatsapp.error} onRetry={whatsapp.reload} />

      {/* D. Private notes */}
      <ClientNotes
        clientId={id} notes={notes.data} loading={notes.loading} error={notes.error} onRetry={notes.reload} onChange={async () => notes.reload()}
        composerOpen={composerOpen} onComposerOpen={() => setComposerOpen(true)} onComposerClose={() => setComposerOpen(false)}
      />

      <ClientFormModal
        isOpen={editing} onClose={() => setEditing(false)} client={c}
        onSaved={() => { setEditing(false); setNotice('Client updated.'); client.reload(); whatsapp.reload(); }}
      />

      {openRef && (
        <BookingDetails
          reference={openRef} onClose={() => setOpenRef(null)} onChanged={bookingChanged}
          onDeleted={() => { setOpenRef(null); bookingChanged(); }}
        />
      )}
    </div>
  );
}
