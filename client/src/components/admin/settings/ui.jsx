import { useId, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import Button from '../../common/Button';
import { uploadToCloudinary } from '../../../services/uploadService';
import { getBrandingUploadSignature } from '../../../services/settingsService';
import { imageProblem } from '../../../utils/settingsUtils';
import { cx } from '../../../utils/helpers';

/** A labelled on/off switch with a sentence of explanation. `onChange(nextValue)` */
export function Toggle({ label, description, checked, onChange, disabled, id, error }) {
  const auto = useId();
  const inputId = id || auto;
  return (
    <div className={cx('st-toggle', disabled && 'is-disabled')}>
      <div className="st-toggle__text">
        <label htmlFor={inputId} className="st-toggle__label">{label}</label>
        {description && <p className="st-toggle__desc">{description}</p>}
        {error && <p className="field__error" role="alert">{error}</p>}
      </div>
      <button
        type="button" id={inputId} role="switch" aria-checked={!!checked} disabled={disabled}
        className={cx('st-switch', checked && 'is-on')} onClick={() => onChange(!checked)}
      ><span /><span className="sr-only">{checked ? 'On' : 'Off'}</span></button>
    </div>
  );
}

/** A titled block inside a section */
export function Card({ title, description, children, className }) {
  return (
    <div className={cx('st-card', className)}>
      {(title || description) && (
        <div className="st-card__head">
          {title && <h3 className="st-card__title">{title}</h3>}
          {description && <p className="st-card__desc">{description}</p>}
        </div>
      )}
      <div className="st-card__body">{children}</div>
    </div>
  );
}

/** Message line: tone = ok | warn | error. Only ever shown for things the server has confirmed or refused. */
export function Notice({ tone = 'ok', children, onDismiss }) {
  if (!children) return null;
  const Icon = tone === 'ok' ? CheckCircle2 : AlertTriangle;
  return (
    <p className={cx('st-notice', `st-notice--${tone}`)} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon size={18} aria-hidden="true" /> <span>{children}</span>
      {onDismiss && <button type="button" onClick={onDismiss} aria-label="Dismiss">×</button>}
    </p>
  );
}

/** The footer of a section: Save, Discard and the result. "Saved" appears only after the server confirmed it. */
export function SaveBar({ dirty, saving, onSave, onReset, status, saveLabel = 'Save changes' }) {
  return (
    <div className="st-savebar">
      <div className="st-savebar__state" aria-live="polite">
        {saving && <span className="st-savebar__msg"><Loader2 size={16} className="btn__spinner" aria-hidden="true" /> Saving…</span>}
        {!saving && status?.kind === 'error' && <span className="st-savebar__msg st-savebar__msg--error"><AlertTriangle size={16} aria-hidden="true" /> {status.text}</span>}
        {!saving && status?.kind === 'saved' && !dirty && <span className="st-savebar__msg st-savebar__msg--ok"><CheckCircle2 size={16} aria-hidden="true" /> {status.text}</span>}
        {!saving && dirty && status?.kind !== 'error' && <span className="st-savebar__msg st-savebar__msg--dirty">You have unsaved changes</span>}
      </div>
      <div className="st-savebar__actions">
        <Button variant="ghost" onClick={onReset} disabled={!dirty || saving}>Discard</Button>
        <Button onClick={onSave} loading={saving} disabled={!dirty}>{saveLabel}</Button>
      </div>
    </div>
  );
}

/**
 * Upload one image (logo, favicon, sharing image, service cover) straight to Cloudinary with a one-use signature from the server.
 * value = { url, publicId }. The file is checked (type, size) before anything is uploaded. The photo only becomes part of the settings
 * when the section is saved; the server checks again that it came from this uploader.
 */
export function ImageField({ label, hint, value, onChange, token, error, enabled = true, wide = false }) {
  const id = useId();
  const input = useRef(null);
  const [progress, setProgress] = useState(null); // null = idle, 0-100 while uploading
  const [problem, setProblem] = useState('');

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const bad = imageProblem(file);
    if (bad) { setProblem(bad); return; }
    setProblem(''); setProgress(0);
    try {
      const signature = await getBrandingUploadSignature(token);
      const { url, publicId } = await uploadToCloudinary(file, signature, setProgress);
      onChange({ url, publicId });
    } catch (err) {
      setProblem(err.message || 'The upload failed. Please try again.');
    } finally {
      setProgress(null);
    }
  };

  const shown = error || problem;
  return (
    <div className={cx('field', shown && 'field--error')}>
      <span className="field__label" id={`${id}-label`}>{label}</span>
      <div className={cx('st-image', wide && 'st-image--wide')}>
        <div className="st-image__preview">
          {value?.url ? <img src={value.url} alt={`Current ${label.toLowerCase()}`} /> : <span><ImagePlus size={22} aria-hidden="true" /> None</span>}
          {progress !== null && <span className="st-image__progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>{progress}%</span>}
        </div>
        <div className="st-image__actions">
          <input ref={input} id={id} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={pick} aria-labelledby={`${id}-label`} disabled={!enabled || progress !== null} />
          <Button variant="outline" size="sm" icon={<ImagePlus size={16} />} onClick={() => input.current?.click()} disabled={!enabled || progress !== null}>
            {value?.url ? 'Replace image' : 'Upload image'}
          </Button>
          {value?.url && <Button variant="ghost" size="sm" icon={<Trash2 size={16} />} onClick={() => { setProblem(''); onChange({ url: '', publicId: '' }); }} disabled={progress !== null}>Remove</Button>}
        </div>
      </div>
      {shown ? <p className="field__error" role="alert">{shown}</p> : <p className="field__hint">{enabled ? hint : 'Image uploads are not set up on the server yet (Cloudinary), so images cannot be changed here.'}</p>}
    </div>
  );
}
