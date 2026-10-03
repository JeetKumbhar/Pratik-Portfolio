import { CheckCircle2 } from 'lucide-react';
import Button from '../common/Button';
import useBooking from '../../hooks/useBooking';
import { SHOOT_TYPES, formatDate, formatTime, labelOf } from './bookingData';

export default function BookingSuccess() {
  const { submission, reset } = useBooking();
  const { reference, name, email, date, time, shootType } = submission;

  return (
    <div className="success">
      <CheckCircle2 size={56} strokeWidth={1.2} />
      <p className="success__eyebrow">Request sent</p>
      <h1 className="success__title">Thank you{name ? `, ${name.trim().split(' ')[0]}` : ''}!</h1>
      <p className="success__text">
        I'll review your request and get back to you at <strong>{email}</strong> within 24 hours to confirm availability.
      </p>

      <dl className="success__card">
        <div><dt>Reference</dt><dd className="success__ref">{reference}</dd></div>
        <div><dt>Shoot</dt><dd>{labelOf(SHOOT_TYPES, shootType)}</dd></div>
        <div><dt>Requested slot</dt><dd>{formatDate(date)} at {formatTime(time)}</dd></div>
      </dl>

      <div className="success__actions">
        <Button to="/" size="lg">Back to home</Button>
        <Button variant="ghost" size="lg" onClick={reset}>Book another shoot</Button>
      </div>
    </div>
  );
}
