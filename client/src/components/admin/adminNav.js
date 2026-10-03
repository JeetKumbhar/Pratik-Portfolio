import { LayoutDashboard, CalendarCheck, Images, Package, Users, Mail } from 'lucide-react';

export const ADMIN_NAV = [
  { label: 'Dashboard', to: '/admin', icon: LayoutDashboard, end: true },
  { label: 'Bookings', to: '/admin/bookings', icon: CalendarCheck },
  { label: 'Portfolio', to: '/admin/portfolio', icon: Images },
  { label: 'Packages', to: '/admin/packages', icon: Package },
  { label: 'Clients', to: '/admin/clients', icon: Users },
  { label: 'Messages', to: '/admin/messages', icon: Mail },
];
