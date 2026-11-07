import useAuth from './useAuth';
import useFetch from './useFetch';
import { getServicesAdmin } from '../services/settingsService';

/**
 * Every photography service for admin screens, including switched-off ones (old bookings still use them).
 * const { services, options } = useAdminServices();   options = [{ value: slug, label: name }] for a <select>.
 * While loading or if the call fails, the list is empty: the screens then fall back to the plain id.
 */
export default function useAdminServices() {
  const { token } = useAuth();
  const { data } = useFetch(() => getServicesAdmin(token), [token]);
  const rows = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
  const services = rows.filter((s) => s && s.slug && s.name);
  return { services, options: services.map((s) => ({ value: s.slug, label: s.active === false ? `${s.name} (off)` : s.name })) };
}
