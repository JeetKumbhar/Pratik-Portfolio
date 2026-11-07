import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarCheck, ChevronLeft, ChevronRight, CloudOff, Pencil, Repeat, Search, UserPlus, Users, UserRoundX, X } from 'lucide-react';
import StatCard from '../../components/admin/StatCard';
import ClientFormModal from '../../components/admin/clients/ClientFormModal';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import useAuth from '../../hooks/useAuth';
import useDebounce from '../../hooks/useDebounce';
import useFetch from '../../hooks/useFetch';
import { getClients, getClientStats } from '../../services/clientService';
import { CLIENT_FILTERS, CLIENT_SORTS, DEFAULT_PAGE_SIZE, PAGE_SIZES, initials, oneOf, shortDate, typeLabel } from '../../utils/clientUtils';
import { cx } from '../../utils/helpers';

/**
 * Admin → Clients. Like the Bookings page, the URL is the single source of truth:
 *   /admin/clients?filter=repeat&sort=mostBookings&search=priya&page=2&limit=20
 * so a refresh, the back button and bookmarks all keep your place. Searching, filtering, sorting and paging happen on the server.
 */
export default function Clients() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const filter = oneOf(params.get('filter'), CLIENT_FILTERS, 'all');
  const sort = oneOf(params.get('sort'), CLIENT_SORTS, 'recent');
  const search = params.get('search') ?? '';
  const page = Math.max(1, parseInt(params.get('page'), 10) || 1);
  const limitParam = parseInt(params.get('limit'), 10);
  const limit = PAGE_SIZES.includes(limitParam) ? limitParam : DEFAULT_PAGE_SIZE;

  /** Merge changes into the URL. Empty values are removed; changing anything except the page goes back to page 1. */
  const changeParams = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
    if (!Object.keys(patch).every((k) => k === 'page')) next.delete('page');
    setParams(next, { replace: true });
  };

  // Search box: type freely, the list updates once you pause
  const [text, setText] = useState(search);
  const debounced = useDebounce(text, 400);
  useEffect(() => { setText(search); }, [search]);
  useEffect(() => { if (debounced.trim() !== search) changeParams({ search: debounced.trim() }); }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps

  const query = { filter, sort, page, limit, ...(search && { search }) };
  const list = useFetch(() => getClients(token, query), [token, filter, sort, search, page, limit]);
  const stats = useFetch(() => getClientStats(token), [token]);

  const res = list.data;
  const rows = res?.data ?? [];
  const total = res?.total ?? 0;
  const pages = res?.pages ?? 1;
  const hasRows = rows.length > 0;
  const filtered = Boolean(search || filter !== 'all');
  const from = (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);

  // The last row of the last page was removed or the list shrank: step back to a page that exists
  useEffect(() => { if (res && page > res.pages) changeParams({ page: res.pages > 1 ? String(res.pages) : '' }); }, [res]); // eslint-disable-line react-hooks/exhaustive-deps

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [notice, setNotice] = useState('');
  const closeForm = () => { setFormOpen(false); setEditing(null); };
  const refreshAll = () => { list.reload(); stats.reload(); };

  const saved = (client, { existing, message }) => {
    closeForm();
    if (existing) { // that phone number already had a client: show them instead of creating another
      navigate(`/admin/clients/${client.id}`, { state: { notice: message || 'A client with this phone number already exists.' } });
      return;
    }
    setNotice(editing ? 'Client updated.' : 'Client added.');
    refreshAll();
  };
  useEffect(() => { if (!notice) return undefined; const t = setTimeout(() => setNotice(''), 4000); return () => clearTimeout(t); }, [notice]);

  const clearFilters = () => { setText(''); setParams(new URLSearchParams(), { replace: true }); };
  const s = stats.data;

  return (
    <div className="bk cl">
      <div className="cl__top">
        <p className="cl__lead">Everyone who has booked, messaged on WhatsApp or been added by you, in one place.</p>
        <Button icon={<UserPlus size={16} />} onClick={() => setFormOpen(true)}>Add client</Button>
      </div>

      {notice && <p className="cl-notice" role="status">{notice}</p>}

      <div className="dash__stats">
        <StatCard icon={Users} label="Total clients" value={s?.total} loading={stats.loading && !s} hint={stats.error ? 'Could not load' : undefined} />
        <StatCard icon={UserPlus} label="New this month" value={s?.newThisMonth} loading={stats.loading && !s} />
        <StatCard icon={Repeat} label="Repeat clients" value={s?.repeat} loading={stats.loading && !s} hint="Completed a shoot, or booked more than once" />
        <StatCard icon={CalendarCheck} label="Total bookings" value={s?.totalBookings} loading={stats.loading && !s} hint="Linked to a client" />
      </div>

      <div className="bk__tabs" role="group" aria-label="Filter clients">
        {CLIENT_FILTERS.map(({ value, label }) => (
          <button key={value} type="button" className={cx('bk-tab', filter === value && 'is-active')} aria-pressed={filter === value} onClick={() => changeParams({ filter: value === 'all' ? '' : value })}>
            {label}
          </button>
        ))}
      </div>

      <div className="bk__tools">
        <label className="bk-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Search clients</span>
          <input type="search" placeholder="Search name, phone or email" value={text} onChange={(e) => setText(e.target.value)} maxLength={50} />
        </label>
        <select className="bk-select" value={sort} onChange={(e) => changeParams({ sort: e.target.value === 'recent' ? '' : e.target.value })} aria-label="Sort clients">
          {CLIENT_SORTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className="bk-select" value={limit} onChange={(e) => changeParams({ limit: Number(e.target.value) === DEFAULT_PAGE_SIZE ? '' : e.target.value })} aria-label="Clients per page">
          {PAGE_SIZES.map((n) => <option key={n} value={n}>{n} per page</option>)}
        </select>
        {filtered && <button type="button" className="bk-clear" onClick={clearFilters}><X size={14} /> Clear</button>}
      </div>

      <section className="bk-table" aria-busy={list.loading}>
        <div className="cl-head" aria-hidden="true">
          <span>Client</span><span>Phone</span><span>Email</span><span>Bookings</span><span>Last booking</span><span>Client since</span><span>Actions</span>
        </div>

        {list.error && <EmptyState icon={<CloudOff size={28} />} title="Couldn't load clients" message={list.error} action={<Button onClick={list.reload}>Try again</Button>} />}

        {!list.error && !hasRows && list.loading && (
          <div className="bk-skeletons">{[0, 1, 2, 3, 4].map((i) => <span key={i} className="skeleton bk-skeleton" aria-hidden="true" />)}</div>
        )}

        {!list.error && !hasRows && !list.loading && (
          <EmptyState
            icon={<UserRoundX size={28} />}
            title={filtered ? 'No clients match' : 'No clients yet'}
            message={filtered ? 'Try a different search or clear the filters.' : 'Clients appear here automatically when someone books or messages you on WhatsApp. You can also add one yourself.'}
            action={!filtered && <Button icon={<UserPlus size={16} />} onClick={() => setFormOpen(true)}>Add client</Button>}
          />
        )}

        {!list.error && hasRows && (
          <ul className={cx('bk-list', list.loading && 'is-loading')}>
            {rows.map((c) => (
              <li key={c.id} className="cl-row">
                <Link to={`/admin/clients/${c.id}`} className="cl-row__link" aria-label={`Open ${c.name}`} />
                <span className="cl-cell cl-cell--who">
                  <span className="cl-avatar" aria-hidden="true">{initials(c.name)}</span>
                  <span className="cl-cell__text"><strong>{c.name}</strong><small>{typeLabel(c.type)} client</small></span>
                </span>
                <span className="cl-cell cl-cell--phone">{c.phone}</span>
                <span className="cl-cell cl-cell--email">{c.email || <span className="cl-muted">—</span>}</span>
                <span className="cl-cell cl-cell--count">
                  <strong>{c.totalBookings}</strong>
                  {c.upcomingBookings > 0 && <Badge variant="success">{c.upcomingBookings} upcoming</Badge>}
                </span>
                <span className="cl-cell cl-cell--last">{c.lastBookingAt ? shortDate(c.lastBookingAt) : <span className="cl-muted">No bookings</span>}</span>
                <span className="cl-cell cl-cell--since">{shortDate(c.createdAt)}</span>
                <span className="cl-cell cl-cell--actions">
                  <Link to={`/admin/clients/${c.id}`} className="cl-act" tabIndex={-1} aria-hidden="true">View</Link>
                  <button type="button" className="cl-act" onClick={() => setEditing(c)} aria-label={`Edit ${c.name}`}><Pencil size={14} aria-hidden="true" /> Edit</button>
                  <ChevronRight size={18} className="cl-row__chevron" aria-hidden="true" />
                </span>
              </li>
            ))}
          </ul>
        )}

        {!list.error && total > 0 && (
          <footer className="bk-pager">
            <span>Showing {from}–{to} of {total}</span>
            <div>
              <button type="button" onClick={() => changeParams({ page: page - 1 > 1 ? String(page - 1) : '' })} disabled={page <= 1 || list.loading} aria-label="Previous page"><ChevronLeft size={18} /></button>
              <span className="bk-pager__page">Page {page} of {pages}</span>
              <button type="button" onClick={() => changeParams({ page: String(page + 1) })} disabled={page >= pages || list.loading} aria-label="Next page"><ChevronRight size={18} /></button>
            </div>
          </footer>
        )}
      </section>

      <ClientFormModal isOpen={formOpen || Boolean(editing)} onClose={closeForm} client={editing} onSaved={saved} />
    </div>
  );
}
