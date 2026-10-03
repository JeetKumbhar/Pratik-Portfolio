import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { BookingProvider } from '../../context/BookingContext';
import useBooking from '../../hooks/useBooking';
import BookingProgress from '../../components/booking/BookingProgress';
import PersonalDetails from '../../components/booking/PersonalDetails';
import ShootPreferences from '../../components/booking/ShootPreferences';
import DateTimePicker from '../../components/booking/DateTimePicker';
import BookingReview from '../../components/booking/BookingReview';
import BookingSuccess from '../../components/booking/BookingSuccess';
import BookingSummary from '../../components/booking/BookingSummary';
import { SHOOT_TYPES, STEPS } from '../../components/booking/bookingData';

const HEADERS = {
  1: { eyebrow: 'Book a shoot', title: "Let's create something amazing.", text: "Ready to capture your special moments? Fill out the form below and I'll get back to you within 24 hours." },
  2: { title: '2. Preferences', text: "Tell me more about what you're looking for." },
  3: { title: '3. Date & Time', text: 'Choose your preferred date and time for the shoot.' },
  4: { title: '4. Review', text: 'Review your booking details and submit your request.' },
};

function BookingFlow() {
  const { step, back, update, submission } = useBooking();
  const [params] = useSearchParams();

  // Pre-fill from Services page links: /booking?service=wedding&package=standard
  useEffect(() => {
    const service = params.get('service');
    const pkg = params.get('package');
    const patch = {};
    if (service && SHOOT_TYPES.some((s) => s.id === service)) patch.shootType = service;
    if (pkg) patch.packageId = pkg;
    if (Object.keys(patch).length) update(patch);
  }, [params, update]);

  if (submission) {
    return <section className="home-section"><div className="container"><BookingSuccess /></div></section>;
  }

  const header = HEADERS[step];
  const stepName = STEPS[step - 1].label;

  return (
    <section className="booking-page">
      <div className="container booking">
        <div className="booking__main">
          {step > 1 && (
            <button type="button" className="booking__back" onClick={back}>
              <ArrowLeft size={16} /> Back to {STEPS[step - 2].label}
            </button>
          )}

          <header className="booking__head">
            <p className="booking__eyebrow">{header.eyebrow ?? `Step ${step} of 4`}</p>
            <h1 className="booking__title">{header.title}</h1>
            <p className="booking__text">{header.text}</p>
          </header>

          <BookingProgress />

          {/* key restarts the fade-in on each step */}
          <div key={step} className="booking__step" aria-label={stepName}>
            {step === 1 && <PersonalDetails />}
            {step === 2 && <ShootPreferences />}
            {step === 3 && <DateTimePicker />}
            {step === 4 && <BookingReview />}
          </div>
        </div>

        <BookingSummary />
      </div>
    </section>
  );
}

export default function Booking() {
  return (
    <BookingProvider>
      <BookingFlow />
    </BookingProvider>
  );
}
