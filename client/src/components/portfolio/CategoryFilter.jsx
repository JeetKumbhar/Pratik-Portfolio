import { cx } from '../../utils/helpers';

/** categories: [{ value, label, count }]  ·  active: current value  ·  onChange(value) */
export default function CategoryFilter({ categories, active, onChange }) {
  return (
    <div className="filter" role="group" aria-label="Filter portfolio by category">
      <div className="filter__scroll">
        {categories.map(({ value, label, count }) => (
          <button
            key={value}
            type="button"
            className={cx('filter__pill', active === value && 'is-active')}
            aria-pressed={active === value}
            onClick={() => onChange(value)}
          >
            {label}
            <span className="filter__count">{count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
