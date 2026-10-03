import { useState } from 'react';
import { AlertCircle, ArrowLeft, CalendarDays, Camera, ClipboardList, Info, Lock, MapPin, Palette, Pencil, Send, Tag, User, Users } from 'lucide-react';
import Button from '../common/Button';
import useBooking from '../../hooks/useBooking';
import { submitBooking } from '../../services/bookingService';
import { LOCATIONS, SHOOT_TYPES, formatDate, formatTime, labelOf, money } from './bookingData';

export default function BookingReview() {
  const { values, goTo, back, selectedPackage, setSubmission, validateAll } = useBooking();
  const [state, setState] = useState('idle'); // idle | submitting | error

  const rows = [
    { icon: User, label: 'Details', step: 1, main: values.name, sub: `${values.email} · ${values.phone}` },
    { icon: Camera, label: 'Shoot type', step: 2, main: labelOf(SHOOT_TYPES, values.shootType) },
    { icon: MapPin, label: 'Location', step: 2, main: labelOf(LOCATIONS, values.location), sub: values.locationDetails },
    { icon: CalendarDays, label: 'Date & time', step: 3, main: `${formatDate(values.date)} at ${formatTime(values.time)}`, sub: selectedPackage ? `Duration: ${selectedPackage.duration}` : '' },
    { icon: Users, label: 'People', step: 2, main: values.people },
    { icon: Palette, label: 'Style & mood', step: 2, main: values.styles.join(', ') || 'No preference' },
    { icon: Tag, label: 'Package', step: 2, main: selectedPackage?.name, sub: selectedPackage?.price != null ? money(selectedPackage.price) : 'Custom quote to follow' },
    { icon: ClipboardList, label: 'Special requests', step: 2, main: values.requests || 'None' },
  ];

  const onSubmit = async () => {
    // Final gate: never send incomplete data. If anything is wrong, jump to that step.
    const { isValid, errors, firstInvalidStep } = validateAll();
    if (!isValid) {
      goTo(firstInvalidStep, Object.values(errors[firstInvalidStep]));
      return;
    }

    setState('submitting');
    try {
      const result = await submitBooking({
        ...values,
        package: selectedPackage && { id: selectedPackage.id, name: selectedPackage.name, price: selectedPackage.price, duration: selectedPackage.duration },
      });
      setSubmission({ reference: result.reference, name: values.name, email: values.email, date: values.date, time: values.time, shootType: values.shootType });
    } catch {
      setState('error');
    }
  };

  return (
    <div className="step">
      <h2 className="block__title">Review your booking</h2>

      <ul className="review">
        {rows.map(({ icon: Icon, label, step, main, sub }) => (
          <li key={label} className="review__row">
            <span className="review__icon"><Icon size={18} strokeWidth={1.5} /></span>
            <span className="review__label">{label}</span>
            <span className="review__value">
              <span className="review__main">{main}</span>
              {sub ? <span className="review__sub">{sub}</span> : null}
            </span>
            <button type="button" className="review__edit" onClick={() => goTo(step)} aria-label={`Edit ${label}`}>
              Edit <Pencil size={13} />
            </button>
          </li>
        ))}
      </ul>

      <div className="next-box">
        <span className="next-box__icon"><Send size={20} strokeWidth={1.4} /></span>
        <div>
          <p className="next-box__title">What happens next?</p>
          <p>Once you submit your request, I'll review the details and get back to you within 24 hours to confirm availability and discuss the next steps.</p>
        </div>
      </div>

      <p className="step__note"><Info size={14} /> This is an estimated price. Final price may vary based on specific requirements.</p>

      {state === 'error' && <p className="form-alert" role="alert"><AlertCircle size={18} /> We couldn't send your request. Please try again.</p>}

      <div className="step-nav">
        <Button variant="ghost" size="lg" icon={<ArrowLeft size={16} />} onClick={back} disabled={state === 'submitting'}>Previous</Button>
        <Button size="lg" iconRight={<Send size={16} />} onClick={onSubmit} loading={state === 'submitting'}>Submit request</Button>
      </div>
      <p className="step__note"><Lock size={14} /> Your information is secure and will never be shared.</p>
    </div>
  );
}
