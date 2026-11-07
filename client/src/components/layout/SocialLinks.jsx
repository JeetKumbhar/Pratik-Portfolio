import { useSite } from '../../hooks/useSettings';
import { SOCIAL_ICONS } from './socialIcons';

/** Social icons for the footer and the mobile menu: only the links filled in under Settings → Business. */
export default function SocialLinks() {
  const { social } = useSite();
  if (social.length === 0) return null;
  return (
    <div className="footer__social">
      {social.map(({ key, label, href }) => {
        const Icon = SOCIAL_ICONS[key];
        return (
          <a key={key} href={href} target="_blank" rel="noopener noreferrer" aria-label={label}>
            <Icon size={18} />
          </a>
        );
      })}
    </div>
  );
}
