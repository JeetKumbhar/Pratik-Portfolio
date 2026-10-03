import { useState } from 'react';
import { Plus } from 'lucide-react';
import SectionTitle from '../common/SectionTitle';
import { cx } from '../../utils/helpers';
import { FAQS } from './servicesData';

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState(0); // first one open; click again to close

  return (
    <section className="home-section">
      <div className="container faq">
        <SectionTitle eyebrow="Good to know" title="Frequently asked questions" align="center" serif />

        <div className="faq__list">
          {FAQS.map(({ q, a }, i) => {
            const open = openIndex === i;
            return (
              <div key={q} className={cx('faq__item', open && 'is-open')}>
                <h3>
                  <button
                    type="button"
                    className="faq__q"
                    aria-expanded={open}
                    aria-controls={`faq-panel-${i}`}
                    id={`faq-btn-${i}`}
                    onClick={() => setOpenIndex(open ? null : i)}
                  >
                    {q}
                    <Plus size={20} className="faq__icon" aria-hidden="true" />
                  </button>
                </h3>
                <div id={`faq-panel-${i}`} role="region" aria-labelledby={`faq-btn-${i}`} className="faq__panel">
                  <div><p className="faq__a">{a}</p></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
