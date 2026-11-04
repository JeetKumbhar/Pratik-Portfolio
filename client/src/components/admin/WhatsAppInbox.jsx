import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, CheckCheck, Clock, Inbox, Search, Send, X } from 'lucide-react';
import Button from '../common/Button';
import EmptyState from '../common/EmptyState';
import useAuth from '../../hooks/useAuth';
import useDebounce from '../../hooks/useDebounce';
import usePolling from '../../hooks/usePolling';
import { getWhatsAppConversations, getWhatsAppThread, markWhatsAppRead, sendWhatsAppReply } from '../../services/adminService';
import {
  DELIVERY_TEXT, REPLY_MAX, charCount, displayName, formatPhone, groupByDay, listTime, newRequestId, timeLabel, typeLabel, windowLeft,
} from '../../utils/whatsappInbox';
import { cx } from '../../utils/helpers';

const LIST_REFRESH_MS = 10000;
const THREAD_REFRESH_MS = 8000;

/**
 * Admin → Messages → WhatsApp.
 * Left: every customer conversation (newest first). Right: the chat, with a box to reply.
 * What the customer sent arrives through Meta's webhook and is stored by the server; a reply goes
 * browser → our server → WhatsApp → the customer's phone. The browser never sees the WhatsApp token.
 * The page refreshes itself every few seconds while it is open. The URL holds the chat and the search:
 *   /admin/messages?source=whatsapp&chat=<id>&search=priya&unread=1
 */
export default function WhatsAppInbox({ onUnreadChanged }) {
  const { token } = useAuth();
  const [params, setParams] = useSearchParams();
  const chat = params.get('chat') || '';
  const search = params.get('search') ?? '';
  const unreadOnly = params.get('unread') === '1';

  const change = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
    setParams(next, { replace: true });
  };

  const [text, setText] = useState(search);
  const debounced = useDebounce(text, 400);
  useEffect(() => { setText(search); }, [search]);
  useEffect(() => { if (debounced.trim() !== search) change({ search: debounced.trim() }); }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = usePolling(
    () => getWhatsAppConversations(token, { limit: 100, ...(search && { search }), ...(unreadOnly && { unread: '1' }) }),
    [token, search, unreadOnly],
    LIST_REFRESH_MS
  );
  const conversations = list.data?.data ?? [];
  const counts = list.data?.counts;
  const filtered = Boolean(search || unreadOnly);

  const changed = () => { list.reload(); onUnreadChanged?.(); };

  return (
    <div className={cx('wa', chat && 'has-chat')}>
      <section className="wa__list" aria-label="WhatsApp conversations">
        <div className="wa__tools">
          <label className="bk-search">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">Search WhatsApp conversations</span>
            <input type="search" placeholder="Search name or number" value={text} onChange={(e) => setText(e.target.value)} maxLength={50} />
          </label>
          <div className="wa__filters" role="group" aria-label="Filter conversations">
            <button type="button" className={cx('bk-tab', !unreadOnly && 'is-active')} aria-pressed={!unreadOnly} onClick={() => change({ unread: '' })}>
              All{counts && <span className="bk-tab__count">{counts.all}</span>}
            </button>
            <button type="button" className={cx('bk-tab', unreadOnly && 'is-active')} aria-pressed={unreadOnly} onClick={() => change({ unread: '1' })}>
              Unread{counts && <span className="bk-tab__count">{counts.unread}</span>}
            </button>
            {filtered && <button type="button" className="bk-clear" onClick={() => { setText(''); change({ search: '', unread: '' }); }}><X size={14} /> Clear</button>}
          </div>
        </div>

        {list.error && conversations.length === 0 && (
          <EmptyState icon={<Inbox size={28} />} title="Couldn't load conversations" message={list.error} action={<Button onClick={list.reload}>Try again</Button>} />
        )}
        {list.error && conversations.length > 0 && <p className="wa__offline" role="status">Connection problem. Showing the last loaded list; retrying…</p>}

        {!list.error && list.loading && !list.data && (
          <div className="bk-skeletons">{[0, 1, 2, 3].map((i) => <span key={i} className="skeleton bk-skeleton" aria-hidden="true" />)}</div>
        )}

        {list.data && conversations.length === 0 && !list.error && (
          <EmptyState icon={<Inbox size={28} />} title={filtered ? 'No conversations match' : 'No WhatsApp messages yet'}
            message={filtered ? 'Try a different search or clear the filter.' : 'Messages customers send to your WhatsApp number will appear here.'} />
        )}

        {conversations.length > 0 && (
          <ul className="wa__rows">
            {conversations.map((c) => (
              <li key={c.id}>
                <button type="button" className={cx('wa-row', c.unreadCount > 0 && 'is-unread', chat === c.id && 'is-active')} aria-current={chat === c.id || undefined}
                  onClick={() => change({ chat: c.id })} aria-label={`${displayName(c)}${c.unreadCount ? `, ${c.unreadCount} unread` : ''}`}>
                  <span className="wa-row__who"><strong>{displayName(c)}</strong>{c.name && <small>{formatPhone(c.phone)}</small>}</span>
                  <span className="wa-row__time">{listTime(c.lastMessageAt)}</span>
                  <span className="wa-row__text">{c.lastMessageDirection === 'outgoing' && <span className="wa-row__you">You: </span>}{c.lastMessagePreview}</span>
                  {c.unreadCount > 0 && <span className="wa-row__badge" aria-hidden="true">{c.unreadCount > 99 ? '99+' : c.unreadCount}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="wa__thread" aria-label="Conversation">
        {chat
          ? <Thread key={chat} id={chat} token={token} onBack={() => change({ chat: '' })} onChanged={changed} />
          : <div className="wa__placeholder"><EmptyState icon={<Inbox size={28} />} title="Select a conversation" message="Pick a customer on the left to read the chat and reply." /></div>}
      </section>
    </div>
  );
}

function Tick({ status }) {
  const label = DELIVERY_TEXT[status] ?? '';
  return (
    <span className={cx('wa-tick', `wa-tick--${status}`)} title={label}>
      {status === 'sending' && <Clock size={13} aria-hidden="true" />}
      {status === 'sent' && <Check size={14} aria-hidden="true" />}
      {(status === 'delivered' || status === 'read') && <CheckCheck size={14} aria-hidden="true" />}
      {status === 'failed' && <span aria-hidden="true">!</span>}
      <span className="sr-only">{label}</span>
    </span>
  );
}

function Thread({ id, token, onBack, onChanged }) {
  const thread = usePolling(() => getWhatsAppThread(token, id), [token, id], THREAD_REFRESH_MS);
  const { conversation, messages = [], reply } = thread.data ?? {};

  // The minute-by-minute "left in the reply window" text
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);

  // Reading the chat marks it read, and so does every new customer message that arrives while it is open.
  // This runs after EVERY refresh (not only when the number changes): a message that lands while a refresh is already in
  // flight, or a mark-as-read that failed once, is then picked up by the next refresh instead of staying unread.
  const unread = conversation?.unreadCount ?? 0;
  const marking = useRef(false);
  useEffect(() => {
    if (!unread || marking.current || document.visibilityState !== 'visible') return;
    marking.current = true;
    markWhatsAppRead(token, id)
      .then(() => { thread.reload(); onChanged(); })
      .catch(() => { /* the next refresh tries again */ })
      .finally(() => { marking.current = false; });
  }, [thread.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stay at the newest message, unless the admin has scrolled up to read older ones
  const log = useRef(null);
  const stick = useRef(true);
  const onScroll = () => { const el = log.current; if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120; };
  const last = messages[messages.length - 1];
  useEffect(() => { const el = log.current; if (el && stick.current) el.scrollTop = el.scrollHeight; }, [messages.length, last?.deliveryStatus]);

  // ---- replying
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef('');
  const box = useRef(null);
  const canReply = Boolean(reply?.windowOpen) && !reply?.optedOut;
  const count = charCount(draft);
  const tooLong = count > REPLY_MAX;
  const left = windowLeft(reply?.windowExpiresAt, now);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending || tooLong || !canReply) return;
    setSending(true);
    setError('');
    if (!requestId.current) requestId.current = newRequestId(); // kept while we do not know the outcome, so a retry can never double-send
    try {
      await sendWhatsAppReply(token, id, { text: body, clientRequestId: requestId.current });
      requestId.current = '';
      setDraft('');
      stick.current = true;
      thread.reload();
      onChanged();
    } catch (err) {
      if (err.status !== 0) { requestId.current = ''; thread.reload(); onChanged(); } // the server answered, so this attempt is settled; status 0 = unknown, keep the id
      setError(err.status === 0 ? 'Could not confirm that the reply was sent. Check the chat before sending again; if you press Send again it will not be sent twice.' : err.message);
    } finally {
      setSending(false);
      box.current?.focus();
    }
  };

  const enterSends = typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches;
  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && enterSends) { e.preventDefault(); send(); } // isComposing: Marathi/Hindi keyboards use Enter to pick a word
  };

  if (thread.error && !thread.data) {
    return (
      <div className="wa__placeholder">
        <button type="button" className="wa-back" onClick={onBack}><ArrowLeft size={18} /> Conversations</button>
        <EmptyState icon={<Inbox size={28} />} title="Couldn't open this chat" message={thread.error} action={<Button onClick={thread.reload}>Try again</Button>} />
      </div>
    );
  }
  if (!thread.data) return <div className="wa__placeholder" aria-busy="true"><span className="skeleton bk-skeleton" aria-hidden="true" /></div>;

  return (
    <>
      <header className="wa-head">
        <button type="button" className="wa-back" onClick={onBack} aria-label="Back to conversations"><ArrowLeft size={20} /></button>
        <div className="wa-head__who"><strong>{displayName(conversation)}</strong>{conversation.name && <small>{formatPhone(conversation.phone)}</small>}</div>
        {canReply && left && <span className="wa-head__window" title="WhatsApp only allows free-text replies within 24 hours of the customer's last message">{left}</span>}
      </header>

      {thread.error && <p className="wa__offline" role="status">Connection problem. Retrying…</p>}

      <div className="wa-log" ref={log} onScroll={onScroll} role="log" aria-live="polite" aria-label="Messages">
        {messages.length === 0 && <p className="wa-empty">No messages in this conversation yet.</p>}
        {groupByDay(messages, now).map((day) => (
          <div key={day.key} className="wa-day">
            <span className="wa-day__label">{day.label}</span>
            {day.messages.map((m) => (
              <div key={m.id} className={cx('wa-bubble', m.direction === 'outgoing' ? 'is-out' : 'is-in', m.deliveryStatus === 'failed' && 'is-failed')}>
                {m.type === 'text'
                  ? <p className="wa-bubble__text">{m.text}</p>
                  : <p className="wa-bubble__media">[{typeLabel(m.type)}] <small>Open WhatsApp on your phone to see it.</small></p>}
                <span className="wa-bubble__meta">
                  {timeLabel(m.waTimestamp)}
                  {m.direction === 'outgoing' && <Tick status={m.deliveryStatus} />}
                </span>
                {m.deliveryStatus === 'failed' && <span className="wa-bubble__error">{m.errorText || 'WhatsApp could not deliver this message.'}</span>}
              </div>
            ))}
          </div>
        ))}
      </div>

      <footer className="wa-composer">
        {reply.optedOut && <p className="wa-composer__note">This customer sent STOP, so no messages can be sent to them. They can send START to opt in again.</p>}
        {!reply.optedOut && !reply.windowOpen && (
          <p className="wa-composer__note">The 24-hour reply window has closed. WhatsApp only allows free-text replies within 24 hours of the customer's last message. You can reply again once they message you.</p>
        )}
        {error && <p className="wa-composer__error" role="alert">{error}</p>}
        <div className="wa-composer__row">
          <textarea
            ref={box} rows={2} value={draft} disabled={!canReply} placeholder={canReply ? 'Write a reply…' : 'Replies are not possible right now'}
            onChange={(e) => setDraft(e.target.value)} onKeyDown={onKeyDown} aria-label="Reply" aria-invalid={tooLong || undefined}
          />
          <Button onClick={send} loading={sending} disabled={!canReply || !draft.trim() || tooLong} icon={<Send size={16} />} aria-label="Send reply">Send</Button>
        </div>
        {canReply && (count > REPLY_MAX * 0.8 || tooLong) && <small className={cx('wa-composer__count', tooLong && 'is-over')}>{count} / {REPLY_MAX}</small>}
      </footer>
    </>
  );
}
