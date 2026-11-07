import { useEffect, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { CheckCheck, CheckCircle2, ChevronLeft, ChevronRight, Inbox, Search, X } from 'lucide-react';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import MessageDetails from '../../components/admin/MessageDetails';
import WhatsAppInbox from '../../components/admin/WhatsAppInbox';
import { subjectLabelOptions } from '../../components/contact/contactData';
import useAdminServices from '../../hooks/useAdminServices';
import useAuth from '../../hooks/useAuth';
import useFetch from '../../hooks/useFetch';
import useDebounce from '../../hooks/useDebounce';
import { getMessages, markAllMessagesRead, updateMessage } from '../../services/adminService';
import { timeAgo } from '../../utils/adminNotifications';
import { previewText, subjectLabel } from '../../utils/messageUtils';
import { cx } from '../../utils/helpers';

const PAGE_SIZE = 20;
const TABS = [
  { value: '', label: 'All', stat: 'all' },
  { value: 'unread', label: 'Unread', stat: 'unread' },
  { value: 'read', label: 'Read', stat: 'read' },
];

/**
 * Admin → Messages has two inboxes, chosen with the switch at the top (the URL remembers it):
 *   Contact form  (default)  messages from the website's contact form, read in a side panel
 *   WhatsApp                 customers who wrote to your WhatsApp number: read the chat and reply (components/admin/WhatsAppInbox.jsx)
 */
export default function Messages() {
  const [params, setParams] = useSearchParams();
  const { contactUnread = 0, whatsappUnread = 0, refreshUnread } = useOutletContext() ?? {};
  const source = params.get('source') === 'whatsapp' ? 'whatsapp' : 'contact';
  const choose = (value) => setParams(value === 'whatsapp' ? { source: 'whatsapp' } : {}, { replace: true });

  return (
    <div className="msg-source">
      <div className="bk__tabs" role="group" aria-label="Choose an inbox">
        <button type="button" className={cx('bk-tab', source === 'contact' && 'is-active')} aria-pressed={source === 'contact'} onClick={() => choose('contact')}>
          Contact form{contactUnread > 0 && <span className="bk-tab__count">{contactUnread}</span>}
        </button>
        <button type="button" className={cx('bk-tab', source === 'whatsapp' && 'is-active')} aria-pressed={source === 'whatsapp'} onClick={() => choose('whatsapp')}>
          WhatsApp{whatsappUnread > 0 && <span className="bk-tab__count">{whatsappUnread}</span>}
        </button>
      </div>
      {source === 'whatsapp' ? <WhatsAppInbox onUnreadChanged={refreshUnread} /> : <ContactMessages />}
    </div>
  );
}

/**
 * Contact form → POST /api/messages → MongoDB → Admin → Messages.
 * View (opens the message and marks it read) · Mark as read / unread · Delete.
 * The URL holds the tab, search and page:  /admin/messages?filter=unread&search=sarah&page=2
 */
function ContactMessages() {
  const { token } = useAuth();
  const { services } = useAdminServices();
  const { refreshUnread } = useOutletContext() ?? {}; // keeps the sidebar badge in step
  const [params, setParams] = useSearchParams();

  const filter = ['unread', 'read'].includes(params.get('filter')) ? params.get('filter') : '';
  const search = params.get('search') ?? '';
  const page = Math.max(1, parseInt(params.get('page'), 10) || 1);

  const changeParams = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
    if (!('page' in patch)) next.delete('page'); // changing a filter goes back to page 1
    setParams(next, { replace: true });
  };

  // Search box: type freely, the list updates once you pause
  const [text, setText] = useState(search);
  const debounced = useDebounce(text, 400);
  useEffect(() => { setText(search); }, [search]);
  useEffect(() => { if (debounced.trim() !== search) changeParams({ search: debounced.trim() }); }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = useFetch(
    () => getMessages(token, { limit: PAGE_SIZE, page, ...(filter && { filter }), ...(search && { search }) }),
    [token, filter, search, page]
  );
  const res = list.data;
  const messages = res?.data ?? [];
  const counts = res?.counts;
  const total = res?.total ?? 0;
  const pages = res?.pages ?? 1;

  const [selected, setSelected] = useState(null);
  const [notice, setNotice] = useState('');
  const [markingAll, setMarkingAll] = useState(false);

  // Deleted the last message on the last page: step back
  useEffect(() => { if (res && page > res.pages) changeParams({ page: res.pages > 1 ? String(res.pages) : '' }); }, [res]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => { list.reload(); refreshUnread?.(); };

  const open = async (m) => {
    setNotice('');
    setSelected(m);
    if (m.status !== 'new') return;
    try { // opening an unread message marks it read (the button in the panel can undo that)
      const updated = await updateMessage(token, m.id, { status: 'read' });
      setSelected((s) => (s?.id === m.id ? updated : s));
      refresh();
    } catch { /* the message is still shown; the badge will catch up */ }
  };

  const markAll = async () => {
    setMarkingAll(true);
    try {
      const { updated } = await markAllMessagesRead(token);
      setNotice(`Marked ${updated} message${updated === 1 ? '' : 's'} as read.`);
      refresh();
    } catch (err) {
      setNotice(err.message);
    } finally {
      setMarkingAll(false);
    }
  };

  const filtered = Boolean(filter || search);

  return (
    <div className="msg">
      <div className="bk__tabs" role="group" aria-label="Filter messages">
        {TABS.map(({ value, label, stat }) => (
          <button key={label} type="button" className={cx('bk-tab', filter === value && 'is-active')} aria-pressed={filter === value} onClick={() => changeParams({ filter: value })}>
            {label}
            {counts && <span className="bk-tab__count">{counts[stat]}</span>}
          </button>
        ))}
      </div>

      <div className="bk__tools">
        <label className="bk-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Search messages</span>
          <input type="search" placeholder="Search name, email or message" value={text} onChange={(e) => setText(e.target.value)} maxLength={50} />
        </label>
        {filtered && <button type="button" className="bk-clear" onClick={() => { setText(''); setParams(new URLSearchParams(), { replace: true }); }}><X size={14} /> Clear</button>}
        {counts?.unread > 0 && (
          <Button variant="ghost" size="sm" icon={<CheckCheck size={15} />} onClick={markAll} loading={markingAll}>Mark all as read</Button>
        )}
      </div>

      {notice && (
        <p className="msg-notice" role="status"><CheckCircle2 size={18} /> {notice}<button type="button" onClick={() => setNotice('')} aria-label="Dismiss">×</button></p>
      )}

      <section className="bk-table" aria-busy={list.loading}>
        {list.error && <EmptyState icon={<Inbox size={28} />} title="Couldn't load messages" message={list.error} action={<Button onClick={list.reload}>Try again</Button>} />}

        {!list.error && messages.length === 0 && list.loading && (
          <div className="bk-skeletons">{[0, 1, 2, 3].map((i) => <span key={i} className="skeleton bk-skeleton" aria-hidden="true" />)}</div>
        )}

        {!list.error && messages.length === 0 && !list.loading && (
          <EmptyState icon={<Inbox size={28} />} title={filtered ? 'No messages match' : 'No messages yet'}
            message={filtered ? 'Try a different tab or clear the search.' : 'Messages sent through the contact form will appear here.'} />
        )}

        {!list.error && messages.length > 0 && (
          <ul className={cx('msg-list', list.loading && 'is-loading')}>
            {messages.map((m) => (
              <li key={m.id}>
                <button type="button" className={cx('msg-row', m.status === 'new' && 'is-unread', selected?.id === m.id && 'is-active')} onClick={() => open(m)}
                  aria-label={`${m.status === 'new' ? 'Unread message' : 'Message'} from ${m.name}`}>
                  <span className="msg-dot" aria-hidden="true" />
                  <span className="msg-row__who"><strong>{m.name}</strong><small>{subjectLabel(m.subject, subjectLabelOptions(services))}</small></span>
                  <span className="msg-row__text">{previewText(m.message)}</span>
                  <span className="msg-row__time">{timeAgo(m.createdAt)}</span>
                  <ChevronRight size={18} className="msg-row__chevron" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {!list.error && total > 0 && (
          <footer className="bk-pager">
            <span>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(total, page * PAGE_SIZE)} of {total}</span>
            <div>
              <button type="button" onClick={() => changeParams({ page: page > 2 ? String(page - 1) : '' })} disabled={page <= 1 || list.loading} aria-label="Previous page"><ChevronLeft size={18} /></button>
              <span className="bk-pager__page">Page {page} of {pages}</span>
              <button type="button" onClick={() => changeParams({ page: String(page + 1) })} disabled={page >= pages || list.loading} aria-label="Next page"><ChevronRight size={18} /></button>
            </div>
          </footer>
        )}
      </section>

      {selected && (
        <MessageDetails
          message={selected}
          onClose={() => setSelected(null)}
          onChanged={(updated) => { setSelected(updated); refresh(); }}
          onDeleted={() => { setSelected(null); setNotice('Message deleted.'); refresh(); }}
        />
      )}
    </div>
  );
}
