
import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { getPublicServices, getPublicSettings } from '../services/settingsService';
import { DEFAULT_SITE, mergeSite } from '../utils/siteSettings';
import { FALLBACK_SERVICES, normalizeServices } from '../utils/servicesList';

export const SettingsContext = createContext(null);

/**
 * The public face of Admin → Settings, available to the whole app (website AND admin screens):
 *   settings   always complete: the saved settings laid over the defaults, so nothing is ever undefined while loading
 *   services   the ACTIVE photography services in display order (a built-in list if the server cannot be reached)
 *   loaded     the first answer has arrived (or failed): the defaults are in use until then
 *   refresh()  load again (the Settings screen calls it after a save so the whole panel follows at once)
 * It only holds what the server marks as public. Private settings (notifications, schedule) are never part of it.
 */
export function SettingsProvider({ children }) {
  const [state, setState] = useState({ settings: DEFAULT_SITE, services: FALLBACK_SERVICES, loaded: false, servicesFailed: false, settingsFailed: false });

  const refresh = useCallback(async () => {
    const [s, v] = await Promise.allSettled([getPublicSettings(), getPublicServices()]);
    setState({
      settings: s.status === 'fulfilled' ? mergeSite(s.value) : DEFAULT_SITE,
      services: v.status === 'fulfilled' ? normalizeServices(v.value) : FALLBACK_SERVICES,
      loaded: true,
      settingsFailed: s.status !== 'fulfilled',
      servicesFailed: v.status !== 'fulfilled',
    });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const value = useMemo(() => ({ ...state, refresh }), [state, refresh]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
