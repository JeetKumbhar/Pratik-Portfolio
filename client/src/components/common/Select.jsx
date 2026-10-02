import { forwardRef, useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { cx } from '../../utils/helpers';

/**
 * <Select label="Type of shoot" required placeholder="Select shoot type"
 *         options={[{ value: 'wedding', label: 'Wedding' }]} value={v} onChange={...} />
 */
const Select = forwardRef(function Select(
  { label, options = [], placeholder = 'Select an option', error, hint, icon, required, className = '', id, value, ...rest },
  ref
) {
  const autoId = useId();
  const selectId = id || autoId;

  return (
    <div className={cx('field', error && 'field--error', className)}>
      {label && (
        <label htmlFor={selectId} className="field__label">
          {label}
          {required && <span className="field__required" aria-hidden="true">*</span>}
        </label>
      )}
      <div className="field__control">
        {icon && <span className="field__icon" aria-hidden="true">{icon}</span>}
        <select
          ref={ref}
          id={selectId}
          className="field__input field__input--select"
          required={required}
          value={value}
          aria-invalid={!!error}
          {...rest}
        >
          <option value="" disabled>{placeholder}</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <ChevronDown size={18} className="field__chevron" aria-hidden="true" />
      </div>
      {error ? <p className="field__error" role="alert">{error}</p> : hint && <p className="field__hint">{hint}</p>}
    </div>
  );
});

export default Select;
