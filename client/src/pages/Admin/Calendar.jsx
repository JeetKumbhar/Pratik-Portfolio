import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import AdminCalendar from '../../components/admin/AdminCalendar';
import BlockedDayModal from '../../components/admin/BlockedDayModal';

/** Admin → Calendar: every customer booking and every blocked day in one month view. */
export default function Calendar() {
  const [modal, setModal] = useState({ open: false, date: '' });
  const [refreshKey, setRefreshKey] = useState(0);
  const [notice, setNotice] = useState('');

  const done = ({ created, skipped }) => {
    setModal({ open: false, date: '' });
    setRefreshKey((k) => k + 1);
    setNotice(created === 0
      ? 'Nothing new to block: that time was already blocked.'
      : `Blocked ${created} day${created === 1 ? '' : 's'}${skipped ? ` (${skipped} already blocked)` : ''}.`);
  };

  return (
    <div className="cal-page">
      {notice && (
        <p className="cal-notice" role="status">
          <CheckCircle2 size={18} /> {notice}
          <button type="button" onClick={() => setNotice('')} aria-label="Dismiss">×</button>
        </p>
      )}

      <AdminCalendar
        variant="full"
        refreshKey={refreshKey}
        onChanged={({ removed }) => setNotice(`Unblocked ${removed} block${removed === 1 ? '' : 's'}. Customers can book that time again.`)}
        onBlockDay={(date) => { setNotice(''); setModal({ open: true, date }); }}
      />

      <BlockedDayModal isOpen={modal.open} initialDate={modal.date} onClose={() => setModal({ open: false, date: '' })} onDone={done} />
    </div>
  );
}
