import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { getMe, login as loginRequest } from '../services/authService';
import { setUnauthorizedHandler } from '../services/api';

export const AuthContext = createContext(null);

const TOKEN_KEY = 'am-admin-token';
// sessionStorage: survives a refresh, is wiped when the tab/browser closes (safer than localStorage for an admin login)
const readToken = () => { try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; } };
const saveToken = (value) => {
  try { if (value) sessionStorage.setItem(TOKEN_KEY, value); else sessionStorage.removeItem(TOKEN_KEY); } catch { /* storage blocked: ignore */ }
};

/**
 * status: 'checking'      a saved token is being verified with the server
 *         'authenticated' the server confirmed the token (user.role === 'admin')
 *         'anonymous'     not logged in
 *         'error'         the server could not be reached while verifying (retry is offered)
 *
 * IMPORTANT: this only decides what the screen shows. Every admin API call is verified again by the backend.
 */
export function AuthProvider({ children }) {
  const [token, setToken] = useState(readToken);
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(() => (readToken() ? 'checking' : 'anonymous'));
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  const clear = useCallback(() => {
    saveToken(null);
    setToken(null);
    setUser(null);
    setError('');
    setStatus('anonymous');
  }, []);

  // Restore a session after a refresh: ask the server who this token belongs to
  useEffect(() => {
    if (!token || user) return undefined; // nothing to restore, or just logged in
    let cancelled = false;
    setStatus('checking');
    setError('');

    getMe(token)
      .then((u) => {
        if (cancelled) return;
        if (u?.role !== 'admin') { clear(); return; }
        setUser(u);
        setStatus('authenticated');
      })
      .catch((e) => {
        if (cancelled) return;
        if (e.status === 401 || e.status === 403) clear(); // expired, forged or the user no longer exists
        else { setError(e.message); setStatus('error'); } // server unreachable: let the person retry
      });

    return () => { cancelled = true; };
  }, [token, user, attempt, clear]);

  // If the server ever answers 401 to a logged-in request (token expired mid-session), sign out right away
  useEffect(() => {
    setUnauthorizedHandler(clear);
    return () => setUnauthorizedHandler(null);
  }, [clear]);

  const login = useCallback(async (email, password) => {
    const { token: newToken, user: newUser } = await loginRequest(email, password);
    if (newUser?.role !== 'admin') throw new Error('This account is not allowed to sign in here.');
    saveToken(newToken);
    setToken(newToken);
    setUser(newUser);
    setError('');
    setStatus('authenticated');
    return newUser;
  }, []);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const value = useMemo(
    () => ({ user, token, status, error, isAuthenticated: status === 'authenticated', login, logout: clear, retry }),
    [user, token, status, error, login, clear, retry]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
