import { useCallback, useEffect, useState } from 'react';

/**
 * const { data, loading, error, reload } = useFetch(() => getBookingStats(token), [token]);
 * Runs the function when the page opens and whenever the dependencies change; reload() runs it again.
 * Stale answers are ignored (e.g. you change month quickly), and errors become a readable message.
 */
export default function useFetch(fetcher, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: '' }));
    fetcher()
      .then((data) => { if (!cancelled) setState({ data, loading: false, error: '' }); })
      .catch((err) => { if (!cancelled) setState((s) => ({ ...s, loading: false, error: err.message || 'Something went wrong.' })); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
