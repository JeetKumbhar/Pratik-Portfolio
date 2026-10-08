import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import BookingTable from '../../components/admin/BookingTable';
import BookingDetails from '../../components/admin/BookingDetails';
import { SHOOT_TYPES } from '../../components/booking/bookingData';
import useAuth from '../../hooks/useAuth';
import useFetch from '../../hooks/useFetch';
import useDebounce from '../../hooks/useDebounce';
import { getBookings, getBookingStats } from '../../services/adminService';
import { STATUSES, STATUS_META } from '../../utils/bookingStatus';
import { cx } from '../../utils/helpers';

const PAGE_SIZE = 15;
const SORTS = [
  { value: '-createdAt', label: 'Newest requests' },
  { value: 'date', label: 'Shoot date: soonest' },
  { value: '-date', label: 'Shoot date: latest' },
];
const TABS = [{ value: '', label: 'All', stat: 'total' }, ...STATUSES.map((s) => ({ value: s, label: STATUS_META[s].label, stat: s }))];

/**
 * The URL is the single source of truth:  /admin/bookings?status=pending&search=sarah&type=wedding&sort=date&page=2&view=AM-K3X9QA
 * so filters survive a refresh, can be bookmarked, and the dashboard can link straight to a filtered list or a booking.
 */
export default function Bookings() {
  const { token } = useAuth();
  const [params, setParams] = useSearchParams();

  const status = STATUSES.includes(params.get('status')) ? params.get('status') : '';
  const type = SHOOT_TYPES.some((t) => t.id === params.get('type')) ? params.get('type') : '';
  const sort = SORTS.some((s) => s.value === params.get('sort')) ? params.get('sort') : '-createdAt';
  const search = params.get('search') ?? '';
  const page = Math.max(1, parseInt(params.get('page'), 10) || 1);
  const view = params.get('view');

  /** Merge changes into the URL. Empty values are removed. Changing a filter goes back to page 1. */
  const changeParams = (patch, { replace = true } = {}) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
    const onlyViewOrPage = Object.keys(patch).every((k) => k === 'view' || k === 'page');
    if (!onlyViewOrPage) next.delete('page');
    setParams(next, { replace });
  };

  // Search box: type freely, the list updates once you pause
  const [text, setText] = useState(search);
  const debounced = useDebounce(text, 400);
  useEffect(() => { setText(search); }, [search]); // e.g. arriving from a dashboard link
  useEffect(() => { if (debounced.trim() !== search) changeParams({ search: debounced.trim() }); }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps

  const query = { limit: PAGE_SIZE, sort, page, ...(status && { status }), ...(type && { shootType: type }), ...(search && { search }) };
  const list = useFetch(() => getBookings(token, query), [token, status, type, sort, search, page]);
  const stats = useFetch(() => getBookingStats(token), [token]); // counts on the status tabs

  const res = list.data;
  const bookings = res?.data ?? [];
  const total = res?.total ?? 0;
  const pages = res?.pages ?? 1;

  // Deleted the last booking on the last page: step back
  useEffect(() => { if (res && page > res.pages) changeParams({ page: res.pages > 1 ? String(res.pages) : '' }); }, [res]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshAll = () => { list.reload(); stats.reload(); };
  const closeDetails = () => changeParams({ view: '' }, { replace: false });
  const filtered = Boolean(status || type || search);
  const clearFilters = () => { setText(''); setParams(new URLSearchParams(), { replace: true }); };

  return (
    <div className="bk">
      <div className="bk__tabs" role="group" aria-label="Filter by status">
        {TABS.map(({ value, label, stat }) => (
          <button key={label} type="button" className={cx('bk-tab', status === value && 'is-active')} aria-pressed={status === value} onClick={() => changeParams({ status: value })}>
            {label}
            {stats.data && <span className="bk-tab__count">{stats.data[stat]}</span>}
          </button>
        ))}
      </div>

      <div className="bk__tools">
        <label className="bk-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Search bookings</span>
          <input type="search" placeholder="Search name, email or reference" value={text} onChange={(e) => setText(e.target.value)} maxLength={50} />
        </label>
        <select className="bk-select" value={type} onChange={(e) => changeParams({ type: e.target.value })} aria-label="Filter by shoot type">
          <option value="">All shoot types</option>
          {SHOOT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <select className="bk-select" value={sort} onChange={(e) => changeParams({ sort: e.target.value })} aria-label="Sort bookings">
          {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        {filtered && <button type="button" className="bk-clear" onClick={clearFilters}><X size={14} /> Clear</button>}
      </div>

      <BookingTable
        bookings={bookings} loading={list.loading} error={list.error} onRetry={list.reload}
        onOpen={(reference) => changeParams({ view: reference }, { replace: false })} activeRef={view}
        page={page} pages={pages} total={total} pageSize={PAGE_SIZE}
        onPage={(p) => changeParams({ page: p > 1 ? String(p) : '' })} filtered={filtered}
      />

      {view && (
        <BookingDetails
          reference={view}
          onClose={closeDetails}
          onChanged={refreshAll}
          onDeleted={() => { closeDetails(); refreshAll(); }}
        />
      )}
    </div>
  );
}
