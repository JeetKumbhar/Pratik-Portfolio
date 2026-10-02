import { cx } from '../../utils/helpers';

/** variant: gold | solid | success | warning | danger | neutral  (e.g. "Most popular", booking status) */
export default function Badge({ children, variant = 'gold', icon, className = '' }) {
  return (
    <span className={cx('badge', `badge--${variant}`, className)}>
      {icon}
      {children}
    </span>
  );
}
