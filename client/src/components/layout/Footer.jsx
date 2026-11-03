import { Link } from 'react-router-dom';
import { MessageCircle, Mail, Phone } from 'lucide-react';
import SocialLinks from './SocialLinks';
import { SITE } from '../../utils/constants';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer__contact">
          <div className="footer__ask">
            <span className="footer__ask-icon"><MessageCircle size={22} /></span>
            <div>
              <p className="footer__ask-title">Have questions?</p>
              <p className="footer__ask-text">I'm here to help! Reach out anytime.</p>
            </div>
          </div>

          <div className="footer__details">
            <a className="footer__item" href={`mailto:${SITE.email}`}><Mail size={18} />{SITE.email}</a>
            <a className="footer__item" href={`tel:${SITE.phone.replace(/[^\d+]/g, '')}`}><Phone size={18} />{SITE.phone}</a>
            <SocialLinks />
          </div>
        </div>

        <div className="footer__bottom">
          <p>© {new Date().getFullYear()} {SITE.name} {SITE.tagline}. All rights reserved.</p>
          <div className="footer__legal">
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
          </div>
        </div>

        <div className="footer__credit">
          <span>Made with</span>
          <span className="footer__heart" aria-label="love" role="img">❤️</span>
          <span>by</span>
          <a
            href="https://www.linkedin.com/in/jeetkumbhar/"
            target="_blank"
            rel="noopener noreferrer"
            className="footer__credit-link"
          >
            Jeet
          </a>
        </div>
      </div>
    </footer>
  );
}
