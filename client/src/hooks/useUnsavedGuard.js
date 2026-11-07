import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';

/**
 * Warn before unsaved work is lost.
 *  • Moving to another page of the app (menu, links, browser back/forward) is paused: `blocker.state === 'blocked'`;
 *    show a dialog and call blocker.proceed() (leave) or blocker.reset() (stay).
 *  • Closing the tab or reloading shows the browser's own warning.
 * Needs the app to use a data router (see main.jsx).
 */
export default function useUnsavedGuard(dirty) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  return blocker;
}
