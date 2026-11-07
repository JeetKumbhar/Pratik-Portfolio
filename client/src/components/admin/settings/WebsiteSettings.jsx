import Input from '../../common/Input';
import useSettingsForm from '../../../hooks/useSettingsForm';
import { Card, SaveBar, Toggle } from './ui';

const HOME_BLOCKS = [
  { key: 'aboutPreview', label: 'About preview', text: 'A short introduction with a link to the About page.' },
  { key: 'featuredWork', label: 'Featured work', text: 'A selection of your portfolio photos. Needs the Portfolio page to be on.' },
  { key: 'services', label: 'Services', text: 'The kinds of photography you offer (from Settings → Services).' },
  { key: 'testimonials', label: 'Testimonials', text: 'What clients say about you.' },
  { key: 'contactCta', label: 'Booking call-to-action', text: 'The "Ready to capture your moment?" banner at the bottom.' },
];

/** Settings → Website: which parts of the public site visitors see, and the main button text. Changes apply to the live site. */
export default function WebsiteSettings({ saved, token, onSaved, report }) {
  const f = useSettingsForm({ group: 'website', saved, token, onSaved, report });
  const { draft: d, errors: e, set } = f;
  const portfolioOff = !d.portfolio.enabled;

  return (
    <form className="st-form" onSubmit={(ev) => { ev.preventDefault(); f.save(); }} noValidate>
      <Card title="Home page sections" description="Switch off a section and it disappears from the home page, with no empty space left behind.">
        {HOME_BLOCKS.map((b) => (
          <Toggle key={b.key} label={b.label} description={b.key === 'featuredWork' && portfolioOff ? 'Hidden because the Portfolio page is switched off.' : b.text}
            checked={d.home[b.key]} onChange={(v) => set(`home.${b.key}`, v)} error={e[`home.${b.key}`]} />
        ))}
      </Card>

      <Card title="Pages" description="A page that is switched off is removed from the menu, and its address sends visitors to the home page.">
        <Toggle label="Portfolio page" description="Your photo gallery. Also hides the featured work on the home page and links to it." checked={d.portfolio.enabled} onChange={(v) => set('portfolio.enabled', v)} error={e['portfolio.enabled']} />
        <Toggle label="Contact page" description="The contact form, map and details. The footer keeps your phone and email." checked={d.contact.enabled} onChange={(v) => set('contact.enabled', v)} error={e['contact.enabled']} />
      </Card>

      <Card title="Main button" description="The text on the main booking buttons (menu, home page, services).">
        <Input id="w-cta" label="Button text" maxLength={120} value={d.contact.ctaText} onChange={(ev) => set('contact.ctaText', ev.target.value)} error={e['contact.ctaText']}
          placeholder="Book a shoot" hint="Leave empty for 'Book a shoot'." />
      </Card>

      <SaveBar dirty={f.dirty} saving={f.saving} onSave={f.save} onReset={f.reset} status={f.status} />
    </form>
  );
}
