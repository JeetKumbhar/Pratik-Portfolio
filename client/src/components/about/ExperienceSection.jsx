import SectionTitle from '../common/SectionTitle';
import { EXPERIENCE_STATS, MILESTONES } from './aboutData';

export default function ExperienceSection() {
  return (
    <section className="home-section home-section--alt">
      <div className="container">
        <div data-reveal>
          <SectionTitle eyebrow="Experience" title="Years behind the lens" align="center" serif />
        </div>

        <dl className="exp-stats" data-stagger>
          {EXPERIENCE_STATS.map(({ value, suffix, label }) => (
            <div key={label} className="exp-stat">
              <dt className="exp-stat__value" data-count={value} data-suffix={suffix}>{value}{suffix}</dt>
              <dd className="exp-stat__label">{label}</dd>
            </div>
          ))}
        </dl>

        <ol className="timeline" data-stagger>
          {MILESTONES.map(({ year, title, text }) => (
            <li key={year} className="timeline__item">
              <span className="timeline__year">{year}</span>
              <div>
                <h3 className="timeline__title">{title}</h3>
                <p className="timeline__text">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
