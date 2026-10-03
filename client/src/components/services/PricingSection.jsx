import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CloudOff } from 'lucide-react';
import SectionTitle from '../common/SectionTitle';
import EmptyState from '../common/EmptyState';
import Loader from '../common/Loader';
import Button from '../common/Button';
import PricingCard from './PricingCard';
import { getPackages } from '../../services/packageService';

export default function PricingSection() {
  const [packages, setPackages] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ready | error

  const load = useCallback(() => {
    let cancelled = false;
    setStatus('loading');
    getPackages()
      .then((data) => { if (!cancelled) { setPackages(data); setStatus('ready'); } })
      .catch(() => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => load(), [load]);

  return (
    <section id="pricing" className="home-section home-section--alt pricing">
      <div className="container">
        <SectionTitle
          eyebrow="Choose your package"
          title="Packages & Pricing"
          subtitle="Simple, transparent pricing for every need."
          align="center"
          serif
        />

        {status === 'loading' && <div className="pricing__state"><Loader label="Loading packages" /></div>}

        {status === 'error' && (
          <EmptyState
            icon={<CloudOff size={28} />}
            title="Couldn't load packages"
            message="Something went wrong while loading pricing."
            action={<Button onClick={load}>Try again</Button>}
          />
        )}

        {status === 'ready' && (
          <ul className="pricing__grid">
            {packages.map((pkg) => (
              <li key={pkg.id}><PricingCard pkg={pkg} /></li>
            ))}
          </ul>
        )}

        <p className="pricing__note">
          Prices are starting points; your final quote depends on your requirements.
          Need something different? <Link to="/contact">Get a custom quote</Link>.
        </p>
      </div>
    </section>
  );
}
