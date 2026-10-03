import { Check, Clock } from 'lucide-react';
import Badge from '../common/Badge';
import Button from '../common/Button';
import { cx } from '../../utils/helpers';
import { BOOKING_PATH } from '../../utils/constants';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/** pkg: { id, name, tagline, price, duration, features[], popular } */
export default function PricingCard({ pkg }) {
  const { id, name, tagline, price, duration, features, popular } = pkg;

  return (
    <article className={cx('price-card', popular && 'price-card--popular')}>
      {popular && <Badge variant="solid" className="price-card__badge">Most popular</Badge>}

      <header className="price-card__head">
        <h3 className="price-card__name">{name}</h3>
        <p className="price-card__tagline">{tagline}</p>
        <p className="price-card__price">{money.format(price)}</p>
        <p className="price-card__duration"><Clock size={15} aria-hidden="true" />{duration}</p>
      </header>

      <ul className="price-card__features">
        {features.map((f) => (
          <li key={f}><Check size={16} aria-hidden="true" />{f}</li>
        ))}
      </ul>

      <Button to={`${BOOKING_PATH}?package=${id}`} variant={popular ? 'primary' : 'outline'} fullWidth>
        Book now
      </Button>
    </article>
  );
}
