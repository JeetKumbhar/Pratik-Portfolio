import ContactForm from '../../components/contact/ContactForm';
import ContactInfo from '../../components/contact/ContactInfo';
import SocialLinks from '../../components/contact/SocialLinks';
import Map from '../../components/contact/Map';
import SectionTitle from '../../components/common/SectionTitle';

export default function Contact() {
  return (
    <>
      {/* .page-hero is defined in services.css */}
      <section className="page-hero" style={{ '--page-hero-img': 'url("/images/contact/hero.jpg")' }}>
        <div className="container page-hero__inner">
          <p className="page-hero__eyebrow">Contact</p>
          <h1 className="page-hero__title">Let's talk about your story.</h1>
          <p className="page-hero__text">
            Questions, ideas or ready to book? Send a message and I'll get back to you within 24 hours.
          </p>
        </div>
      </section>

      <section className="home-section contact-section">
        <div className="container contact">
          <div className="contact__form card card--pad-lg">
            <SectionTitle eyebrow="Send a message" title="How can I help?" serif />
            <ContactForm />
          </div>

          <aside className="contact__side">
            <ContactInfo />
            <SocialLinks />
          </aside>
        </div>

        <div className="container contact__map">
          <Map />
        </div>
      </section>
    </>
  );
}
