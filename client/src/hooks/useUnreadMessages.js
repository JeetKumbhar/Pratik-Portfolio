import { useCallback, useEffect, useState } from 'react';
import { getUnreadCount, getWhatsAppUnreadCount } from '../services/adminService';

/**
 * The number of unread messages, for the badge in the sidebar and the dashboard.
 *   unread           contact-form messages + WhatsApp customer messages (the sidebar badge)
 *   contactUnread    contact-form messages only        whatsappUnread   WhatsApp messages only (the two tabs on the Messages page)
 * Refreshes when the admin area opens, when you return to this tab, and every 30 seconds while it is visible.
 * refresh() updates it immediately (the Messages page calls it after marking something read or deleting).
 * The two counts load independently: if one cannot load, the other still shows and the failed one keeps its last value.
 */
export default function useUnreadMessages(token) {
  const [counts, setCounts] = useState({ contact: 0, whatsapp: 0 });

  const refresh = useCallback(async () => {
    const [contact, whatsapp] = await Promise.allSettled([getUnreadCount(token), getWhatsAppUnreadCount(token)]);
    setCounts((old) => ({
      contact: contact.status === 'fulfilled' && Number.isFinite(contact.value) ? contact.value : old.contact,
      whatsapp: whatsapp.status === 'fulfilled' && Number.isFinite(whatsapp.value) ? whatsapp.value : old.whatsapp,
    }));
  }, [token]);

  useEffect(() => {
    refresh();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 30000);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [refresh]);

  return { unread: counts.contact + counts.whatsapp, contactUnread: counts.contact, whatsappUnread: counts.whatsapp, refresh };
}
