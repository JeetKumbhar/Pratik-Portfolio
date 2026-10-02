import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { cx } from '../../utils/helpers';

/**
 * <Button>Next step</Button>
 * <Button to="/booking" variant="outline" icon={<Calendar size={16} />}>Book a shoot</Button>
 * <Button loading>Saving…</Button>
 */
export default function Button({
  children,
  variant = 'primary', // primary | outline | ghost | danger
  size = 'md', // sm | md | lg
  to,
  href,
  icon,
  iconRight,
  loading = false,
  fullWidth = false,
  disabled = false,
  type = 'button',
  className = '',
  ...rest
}) {
  const classes = cx('btn', `btn--${variant}`, `btn--${size}`, fullWidth && 'btn--full', className);

  const content = (
    <>
      {loading ? <Loader2 size={16} className="btn__spinner" aria-hidden="true" /> : icon}
      {children}
      {!loading && iconRight}
    </>
  );

  if (to) return <Link to={to} className={classes} {...rest}>{content}</Link>;
  if (href) return <a href={href} className={classes} {...rest}>{content}</a>;

  return (
    <button type={type} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {content}
    </button>
  );
}
