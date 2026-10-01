import { cx } from '../../utils/helpers';

/**
 * <Loader />                       inline spinner
 * <Loader size="lg" label="Loading gallery" />
 * <Loader fullScreen />            covers the page (route-level loading)
 */
export default function Loader({ size = 'md', label, fullScreen = false, className = '' }) {
  const spinner = (
    <span className={cx('loader', `loader--${size}`, className)} role="status" aria-live="polite">
      <span className="loader__ring" aria-hidden="true" />
      {label ? <span className="loader__label">{label}</span> : <span className="sr-only">Loading</span>}
    </span>
  );

  return fullScreen ? <div className="loader-screen">{spinner}</div> : spinner;
}
