import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import SectionTitle from '../common/SectionTitle';
import Button from '../common/Button';
import { IMAGES, photoBg } from './homeData';

export default function AboutPreview() {
  return (
    <section className="home-section">
      <div className="container about-preview">
        <div className="about-preview__frame" data-image-reveal>
        <div
          className="about-preview__photo"
          role="img"
          aria-label="Pratik Shelke holding a camera"
          style={{ backgroundImage: photoBg(IMAGES.about, 'linear-gradient(160deg, #2a2a2a, #0c0c0c)') }}
        />
        </div>

        <div className="about-preview__body" data-reveal>
          <SectionTitle className="title--script" eyebrow="About me" title="Hi, I'm Pratik Shelke" serif split />
          <p>
            I'm a professional photographer with over 5 years of experience capturing real moments and emotions.
            For me, photography is more than just taking pictures. It's about preserving memories that last a lifetime.
          </p>
          <p>From the quiet, raw moments to the big, unforgettable ones, I'm here to tell your story through my lens.</p>
          <div className="about-preview__actions">
            <Button to="/about" variant="outline" iconRight={<ArrowRight size={16} />}>Read more</Button>
            <Link to="/portfolio" className="text-link">See my work</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
