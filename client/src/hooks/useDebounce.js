import { useEffect, useState } from 'react';

/** Returns `value` only after it has stopped changing for `delay` ms (so a search box doesn't call the API on every key). */
export default function useDebounce(value, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
