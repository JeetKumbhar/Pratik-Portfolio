import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, BellRing, CheckCircle2, ChevronLeft, ChevronRight, Info, RotateCcw } from 'lucide-react';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import useAuth from '../../hooks/useAuth';
import useFetch from '../../hooks/useFetch';
import { getNotifications, retryNotification } from '../../services/adminService';
import { timeAgo } from '../../utils/adminNotifications';
import { EVENT_LABELS, STATUS_META, TABS, canRetry, setupProblem } from '../../utils/notificationUtils';
import { cx } from '../../utils/helpers';

const PAGE_SIZE = 20;

/**
 * Admin > Notifications: every WhatsApp message the website tried to send, what happened to it, and a Retry button.
 * "Sent to WhatsApp" = WhatsApp accepted it. "Delivered" / "Read" arrive later through the webhook.
 */
export default function Notifications() {
  const { token } = useAuth();
  const [params, setParams] = useSearchParams();
  const status = TABS.some((t) => t.value === params.get('status') && t.value) ? params.get('status') : '';
  const page = Math.max(1, parseInt(params.get('page'), 10) || 1);

  const [busyId, setBusyId] = useState('');
  const [notice, setNotice] = useState(null); // { text, warn }

  const list = useFetch(() => getNotifications(token, { limit: PAGE_SIZE, page, ...(status && { status }) }), [token, status, page]);
  const res = list.data;
  const rows = res?.data ?? [];
  const counts = res?.counts;
  const total = res?.total ?? 0;
  const pages = res?.pages ?? 1;
  const problem = setupProblem(res?.config);

  const change = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };
  useEffect(() => { if (res && page > res.pages) change({ page: res.pages > 1 ? String(res.pages) : '' }); }, [res]); // eslint-disable-line react-hooks/exhaustive-deps

  const retry = async (row) => {
    setBusyId(row.id);
    setNotice(null);
    try {
      const result = await retryNotification(token, row.id);
      setNotice({ text: result.message, warn: result.data?.status === 'failed' });
      list.reload();
    } catch (err) {
      setNotice({ text: err.message, warn: true });
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="nt">
      {problem && (
        <p className={cx('nt-banner', problem.level === 'warn' && 'nt-banner--warn')} role="status">
          {problem.level === 'warn' ? <AlertTriangle size={18} /> : <Info size={18} />}
          <span>{problem.text} <small>Setup steps: docs/WHATSAPP_SETUP.md</small></span>
        </p>
      )}

      {notice && (
        <p className={cx('nt-notice', notice.warn && 'nt-notice--warn')} role="status">
          {notice.warn ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />} {notice.text}
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">×</button>
        </p>
      )}

      <div className="bk__tabs" role="group" aria-label="Filter by status">
        {TABS.map(({ value, label, stat }) => (
          <button key={label} type="button" className={cx('bk-tab', status === value && 'is-active')} aria-pressed={status === value} onClick={() => change({ status: value })}>
            {label}
            {counts && <span className="bk-tab__count">{counts[stat]}</span>}
          </button>
        ))}
      </div>

      <section className="bk-table" aria-busy={list.loading}>
        {list.error && <EmptyState icon={<BellRing size={28} />} title="Couldn't load notifications" message={list.error} action={<Button onClick={list.reload}>Try again</Button>} />}

        {!list.error && rows.length === 0 && list.loading && (
          <div className="bk-skeletons">{[0, 1, 2, 3].map((i) => <span key={i} className="skeleton bk-skeleton" aria-hidden="true" />)}</div>
        )}

        {!list.error && rows.length === 0 && !list.loading && (
          <EmptyState icon={<BellRing size={28} />} title={status ? 'Nothing here' : 'No WhatsApp notifications yet'}
            message={status ? 'No notifications have this status.' : 'They appear here after a booking or contact message arrives (once WhatsApp is connected).'} />
        )}

        {!list.error && rows.length > 0 && (
          <ul className={cx('nt-list', list.loading && 'is-loading')}>
            {rows.map((r) => {
              const meta = STATUS_META[r.status] ?? STATUS_META.pending;
              return (
                <li key={r.id} className="nt-row">
                  <div className="nt-row__main">
                    <p className="nt-row__event">{EVENT_LABELS[r.event] ?? r.event}</p>
                    <p className="nt-row__meta">
                      {r.refType === 'booking' ? <Link to={`/admin/bookings?view=${r.refLabel}`}>{r.refLabel}</Link> : r.refLabel}
                      {' · '}{r.recipientRole === 'photographer' ? 'you' : 'customer'} {r.recipientHint}
                      {' · '}{timeAgo(r.createdAt)}
                      {r.attempts > 1 && ` · ${r.attempts} attempts`}
                    </p>
                    {r.lastError && <p className="nt-row__error">{r.lastError}</p>}
                  </div>
                  <span title={meta.hint}><Badge variant={meta.variant}>{meta.label}</Badge></span>
                  {canRetry(r) ? (
                    <Button variant="ghost" size="sm" icon={<RotateCcw size={14} />} onClick={() => retry(r)} loading={busyId === r.id} disabled={!!busyId}>Retry</Button>
                  ) : <span className="nt-row__spacer" />}
                </li>
              );
            })}
          </ul>
        )}

        {!list.error && total > 0 && (
          <footer className="bk-pager">
            <span>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(total, page * PAGE_SIZE)} of {total}</span>
            <div>
              <button type="button" onClick={() => change({ page: page > 2 ? String(page - 1) : '' })} disabled={page <= 1 || list.loading} aria-label="Previous page"><ChevronLeft size={18} /></button>
              <span className="bk-pager__page">Page {page} of {pages}</span>
              <button type="button" onClick={() => change({ page: String(page + 1) })} disabled={page >= pages || list.loading} aria-label="Next page"><ChevronRight size={18} /></button>
            </div>
          </footer>
        )}
      </section>
    </div>
  );
}
