import { AlertCircle, Check, Clock } from 'lucide-react';
import Badge from '../common/Badge';
import Loader from '../common/Loader';
import useBooking from '../../hooks/useBooking';
import { cx } from '../../utils/helpers';
import { CUSTOM_PACKAGE, money } from './bookingData';

export default function PackageSelector({ error }) {
  const { values, update, packages, packagesStatus } = useBooking();
  const options = [...packages, CUSTOM_PACKAGE];

  if (packagesStatus === 'loading') return <Loader label="Loading packages" />;
  if (packagesStatus === 'error') {
    return <p className="form-alert" role="alert"><AlertCircle size={18} /> Couldn't load the packages. Refresh the page to try again.</p>;
  }

  return (
    <div>
      <div className="pkg-grid" role="radiogroup" aria-label="Package">
        {options.map((p) => {
          const selected = values.packageId === p.id;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={selected}
              className={cx('pkg', selected && 'is-selected')}
              onClick={() => update({ packageId: p.id })}
            >
              {p.popular && <Badge variant="solid" className="pkg__badge">Most popular</Badge>}
              <span className="pkg__check">{selected && <Check size={14} />}</span>
              <span className="pkg__name">{p.name}</span>
              <span className="pkg__price">{p.price != null ? money(p.price) : 'Custom'}</span>
              <span className="pkg__meta"><Clock size={13} />{p.duration}</span>
              <span className="pkg__tagline">{p.tagline}</span>
            </button>
          );
        })}
      </div>
      {error && <p className="field__error" role="alert">{error}</p>}
    </div>
  );
}
