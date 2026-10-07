import { LayoutDashboard, CalendarCheck, CalendarDays, Users, Images, Package, Mail, Settings } from 'lucide-react';

/**
 * The sidebar links, top to bottom. Logout is a button (not a page), so it lives in AdminSidebar.
 * The header title is looked up from this list too, so a new admin page = one new line here + one <Route>.
 */
export const ADMIN_NAV = [
  { label: 'Dashboard', to: '/admin', icon: LayoutDashboard, end: true },
  { label: 'Bookings', to: '/admin/bookings', icon: CalendarCheck },
  { label: 'Calendar', to: '/admin/calendar', icon: CalendarDays },
  { label: 'Clients', to: '/admin/clients', icon: Users },
  { label: 'Portfolio', to: '/admin/portfolio', icon: Images },
  { label: 'Packages', to: '/admin/packages', icon: Package },
  { label: 'Messages', to: '/admin/messages', icon: Mail },
  { label: 'Settings', to: '/admin/settings', icon: Settings },
];
