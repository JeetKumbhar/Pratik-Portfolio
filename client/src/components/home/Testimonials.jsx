import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Quote, Star } from 'lucide-react';
import SectionTitle from '../common/SectionTitle';
import { TESTIMONIALS } from './homeData';

export default function Testimonials() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = TESTIMONIALS.length;

  const go = (i) => setIndex((i + count) % count);

  // Auto-advance, paused while hovered/focused
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), 7000);
    return () => clearInterval(id);
  }, [paused, count]);

  const t = TESTIMONIALS[index];

  return (
    <section className="home-section home-section--alt">
      <div className="container">
        <SectionTitle eyebrow="Kind words" title="What clients say" align="center" serif />

        <div
          className="testimonial"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
        >
          <Quote size={36} strokeWidth={1.2} className="testimonial__mark" aria-hidden="true" />

          <figure key={index} className="testimonial__slide" aria-live="polite">
            <div className="testimonial__stars" aria-label="5 out of 5 stars">
              {[0, 1, 2, 3, 4].map((s) => <Star key={s} size={16} fill="currentColor" />)}
            </div>
            <blockquote className="testimonial__quote">{t.quote}</blockquote>
            <figcaption className="testimonial__author">
              <strong>{t.name}</strong>
              <span>{t.role}</span>
            </figcaption>
          </figure>

          <div className="testimonial__controls">
            <button type="button" onClick={() => go(index - 1)} aria-label="Previous testimonial"><ChevronLeft size={18} /></button>
            <div className="testimonial__dots">
              {TESTIMONIALS.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  className={i === index ? 'is-active' : ''}
                  onClick={() => go(i)}
                  aria-label={`Show testimonial ${i + 1}`}
                  aria-current={i === index}
                />
              ))}
            </div>
            <button type="button" onClick={() => go(index + 1)} aria-label="Next testimonial"><ChevronRight size={18} /></button>
          </div>
        </div>
      </div>
    </section>
  );
}
