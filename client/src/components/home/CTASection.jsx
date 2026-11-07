import { Calendar, ArrowRight } from 'lucide-react';
import Button from '../common/Button';
import { BOOKING_PATH } from '../../utils/constants';
import { useSite } from '../../hooks/useSettings';

export default function CTASection() {
  const { cta } = useSite();
  return (
    <section className="home-section">
      <div className="container">
        <div className="cta" data-reveal>
          <span className="cta__icon"><Calendar size={26} strokeWidth={1.4} /></span>
          <div className="cta__text">
            <h2 className="cta__title">Ready to capture your moment?</h2>
            <p>Book a session today and let's create something amazing together.</p>
          </div>
          <Button to={BOOKING_PATH} size="lg" iconRight={<ArrowRight size={18} />}>{cta}</Button>
        </div>
      </div>
    </section>
  );
}
