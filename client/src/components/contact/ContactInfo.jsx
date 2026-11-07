import { Clock, Mail, MapPin, Phone } from 'lucide-react';
import { useSite } from '../../hooks/useSettings';
import { addressLines, mailHref, phoneHref } from '../../utils/siteSettings';

/** The contact details from Admin → Settings → Business. A detail that is empty is left out: no blank rows. */
export default function ContactInfo() {
  const { settings } = useSite();
  const { email, primaryPhone } = settings.business;
  const lines = addressLines(settings.business);

  const items = [
    email && { icon: Mail, label: 'Email', value: email, href: mailHref(email) },
    primaryPhone && { icon: Phone, label: 'Phone', value: primaryPhone, href: phoneHref(primaryPhone) },
    lines.length > 0 && { icon: MapPin, label: 'Location', value: lines.join(', ') },
    { icon: Clock, label: 'Response time', value: 'Within 24 hours' },
  ].filter(Boolean);

  return (
    <ul className="info-list">
      {items.map(({ icon: Icon, label, value, href }) => (
        <li key={label} className="info-item">
          <span className="info-item__icon"><Icon size={20} strokeWidth={1.5} /></span>
          <div>
            <p className="info-item__label">{label}</p>
            {href ? <a className="info-item__value info-item__value--link" href={href}>{value}</a> : <p className="info-item__value">{value}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}
