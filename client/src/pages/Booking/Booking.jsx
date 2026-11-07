import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import { BookingProvider } from '../../context/BookingContext';
import useBooking from '../../hooks/useBooking';
import BookingProgress from '../../components/booking/BookingProgress';
import PersonalDetails from '../../components/booking/PersonalDetails';
import ShootPreferences from '../../components/booking/ShootPreferences';
import DateTimePicker from '../../components/booking/DateTimePicker';
import BookingReview from '../../components/booking/BookingReview';
import BookingSuccess from '../../components/booking/BookingSuccess';
import BookingSummary from '../../components/booking/BookingSummary';
import Loader from '../../components/common/Loader';
import Button from '../../components/common/Button';
import useSettings, { useSite } from '../../hooks/useSettings';
import { STEPS } from '../../components/booking/bookingData';

const HEADERS = {
  1: { eyebrow: 'Book a shoot', title: "Let's create something amazing.", text: "Ready to capture your special moments? Fill out the form below and I'll get back to you within 24 hours." },
  2: { title: '2. Preferences', text: "Tell me more about what you're looking for." },
  3: { title: '3. Date & Time', text: 'Choose your preferred date and time for the shoot.' },
  4: { title: '4. Review', text: 'Review your booking details and submit your request.' },
};

function BookingFlow() {
  const { step, back, update, submission, goTo, validateAll, notice } = useBooking();
  const { services } = useSettings();
  const [params] = useSearchParams();

  // Pre-fill from Services page links: /booking?service=wedding&package=standard
  useEffect(() => {
    const service = params.get('service');
    const pkg = params.get('package');
    const patch = {};
    if (service && services.some((s) => s.slug === service)) patch.shootType = service;
    if (pkg) patch.packageId = pkg;
    if (Object.keys(patch).length) update(patch);
  }, [params, update, services]);

  // Guard: if a later step is open (e.g. restored draft) but an earlier one is incomplete, go back to it
  useEffect(() => {
    if (submission || step <= 1) return;
    const { firstInvalidStep, errors } = validateAll();
    if (firstInvalidStep && firstInvalidStep < step) {
      goTo(firstInvalidStep, Object.values(errors[firstInvalidStep]));
    }
  }, [step, submission, validateAll, goTo]);

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

          {notice.length > 0 && (
            <div className="form-alert form-alert--list" role="alert">
              <AlertCircle size={18} />
              <div>
                <strong>Please fix the following to continue:</strong>
                <ul>{notice.map((m) => <li key={m}>{m}</li>)}</ul>
              </div>
            </div>
          )}

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

/** Bookings switched off in Admin → Settings → Booking: show the photographer's message instead of the form. */
function BookingClosed({ message, contactEnabled }) {
  return (
    <section className="home-section">
      <div className="container">
        <div className="success" role="status">
          <p className="success__eyebrow">Bookings</p>
          <h1 className="success__title">Bookings are paused</h1>
          <p className="success__text">{message}</p>
          <div className="success__actions">
            <Button to="/" size="lg">Back to home</Button>
            {contactEnabled && <Button to="/contact" variant="ghost" size="lg">Contact me</Button>}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Booking() {
  const { settings, loaded } = useSettings();
  const { contactEnabled } = useSite();
  if (!loaded) return <div className="container" style={{ padding: '120px 0' }}><Loader label="Loading" /></div>;
  if (!settings.booking.enabled) return <BookingClosed message={settings.booking.disabledMessage} contactEnabled={contactEnabled} />;
  return (
    <BookingProvider>
      <BookingFlow />
    </BookingProvider>
  );
}
