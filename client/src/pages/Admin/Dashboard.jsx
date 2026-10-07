import { useState } from 'react';
import { CalendarCheck, CalendarClock, Clock, RefreshCw, Wallet, AlertCircle } from 'lucide-react';
import Button from '../../components/common/Button';
import StatCard from '../../components/admin/StatCard';
import RecentBookings from '../../components/admin/RecentBookings';
import AdminCalendar from '../../components/admin/AdminCalendar';
import QuickActions from '../../components/admin/QuickActions';
import NotificationPanel from '../../components/admin/NotificationPanel';
import { formatDate, formatTime, money } from '../../components/booking/bookingData';
import useAuth from '../../hooks/useAuth';
import useFetch from '../../hooks/useFetch';
import { getBookingStats, getRecentBookings } from '../../services/adminService';

/**
 * Admin → GET /api/bookings/stats + GET /api/bookings + GET /api/availability/admin/calendar
 *       → Express (JWT + admin role checked) → MongoDB → this page
 */
export default function Dashboard() {
  const { token, user } = useAuth();
  const stats = useFetch(() => getBookingStats(token), [token]);
  const recent = useFetch(() => getRecentBookings(token, 6), [token]);
  const [calendarKey, setCalendarKey] = useState(0);

  const s = stats.data;
  const nextShoot = s?.next?.[0];
  const refresh = () => { stats.reload(); recent.reload(); setCalendarKey((k) => k + 1); };
  const busy = stats.loading || recent.loading;
  const firstName = user?.name?.split(' ')[0];

  return (
    <div className="dash">
      <header className="dash__head">
        <div>
          <h2 className="dash__title">Welcome back{firstName ? `, ${firstName}` : ''}</h2>
          <p className="dash__sub">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </div>
        <Button variant="ghost" size="sm" icon={<RefreshCw size={15} />} onClick={refresh} loading={busy}>Refresh</Button>
      </header>

      {stats.error && (
        <p className="form-alert" role="alert">
          <AlertCircle size={18} /> Couldn't load the numbers: {stats.error}{' '}
          <button type="button" className="panel__retry" onClick={stats.reload}>Try again</button>
        </p>
      )}

      <div className="dash__stats">
        <StatCard icon={CalendarCheck} label="Total bookings" value={s?.total ?? '–'} loading={stats.loading}
          hint={s ? `${s.confirmed} confirmed · ${s.completed} completed · ${s.cancelled} cancelled` : ''} to="/admin/bookings" />
        <StatCard icon={CalendarClock} label="Upcoming" value={s?.upcoming ?? '–'} loading={stats.loading}
          hint={nextShoot ? `Next: ${formatDate(nextShoot.date)}, ${formatTime(nextShoot.time)}` : 'Nothing scheduled'} to="/admin/calendar" />
        <StatCard icon={Clock} label="Pending" value={s?.pending ?? '–'} loading={stats.loading} highlight={s?.pending > 0}
          hint={s?.pending > 0 ? 'Waiting for your reply' : 'All caught up'} to="/admin/bookings?status=pending" />
        <StatCard icon={Wallet} label="Revenue" value={s ? money(s.revenue.total) : '–'} loading={stats.loading}
          hint={s ? `${money(s.revenue.thisMonth)} this month · confirmed + completed` : ''} />
      </div>

      <div className="dash__grid">
        <div className="dash__main">
          <RecentBookings bookings={recent.data ?? []} loading={recent.loading} error={recent.error} onRetry={recent.reload} />
          <AdminCalendar refreshKey={calendarKey} />
        </div>
        <div className="dash__side">
          <NotificationPanel stats={s} recent={recent.data ?? []} loading={stats.loading || recent.loading} />
          <QuickActions pending={s?.pending ?? 0} />
        </div>
      </div>
    </div>
  );
}
