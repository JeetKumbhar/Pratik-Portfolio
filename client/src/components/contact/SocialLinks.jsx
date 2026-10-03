import { FaInstagram, FaWhatsapp, FaFacebookF, FaPinterestP } from 'react-icons/fa6';
import { SITE } from '../../utils/constants';
import { WHATSAPP_URL } from './contactData';

const LINKS = [
  { label: 'Instagram', href: SITE.social.instagram, Icon: FaInstagram },
  { label: 'WhatsApp', href: WHATSAPP_URL, Icon: FaWhatsapp },
  { label: 'Facebook', href: SITE.social.facebook, Icon: FaFacebookF },
  { label: 'Pinterest', href: SITE.social.pinterest, Icon: FaPinterestP },
];

export default function SocialLinks() {
  return (
    <div className="social-box">
      <h3 className="social-box__title">Find me online</h3>
      <ul className="social-box__list">
        {LINKS.map(({ label, href, Icon }) => (
          <li key={label}>
            <a className="social-link" href={href} target="_blank" rel="noopener noreferrer">
              <Icon size={18} aria-hidden="true" />
              {label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
