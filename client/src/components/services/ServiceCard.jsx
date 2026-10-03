import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { BOOKING_PATH } from '../../utils/constants';

export default function ServiceCard({ service }) {
  const { id, title, text, icon: Icon, gradient } = service;

  return (
    <article className="svc-card">
      <div
        className="svc-card__media"
        role="img"
        aria-label={`${title} sample photo`}
        style={{ backgroundImage: `linear-gradient(0deg, rgba(10,10,10,0.85), rgba(10,10,10,0) 60%), url("/images/services/${id}.jpg"), ${gradient}` }}
      />
      <div className="svc-card__body">
        <span className="svc-card__icon"><Icon size={22} strokeWidth={1.4} /></span>
        <h3 className="svc-card__title">{title}</h3>
        <p className="svc-card__text">{text}</p>
        <Link to={`${BOOKING_PATH}?service=${id}`} className="svc-card__link">
          Book this shoot <ArrowRight size={15} />
        </Link>
      </div>
    </article>
  );
}
