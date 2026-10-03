import { useState } from 'react';
import { Lock, Mail, Phone, User } from 'lucide-react';
import Input from '../common/Input';
import StepNav from './StepNav';
import useBooking from '../../hooks/useBooking';
import { validateDetails } from './bookingValidation';

export default function PersonalDetails() {
  const { values, update, next } = useBooking();
  const [errors, setErrors] = useState({});

  const set = (field) => (e) => {
    update({ [field]: e.target.value });
    if (errors[field]) setErrors((er) => ({ ...er, [field]: undefined }));
  };

  const onNext = () => {
    const found = validateDetails(values);
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first) { document.getElementById(`book-${first}`)?.focus(); return; }
    next();
  };

  return (
    <form className="step" onSubmit={(e) => { e.preventDefault(); onNext(); }} noValidate>
      <div className="step__grid">
        <Input id="book-name" name="name" label="Your name" required autoComplete="name" icon={<User size={18} />}
          placeholder="Enter your full name" value={values.name} onChange={set('name')} error={errors.name} className="span-2" />
        <Input id="book-email" name="email" type="email" label="Email address" required autoComplete="email" icon={<Mail size={18} />}
          placeholder="you@example.com" value={values.email} onChange={set('email')} error={errors.email} />
        <Input id="book-phone" name="phone" type="tel" label="Phone number" required autoComplete="tel" icon={<Phone size={18} />}
          placeholder="+1 (123) 456-7890" value={values.phone} onChange={set('phone')} error={errors.phone} />
      </div>
      <p className="step__note"><Lock size={14} /> Your information is secure and will never be shared.</p>
      <StepNav onNext={onNext} showBack={false} />
    </form>
  );
}
