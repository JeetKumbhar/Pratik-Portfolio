import { Check } from 'lucide-react';
import useBooking from '../../hooks/useBooking';
import { cx } from '../../utils/helpers';
import { STEPS } from './bookingData';

/** Completed steps are clickable so people can jump back to edit. */
export default function BookingProgress() {
  const { step, maxStep, goTo } = useBooking();

  return (
    <ol className="progress" aria-label="Booking progress">
      {STEPS.map(({ id, label }) => {
        const done = id < step;
        const current = id === step;
        const reachable = id < step && id <= maxStep;
        return (
          <li key={id} className={cx('progress__step', done && 'is-done', current && 'is-current')} aria-current={current ? 'step' : undefined}>
            <button type="button" className="progress__btn" disabled={!reachable} onClick={() => goTo(id)}>
              <span className="progress__dot">{done ? <Check size={16} /> : id}</span>
              <span className="progress__label">{label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
