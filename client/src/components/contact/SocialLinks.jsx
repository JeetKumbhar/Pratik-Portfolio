import { useSite } from '../../hooks/useSettings';
import { SOCIAL_ICONS } from '../layout/socialIcons';

/** "Find me online": only the links filled in under Settings → Business (nothing at all if there are none). */
export default function SocialLinks() {
  const { social } = useSite();
  if (social.length === 0) return null;

  return (
    <div className="social-box">
      <h3 className="social-box__title">Find me online</h3>
      <ul className="social-box__list">
        {social.map(({ key, label, href }) => {
          const Icon = SOCIAL_ICONS[key];
          return (
            <li key={key}>
              <a className="social-link" href={href} target="_blank" rel="noopener noreferrer">
                <Icon size={18} aria-hidden="true" />
                {label}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
