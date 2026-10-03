import { useState } from 'react';
import { Check, MapPin, Minus, Plus } from 'lucide-react';
import Input from '../common/Input';
import Textarea from '../common/Textarea';
import PackageSelector from './PackageSelector';
import StepNav from './StepNav';
import useBooking from '../../hooks/useBooking';
import { cx } from '../../utils/helpers';
import { validatePreferences } from './bookingValidation';
import { LOCATIONS, MAX_PEOPLE, MAX_STYLES, REQUESTS_MAX, SHOOT_TYPES, STYLES } from './bookingData';

function Block({ title, hint, error, children }) {
  return (
    <fieldset className="block">
      <legend className="block__title">{title}</legend>
      {hint && <p className="block__hint">{hint}</p>}
      {children}
      {error && <p className="field__error" role="alert">{error}</p>}
    </fieldset>
  );
}

export default function ShootPreferences() {
  const { values, update, next } = useBooking();
  const [errors, setErrors] = useState({});

  const clear = (field) => errors[field] && setErrors((e) => ({ ...e, [field]: undefined }));
  const pick = (field, value) => { update({ [field]: value }); clear(field); };
  const setPeople = (n) => update({ people: Math.min(MAX_PEOPLE, Math.max(1, n)) });

  const toggleStyle = (s) => {
    const has = values.styles.includes(s);
    if (!has && values.styles.length >= MAX_STYLES) return;
    update({ styles: has ? values.styles.filter((x) => x !== s) : [...values.styles, s] });
  };

  const onNext = () => {
    const found = validatePreferences(values);
    setErrors(found);
    if (Object.keys(found).length) {
      document.querySelector('.block--error')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    next();
  };

  return (
    <div className="step">
      <div className={cx(errors.shootType && 'block--error')}>
        <Block title="Shoot type" hint="What type of shoot are you looking to book?" error={errors.shootType}>
          <div className="tiles tiles--3" role="radiogroup" aria-label="Shoot type">
            {SHOOT_TYPES.map(({ id, label, text, icon: Icon }) => (
              <button key={id} type="button" role="radio" aria-checked={values.shootType === id}
                className={cx('tile', values.shootType === id && 'is-selected')} onClick={() => pick('shootType', id)}>
                <Icon size={26} strokeWidth={1.3} />
                <span className="tile__label">{label}</span>
                <span className="tile__text">{text}</span>
                {values.shootType === id && <span className="tile__check"><Check size={12} /></span>}
              </button>
            ))}
          </div>
        </Block>
      </div>

      <div className={cx(errors.location && 'block--error')}>
        <Block title="Location preference" hint="Where would you like your shoot to take place?" error={errors.location}>
          <div className="tiles tiles--4" role="radiogroup" aria-label="Location">
            {LOCATIONS.map(({ id, label, text, icon: Icon }) => (
              <button key={id} type="button" role="radio" aria-checked={values.location === id}
                className={cx('tile tile--row', values.location === id && 'is-selected')} onClick={() => pick('location', id)}>
                <Icon size={22} strokeWidth={1.3} />
                <span><span className="tile__label">{label}</span><span className="tile__text">{text}</span></span>
              </button>
            ))}
          </div>
          <Input id="book-locationDetails" label="Location details (optional)" icon={<MapPin size={18} />}
            placeholder="City, venue or landmark" value={values.locationDetails} onChange={(e) => update({ locationDetails: e.target.value })} className="block__input" />
        </Block>
      </div>

      <div className="block-row">
        <Block title="Style & mood" hint={`What style or mood are you envisioning? Pick up to ${MAX_STYLES}.`}>
          <div className="chips">
            {STYLES.map((s) => {
              const on = values.styles.includes(s);
              const locked = !on && values.styles.length >= MAX_STYLES;
              return (
                <button key={s} type="button" aria-pressed={on} disabled={locked} className={cx('chip', on && 'is-selected')} onClick={() => toggleStyle(s)}>{s}</button>
              );
            })}
          </div>
        </Block>

        <Block title="Number of people" hint="Include yourself in the count." error={errors.people}>
          <div className="stepper">
            <button type="button" onClick={() => setPeople(values.people - 1)} disabled={values.people <= 1} aria-label="Fewer people"><Minus size={16} /></button>
            <output aria-live="polite">{values.people}</output>
            <button type="button" onClick={() => setPeople(values.people + 1)} disabled={values.people >= MAX_PEOPLE} aria-label="More people"><Plus size={16} /></button>
          </div>
        </Block>
      </div>

      <Textarea id="book-requests" label="Any special requests?" maxLength={REQUESTS_MAX}
        placeholder="Share your ideas, inspiration, must-have shots…" value={values.requests} onChange={(e) => update({ requests: e.target.value })} />

      <div className={cx(errors.packageId && 'block--error')}>
        <Block title="Package" hint="Pick the package that fits best. You can change this later." >
          <PackageSelector error={errors.packageId} />
        </Block>
      </div>

      <StepNav onNext={onNext} />
    </div>
  );
}
