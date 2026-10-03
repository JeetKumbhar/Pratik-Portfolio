import { useState } from 'react';
import { Calendar, ChevronRight, Play, Mouse } from 'lucide-react';
import { FaInstagram, FaFacebookF, FaPinterestP, FaBehance } from 'react-icons/fa6';
import Button from '../common/Button';
import Modal from '../common/Modal';
import { BOOKING_PATH, SITE } from '../../utils/constants';
import { HERO_STATS, IMAGES } from './homeData';

const RAIL = [
  { label: 'Instagram', href: SITE.social.instagram, Icon: FaInstagram },
  { label: 'Facebook', href: SITE.social.facebook, Icon: FaFacebookF },
  { label: 'Pinterest', href: SITE.social.pinterest, Icon: FaPinterestP },
  { label: 'Behance', href: 'https://behance.net/', Icon: FaBehance },
];

export default function HeroSection() {
  const [reelOpen, setReelOpen] = useState(false);
  const [reelError, setReelError] = useState(false);

  return (
    <section className="hero" style={{ '--hero-img': `url("${IMAGES.hero}")` }}>
      <div className="container hero__inner">
        <div className="hero__content">
          <p className="hero__eyebrow">Capturing moments, creating memories</p>

          <h1 className="hero__title">
            Turning Moments Into Timeless <span className="hero__script">Stories</span>
          </h1>

          <p className="hero__text">
            Professional photography that speaks through light, emotion and authentic storytelling.
          </p>

          <div className="hero__actions">
            <Button to={BOOKING_PATH} size="lg" icon={<Calendar size={18} />} iconRight={<ChevronRight size={18} />}>
              Book a shoot
            </Button>
            <Button variant="ghost" size="lg" icon={<Play size={18} />} onClick={() => setReelOpen(true)}>
              View showreel
            </Button>
          </div>
        </div>

        <ul className="hero__rail" aria-label="Social links">
          {RAIL.map(({ label, href, Icon }) => (
            <li key={label}>
              <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label}><Icon size={18} /></a>
            </li>
          ))}
        </ul>

        <div className="hero__scroll" aria-hidden="true"><Mouse size={22} strokeWidth={1.3} /><span>Scroll down</span></div>

        <dl className="hero__stats">
          {HERO_STATS.map(({ value, label }) => (
            <div key={label} className="hero__stat">
              <dt className="hero__stat-value">{value}</dt>
              <dd className="hero__stat-label">{label}</dd>
            </div>
          ))}
        </dl>
      </div>

      <Modal isOpen={reelOpen} onClose={() => setReelOpen(false)} title="Showreel" size="lg">
        {reelError ? (
          <p className="confirm__message">Showreel coming soon. Add a video at <code>public/videos/showreel.mp4</code>.</p>
        ) : (
          <video className="hero__video" src={IMAGES.showreel} controls autoPlay playsInline onError={() => setReelError(true)} />
        )}
      </Modal>
    </section>
  );
}
