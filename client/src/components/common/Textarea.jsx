import { forwardRef, useId } from 'react';
import { cx } from '../../utils/helpers';

/**
 * Controlled usage so the "0 / 500" counter stays accurate:
 * <Textarea label="Tell me about your vision" required value={v} onChange={e => setV(e.target.value)} />
 */
const Textarea = forwardRef(function Textarea(
  { label, error, hint, icon, required, maxLength = 500, value = '', className = '', id, rows = 4, ...rest },
  ref
) {
  const autoId = useId();
  const areaId = id || autoId;

  return (
    <div className={cx('field', error && 'field--error', className)}>
      {label && (
        <label htmlFor={areaId} className="field__label">
          {label}
          {required && <span className="field__required" aria-hidden="true">*</span>}
        </label>
      )}
      <div className="field__control field__control--area">
        {icon && <span className="field__icon" aria-hidden="true">{icon}</span>}
        <textarea
          ref={ref}
          id={areaId}
          rows={rows}
          maxLength={maxLength}
          value={value}
          required={required}
          className="field__input field__textarea"
          aria-invalid={!!error}
          {...rest}
        />
        <span className="field__counter" aria-live="polite">{value.length} / {maxLength}</span>
      </div>
      {error ? <p className="field__error" role="alert">{error}</p> : hint && <p className="field__hint">{hint}</p>}
    </div>
  );
});

export default Textarea;
