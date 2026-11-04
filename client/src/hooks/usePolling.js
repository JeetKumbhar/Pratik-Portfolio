
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * const { data, error, loading, reload } = usePolling(() => getWhatsAppThread(token, id), [token, id], 8000);
 * Like useFetch, but it keeps refreshing quietly while the tab is visible (and when you return to it).
 * The screen never flashes: old data stays until new data arrives, and a failed refresh only sets `error`.
 * Requests never overlap, and an answer that arrives after the dependencies changed is ignored.
 */
export default function usePolling(fetcher, deps = [], intervalMs = 10000) {
  const [state, setState] = useState({ data: null, error: '', loading: true });
  const [tick, setTick] = useState(0);
  const latest = useRef(fetcher);
  latest.current = fetcher;

  useEffect(() => {
    let cancelled = false;
    let busy = false;
    const run = async () => {
      if (busy) return;
      busy = true;
      try {
        const data = await latest.current();
        if (!cancelled) setState({ data, error: '', loading: false });
      } catch (err) {
        if (!cancelled) setState((s) => ({ ...s, error: err.message || 'Something went wrong.', loading: false }));
      } finally {
        busy = false;
      }
    };
    run();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') run(); }, intervalMs);
    window.addEventListener('focus', run);
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener('focus', run); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, intervalMs]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
