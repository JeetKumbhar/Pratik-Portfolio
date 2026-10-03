import { ArrowLeft, ArrowRight } from 'lucide-react';
import Button from '../common/Button';
import useBooking from '../../hooks/useBooking';

/** Previous / Next buttons used at the bottom of steps 1 to 3 */
export default function StepNav({ onNext, showBack = true, nextLabel = 'Next step' }) {
  const { step, back } = useBooking();
  return (
    <div className="step-nav">
      {showBack && <Button variant="ghost" size="lg" icon={<ArrowLeft size={16} />} onClick={back}>Previous</Button>}
      <Button size="lg" iconRight={<ArrowRight size={16} />} onClick={onNext}>{nextLabel}</Button>
      <span className="step-nav__count">Step {step} of 4</span>
    </div>
  );
}
