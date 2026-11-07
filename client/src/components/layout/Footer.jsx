import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, Mail, Phone } from 'lucide-react';
import SocialLinks from './SocialLinks';
import { mailHref, phoneHref } from '../../utils/siteSettings';
import { useSite } from '../../hooks/useSettings';

export default function Footer() {
  const [creditLinkClicked, setCreditLinkClicked] = useState(false);
  const { settings, brand } = useSite();
  const { email, primaryPhone } = settings.business;

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
            {email && <a className="footer__item" href={mailHref(email)}><Mail size={18} />{email}</a>}
            {primaryPhone && <a className="footer__item" href={phoneHref(primaryPhone)}><Phone size={18} />{primaryPhone}</a>}
            <SocialLinks />
          </div>
        </div>

        <div className="footer__bottom">
          <p>© {new Date().getFullYear()} {[brand.name, brand.tagline].filter(Boolean).join(' ')}. All rights reserved.</p>
          <div className="footer__legal">
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
          </div>
        </div>

        <div className="footer__credit">
          <span>Made with</span>
          <span className="footer__heart" aria-label="love" role="img">❤️</span>
          <span>by</span>
          {' '}
          <a
            href="https://www.linkedin.com/in/jeetkumbhar/"
            target="_blank"
            rel="noopener noreferrer"
            className={`footer__credit-link${creditLinkClicked ? ' footer__credit-link--reset' : ''}`}
            onClick={() => setCreditLinkClicked(true)}
            onMouseLeave={() => setCreditLinkClicked(false)}
          >
            Jeet
          </a>
        </div>
      </div>
    </footer>
  );
}
