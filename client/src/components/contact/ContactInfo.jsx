import { Clock, Mail, MapPin, Phone } from 'lucide-react';
import { SITE } from '../../utils/constants';
import { LOCATION } from './contactData';

export default function ContactInfo() {
  const items = [
    { icon: Mail, label: 'Email', value: SITE.email, href: `mailto:${SITE.email}` },
    { icon: Phone, label: 'Phone', value: SITE.phone, href: `tel:${SITE.phone.replace(/[^\d+]/g, '')}` },
    { icon: MapPin, label: 'Location', value: LOCATION.lines.join(', ') },
    { icon: Clock, label: 'Response time', value: 'Within 24 hours' },
  ];

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
