import { cx } from '../../utils/helpers';

/**
 * <Card padding="lg" active>…</Card>          e.g. highlighted "Standard" package
 * <Card as="button" interactive onClick={…}>   e.g. selectable shoot-type tile
 */
export default function Card({
  as: Tag = 'div',
  padding = 'md', // none | sm | md | lg
  interactive = false,
  active = false,
  className = '',
  children,
  ...rest
}) {
  return (
    <Tag
      className={cx('card', `card--pad-${padding}`, interactive && 'card--interactive', active && 'card--active', className)}
      {...rest}
    >
      {children}
    </Tag>
  );
}
