import { createContext, useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { getPackages } from '../services/packageService';
import { CUSTOM_PACKAGE, fromKey } from '../components/booking/bookingData';

export const BookingContext = createContext(null);

const STORAGE_KEY = 'am-booking-draft';

const EMPTY_VALUES = {
  name: '', email: '', phone: '',
  shootType: '', location: '', locationDetails: '', people: 2, styles: [], requests: '', packageId: '',
  date: '', time: '',
};

function loadDraft() {
  try {
    const draft = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
    if (!draft?.values) return null;
    const values = { ...EMPTY_VALUES, ...draft.values };
    // Drop a saved date that has since passed
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (values.date && fromKey(values.date) <= today) { values.date = ''; values.time = ''; }
    return { values, step: draft.step || 1, maxStep: draft.maxStep || 1 };
  } catch {
    return null;
  }
}

const init = () => loadDraft() ?? { values: EMPTY_VALUES, step: 1, maxStep: 1 };

function reducer(state, action) {
  switch (action.type) {
    case 'UPDATE': return { ...state, values: { ...state.values, ...action.patch } };
    case 'GOTO': {
      const step = Math.min(4, Math.max(1, action.step));
      return { ...state, step, maxStep: Math.max(state.maxStep, step) };
    }
    case 'RESET': return { values: EMPTY_VALUES, step: 1, maxStep: 1 };
    default: return state;
  }
}

export function BookingProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, init);
  const [submission, setSubmission] = useState(null); // { reference } once submitted
  const [packages, setPackages] = useState([]);
  const [packagesStatus, setPackagesStatus] = useState('loading');

  useEffect(() => {
    let cancelled = false;
    getPackages()
      .then((p) => { if (!cancelled) { setPackages(p); setPackagesStatus('ready'); } })
      .catch(() => { if (!cancelled) setPackagesStatus('error'); });
    return () => { cancelled = true; };
  }, []);

  // Keep the draft across refreshes (this tab only)
  useEffect(() => {
    try {
      if (submission) sessionStorage.removeItem(STORAGE_KEY);
      else sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch { /* storage unavailable: ignore */ }
  }, [state, submission]);

  const update = useCallback((patch) => dispatch({ type: 'UPDATE', patch }), []);
  const goTo = useCallback((step) => { dispatch({ type: 'GOTO', step }); window.scrollTo({ top: 0, behavior: 'smooth' }); }, []);
  const next = useCallback(() => goTo(state.step + 1), [goTo, state.step]);
  const back = useCallback(() => goTo(state.step - 1), [goTo, state.step]);
  const reset = useCallback(() => { dispatch({ type: 'RESET' }); setSubmission(null); }, []);

  const selectedPackage = useMemo(() => {
    if (state.values.packageId === CUSTOM_PACKAGE.id) return CUSTOM_PACKAGE;
    return packages.find((p) => p.id === state.values.packageId) ?? null;
  }, [packages, state.values.packageId]);

  const value = useMemo(
    () => ({
      values: state.values, step: state.step, maxStep: state.maxStep,
      update, goTo, next, back, reset,
      packages, packagesStatus, selectedPackage,
      submission, setSubmission,
    }),
    [state, update, goTo, next, back, reset, packages, packagesStatus, selectedPackage, submission]
  );

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
}
