import { useCallback, useEffect, useState } from 'react';
import { getUnreadCount } from '../services/adminService';

/**
 * The number of unread messages, for the badge in the sidebar and the dashboard.
 * Refreshes when the admin area opens, when you return to this tab, and once a minute while it is visible.
 * refresh() updates it immediately (the Messages page calls it after marking something read or deleting).
 */
export default function useUnreadMessages(token) {
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    try {
      setUnread(await getUnreadCount(token));
    } catch {
      /* the badge is a convenience: if it cannot load, just leave it as it was */
    }
  }, [token]);

  useEffect(() => {
    refresh();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 60000);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [refresh]);

  return { unread, refresh };
}
