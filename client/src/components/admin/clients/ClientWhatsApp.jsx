import { CloudOff, MessageCircle } from 'lucide-react';
import Badge from '../../common/Badge';
import Button from '../../common/Button';
import EmptyState from '../../common/EmptyState';
import { conversationPath, dateTime, directionLabel } from '../../../utils/clientUtils';

/**
 * Section C: a SUMMARY of the client's WhatsApp conversation. The chat itself stays in Admin → Messages → WhatsApp
 * (this card only links there; it does not read or store messages).
 *   whatsapp: { available, conversation } from the API, or undefined while loading
 */
export default function ClientWhatsApp({ whatsapp, loading, error, onRetry }) {
  const c = whatsapp?.conversation;
  return (
    <section className="panel cl-section" aria-labelledby="cl-wa-title" aria-busy={loading}>
      <div className="panel__head">
        <h2 className="panel__title" id="cl-wa-title">WhatsApp conversation</h2>
        {c && <Button to={conversationPath(c.id)} variant="outline" size="sm" icon={<MessageCircle size={16} />}>View conversation</Button>}
      </div>

      {error && <EmptyState icon={<CloudOff size={28} />} title="Couldn't load the conversation" message={error} action={<Button onClick={onRetry}>Try again</Button>} />}
      {!error && !whatsapp && loading && <div className="cl-skeleton-wrap"><span className="skeleton cl-skeleton" aria-hidden="true" /></div>}
      {!error && whatsapp && !c && (
        <EmptyState icon={<MessageCircle size={28} />} title="No WhatsApp conversation" message="This client has not messaged your WhatsApp number yet. If they do, a summary will appear here." />
      )}

      {!error && c && (
        <dl className="cl-wa">
          <div><dt>Conversation</dt><dd>Available</dd></div>
          <div><dt>Last message</dt><dd className="cl-wa__preview">{c.lastMessagePreview || 'No text'}</dd></div>
          <div><dt>Date and time</dt><dd>{dateTime(c.lastMessageAt) || '—'}</dd></div>
          <div><dt>Direction</dt><dd>{directionLabel(c.lastMessageDirection) || '—'}</dd></div>
          <div>
            <dt>Unread</dt>
            <dd>{c.unreadCount > 0 ? <Badge variant="gold">{c.unreadCount} unread</Badge> : 'All read'}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}
