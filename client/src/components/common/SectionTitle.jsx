import { cx } from '../../utils/helpers';

/**
 * <SectionTitle eyebrow="What I offer" title="Photography & Services"
 *   subtitle="Tailored photography services…" align="center" serif />
 * Use `caps` for the uppercase sans headings used on About / Booking pages.
 */
export default function SectionTitle({
  eyebrow,
  title,
  subtitle,
  align = 'left', // left | center
  serif = false,
  caps = false,
  as: Heading = 'h2',
  className = '',
}) {
  return (
    <header className={cx('section-title', align === 'center' && 'section-title--center', className)}>
      {eyebrow && <span className="section-title__eyebrow">{eyebrow}</span>}
      <Heading className={cx('section-title__heading', serif && 'section-title__heading--serif', caps && 'section-title__heading--caps')}>
        {title}
      </Heading>
      {subtitle && <p className="section-title__subtitle">{subtitle}</p>}
    </header>
  );
}
