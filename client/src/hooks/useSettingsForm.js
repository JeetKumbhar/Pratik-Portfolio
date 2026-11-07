import { useCallback, useEffect, useRef, useState } from 'react';
import { saveSettingsGroup } from '../services/settingsService';
import { errorsFrom, isEqual, setIn, withoutError } from '../utils/settingsUtils';

/**
 * The editing state of ONE settings group (General, Booking, …).
 *   draft        what is on screen        saved   what the server has
 *   set(path, v) change one field, e.g. set('social.instagram', 'https://…')
 *   dirty        draft differs from saved
 *   save()       sends the draft to the server. status becomes "saved" ONLY after the server confirms; on a refusal the field
 *                messages come back in `errors` and the draft is kept so nothing the admin typed is lost.
 *   reset()      throw the draft away
 * onSaved(group, savedGroup, response) lets the page update its copy of the settings.
 * report(group, dirty) tells the page whether this group has unsaved changes (for the leave-page warning).
 */
export default function useSettingsForm({ group, saved, token, onSaved, report, validate }) {
  const [draft, setDraft] = useState(saved);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null); // { kind: 'saved' | 'error', text }
  const [response, setResponse] = useState(null);
  const savedRef = useRef(saved);

  // The saved copy changed (after a save, or settings reloaded): the draft starts again from it
  useEffect(() => {
    savedRef.current = saved;
    setDraft(saved);
  }, [saved]);

  const dirty = !isEqual(draft, saved);
  useEffect(() => { report?.(group, dirty); }, [group, dirty, report]);
  useEffect(() => () => report?.(group, false), [group, report]); // leaving the section: nothing is pending any more

  const set = useCallback((path, value) => {
    setDraft((d) => setIn(d, path, value));
    setErrors((e) => withoutError(e, path));
    setStatus((s) => (s?.kind === 'error' ? null : s));
  }, []);

  const reset = useCallback(() => { setDraft(savedRef.current); setErrors({}); setStatus(null); }, []);

  const save = useCallback(async () => {
    const local = validate?.(draft);
    if (local && Object.keys(local).length) {
      setErrors(local);
      setStatus({ kind: 'error', text: `Please fix the highlighted ${Object.keys(local).length === 1 ? 'field' : 'fields'}.` });
      return false;
    }
    setSaving(true); setErrors({}); setStatus(null);
    try {
      const res = await saveSettingsGroup(token, group, draft);
      setResponse(res);
      setStatus({ kind: 'saved', text: 'Saved.' });
      onSaved?.(group, res.data, res);
      return true;
    } catch (err) {
      const { fields, message } = errorsFrom(err);
      setErrors(fields);
      setStatus({ kind: 'error', text: message });
      return false;
    } finally {
      setSaving(false);
    }
  }, [draft, group, onSaved, token, validate]);

  return { draft, set, setDraft, errors, setErrors, dirty, saving, save, reset, status, response };
}
