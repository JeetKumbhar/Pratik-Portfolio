import useBooking from '../../hooks/useBooking';
import { LOCATIONS, SHOOT_TYPES, TRUST, formatDate, formatTime, labelOf, money } from './bookingData';

/** Right-hand column: photo, live summary (desktop), trust badges. */
export default function BookingSummary() {
  const { values, selectedPackage } = useBooking();
  const { shootType, location, date, time, people, styles } = values;

  const rows = [
    ['Shoot type', labelOf(SHOOT_TYPES, shootType)],
    ['Location', labelOf(LOCATIONS, location)],
    ['Date', formatDate(date)],
    ['Time', formatTime(time)],
    ['Duration', selectedPackage?.duration],
    ['People', people],
    ['Style & mood', styles.join(', ')],
    ['Package', selectedPackage?.name],
  ];

  return (
    <aside className="side">
      <div className="side__photo hide-mobile" role="img" aria-label="Couple on a mountain overlook at sunset" />

      <section className="summary hide-mobile" aria-label="Booking summary">
        <h2 className="summary__title">Booking summary</h2>
        <dl className="summary__rows">
          {rows.map(([label, value]) => (
            <div key={label} className="summary__row">
              <dt>{label}</dt>
              <dd className={value ? '' : 'is-empty'}>{value || '–'}</dd>
            </div>
          ))}
        </dl>
        <div className="summary__total">
          <span>Total estimate<small>(Estimated)</small></span>
          <strong>{selectedPackage?.price != null ? money(selectedPackage.price) : '–'}</strong>
        </div>
      </section>

      <ul className="trust">
        {TRUST.map(({ icon: Icon, title, text }) => (
          <li key={title} className="trust__item">
            <Icon size={24} strokeWidth={1.3} />
            <div><p className="trust__title">{title}</p><p className="trust__text">{text}</p></div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
