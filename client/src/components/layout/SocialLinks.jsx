import { FaInstagram, FaFacebookF, FaPinterestP } from 'react-icons/fa6';
import { SITE } from '../../utils/constants';

export default function SocialLinks() {
  const items = [
    { label: 'Instagram', href: SITE.social.instagram, Icon: FaInstagram },
    { label: 'Facebook', href: SITE.social.facebook, Icon: FaFacebookF },
    { label: 'Pinterest', href: SITE.social.pinterest, Icon: FaPinterestP },
  ];
  return (
    <div className="footer__social">
      {items.map(({ label, href, Icon }) => (
        <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label}>
          <Icon size={18} />
        </a>
      ))}
    </div>
  );
}