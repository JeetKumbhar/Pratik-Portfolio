import { Inbox } from 'lucide-react';

/**
 * <EmptyState title="No photos yet" message="Check back soon." action={<Button to="/">Go home</Button>} />
 */
export default function EmptyState({ icon, title = 'Nothing here yet', message, action }) {
  return (
    <div className="empty">
      <span className="empty__icon">{icon || <Inbox size={28} />}</span>
      <h3 className="empty__title">{title}</h3>
      {message && <p className="empty__message">{message}</p>}
      {action && <div className="empty__action">{action}</div>}
    </div>
  );
}
