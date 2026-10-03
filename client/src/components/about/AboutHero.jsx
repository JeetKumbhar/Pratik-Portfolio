import { useState } from 'react';
import { ChevronDown, Play } from 'lucide-react';
import Button from '../common/Button';
import Modal from '../common/Modal';
import useMediaQuery from '../../hooks/useMediaQuery';
import { ABOUT_MEDIA, HERO_STATS } from './aboutData';

export default function AboutHero() {
  const [storyOpen, setStoryOpen] = useState(false);
  const [storyError, setStoryError] = useState(false);
  const [bgVideoFailed, setBgVideoFailed] = useState(false);

  // Only load the background video on larger screens with motion allowed
  const allowBgVideo = useMediaQuery('(min-width: 768px) and (prefers-reduced-motion: no-preference)');

  return (
    <section className="about-hero" data-hero-section>
      <div className="about-hero__media" data-hero-media>
        <div className="about-hero__img" style={{ '--about-img': `url("${ABOUT_MEDIA.heroImage}")` }} />
        {allowBgVideo && !bgVideoFailed && (
          <video
            className="about-hero__video"
            src={ABOUT_MEDIA.heroVideo}
            poster={ABOUT_MEDIA.heroImage}
            autoPlay muted loop playsInline preload="metadata"
            onError={() => setBgVideoFailed(true)}
          />
        )}
      </div>
      <div className="about-hero__shade" />
      <div className="about-hero__fade" data-hero-fade />

      <div className="container about-hero__inner">
        <div className="about-hero__content" data-hero-content>
          <p className="about-hero__eyebrow" data-hero>About me</p>
          <h1 className="about-hero__title" data-hero>Stories are worth capturing.</h1>
          <div className="about-hero__text" data-hero>
            <p>I'm Alex Morgan, a professional photographer with over 8 years of experience capturing real moments and emotions. For me, photography is more than just taking pictures. It's about preserving memories that last a lifetime.</p>
            <p>From the quiet, raw moments to the big, unforgettable ones, I'm here to tell your story through my lens.</p>
          </div>

          <div data-hero>
            <Button variant="outline" icon={<Play size={16} />} onClick={() => setStoryOpen(true)}>Watch my story</Button>
          </div>

          <dl className="about-hero__stats" data-hero>
            {HERO_STATS.map(({ icon: Icon, value, label }) => (
              <div key={label} className="about-hero__stat">
                <Icon size={22} strokeWidth={1.4} aria-hidden="true" />
                <div>
                  <dt>{value}</dt>
                  <dd>{label}</dd>
                </div>
              </div>
            ))}
          </dl>

          <div className="about-hero__sign" data-hero>
            <span className="about-hero__script">Alex Morgan</span>
            <span className="about-hero__name">Alex Morgan</span>
          </div>
        </div>

        <div className="about-hero__scroll" aria-hidden="true">
          <span>Scroll</span>
          <ChevronDown size={18} />
        </div>
      </div>

      <Modal isOpen={storyOpen} onClose={() => setStoryOpen(false)} title="My story" size="lg">
        {storyError ? (
          <p className="confirm__message">Video coming soon. Add one at <code>public/videos/story.mp4</code>.</p>
        ) : (
          <video className="hero__video" src={ABOUT_MEDIA.storyVideo} controls autoPlay playsInline onError={() => setStoryError(true)} />
        )}
      </Modal>
    </section>
  );
}
