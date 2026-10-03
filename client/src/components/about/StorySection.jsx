import SectionTitle from '../common/SectionTitle';
import { ABOUT_MEDIA, STORY } from './aboutData';

export default function StorySection() {
  return (
    <section className="home-section">
      <div className="container story">
        <div className="story__photo" data-image-reveal>
          <div className="story__img" data-parallax style={{ '--story-img': `url("${ABOUT_MEDIA.storyImage}")` }} role="img" aria-label="Alex Morgan on location" />
        </div>

        <div className="story__body">
          <div data-reveal>
            <SectionTitle className="title--script" eyebrow="My story" title={STORY.heading} serif split />
          </div>
          <div className="story__paras" data-stagger>
            {STORY.paragraphs.map((p) => <p key={p}>{p}</p>)}
            <blockquote className="story__quote">{STORY.quote}</blockquote>
          </div>
        </div>
      </div>
    </section>
  );
}
