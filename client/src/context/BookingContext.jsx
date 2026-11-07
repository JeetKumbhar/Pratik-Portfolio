import { createContext, useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { getPackages } from '../services/packageService';
import { submitBooking } from '../services/bookingService';
import { CUSTOM_PACKAGE, LOCATIONS, fromKey } from '../components/booking/bookingData';
import useSettings from '../hooks/useSettings';
import { todayIn } from '../utils/siteSettings';
import { validateBooking } from '../utils/validation';

export const BookingContext = createContext(null);

const STORAGE_KEY = 'am-booking-draft';

const EMPTY_VALUES = {
  name: '', email: '', phone: '',
  shootType: '', location: '', locationDetails: '', people: 2, styles: [], requests: '', packageId: '',
  date: '', time: '',
  whatsappOptIn: false, // ticked on step 1: the customer wants WhatsApp updates about this booking
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
  const { settings, services } = useSettings();
  const [state, dispatch] = useReducer(reducer, undefined, init);
  const [submission, setSubmission] = useState(null); // { reference } once submitted
  const [packages, setPackages] = useState([]);
  const [packagesStatus, setPackagesStatus] = useState('loading');
  const [notice, setNotice] = useState([]); // messages shown when we send someone back to fix something
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(''); // message when sending fails

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
  const goTo = useCallback((step, messages = []) => {
    dispatch({ type: 'GOTO', step });
    setNotice(messages);
    setSubmitError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);
  const next = useCallback(() => goTo(state.step + 1), [goTo, state.step]);
  const back = useCallback(() => goTo(state.step - 1), [goTo, state.step]);
  const reset = useCallback(() => { dispatch({ type: 'RESET' }); setSubmission(null); setNotice([]); setSubmitError(''); }, []);

  // The booking rules from Admin → Settings → Booking (required fields, notice period). The server enforces them again.
  const { phoneRequired, emailRequired, locationRequired, minAdvanceDays, maxAdvanceDays, customDurationHours } = settings.booking;
  const timezone = settings.general.timezone;
  const rules = useMemo(
    () => ({ phoneRequired, emailRequired, locationRequired, minAdvanceDays, maxAdvanceDays, today: todayIn(timezone) }),
    [phoneRequired, emailRequired, locationRequired, minAdvanceDays, maxAdvanceDays, timezone]
  );

  const selectedPackage = useMemo(() => {
    if (state.values.packageId === CUSTOM_PACKAGE.id) return { ...CUSTOM_PACKAGE, durationHours: customDurationHours }; // "not sure yet" holds the saved number of hours
    return packages.find((p) => p.id === state.values.packageId) ?? null;
  }, [packages, state.values.packageId, customDurationHours]);

  /** Full check of every step. Used before submit and when a saved draft is restored. */
  const validateAll = useCallback(
    () => validateBooking(state.values, {
      rules,
      shootTypes: services.map((s) => s.slug),
      locations: LOCATIONS.map((l) => l.id),
      // only check the package id against the list once packages have loaded
      packageIds: packagesStatus === 'ready' ? [...packages.map((p) => p.id), CUSTOM_PACKAGE.id] : undefined,
    }),
    [state.values, packages, packagesStatus, rules, services]
  );

  /**
   * Sends the booking to the backend (POST /api/bookings). Returns true on success.
   *  - incomplete data      → jumps back to the first broken step (nothing is sent)
   *  - 409 "slot just taken" → clears the time and sends the customer back to step 3
   *  - any other failure     → submitError holds a message to show on the review step
   *  - success               → `submission` is set, and the page shows <BookingSuccess />
   */
  const submit = useCallback(async () => {
    const { isValid, errors, firstInvalidStep } = validateAll();
    if (!isValid) {
      goTo(firstInvalidStep, Object.values(errors[firstInvalidStep]));
      return false;
    }

    setSubmitting(true);
    setSubmitError('');
    try {
      const v = state.values;
      const result = await submitBooking({
        ...v,
        package: selectedPackage && { id: selectedPackage.id, name: selectedPackage.name, price: selectedPackage.price, duration: selectedPackage.duration },
      });
      setSubmission({ reference: result.reference, name: v.name, email: v.email, date: v.date, time: v.time, shootType: v.shootType });
      return true;
    } catch (err) {
      if (err.status === 409) {
        update({ time: '' });
        goTo(3, [err.message]);
      } else {
        const firstFieldError = err.errors && Object.values(err.errors)[0];
        setSubmitError(firstFieldError || err.message || "We couldn't send your request. Please try again.");
      }
      return false;
    } finally {
      setSubmitting(false);
    }
  }, [validateAll, goTo, update, state.values, selectedPackage]);

  const value = useMemo(
    () => ({
      values: state.values, step: state.step, maxStep: state.maxStep,
      update, goTo, next, back, reset,
      packages, packagesStatus, selectedPackage,
      validateAll, notice, rules,
      submit, submitting, submitError,
      submission, setSubmission,
    }),
    [state, update, goTo, next, back, reset, packages, packagesStatus, selectedPackage, validateAll, notice, rules, submit, submitting, submitError, submission]
  );

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
}
