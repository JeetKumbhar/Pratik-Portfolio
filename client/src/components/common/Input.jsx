import { forwardRef, useId } from 'react';
import { cx } from '../../utils/helpers';

/**
 * <Input label="Your name" required icon={<User size={18} />} placeholder="Enter your full name"
 *        value={v} onChange={e => setV(e.target.value)} error={errors.name} />
 */
const Input = forwardRef(function Input(
  { label, error, hint, icon, required, className = '', id, ...rest },
  ref
) {
  const autoId = useId();
  const inputId = id || autoId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className={cx('field', error && 'field--error', className)}>
      {label && (
        <label htmlFor={inputId} className="field__label">
          {label}
          {required && <span className="field__required" aria-hidden="true">*</span>}
        </label>
      )}
      <div className="field__control">
        {icon && <span className="field__icon" aria-hidden="true">{icon}</span>}
        <input
          ref={ref}
          id={inputId}
          className="field__input"
          required={required}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          {...rest}
        />
      </div>
      {error ? (
        <p id={`${inputId}-error`} className="field__error" role="alert">{error}</p>
      ) : (
        hint && <p id={`${inputId}-hint`} className="field__hint">{hint}</p>
      )}
    </div>
  );
});

export default Input;
