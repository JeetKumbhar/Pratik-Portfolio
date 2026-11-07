import { Mail, MapPin, Phone } from 'lucide-react';
import Input from '../../common/Input';
import useSettingsForm from '../../../hooks/useSettingsForm';
import { Card, SaveBar } from './ui';

/** Settings → Business: contact details, address and social links shown in the footer and on the Contact page. */
export default function BusinessSettings({ saved, token, onSaved, report }) {
  const f = useSettingsForm({ group: 'business', saved, token, onSaved, report });
  const { draft: d, errors: e, set } = f;
  const text = (id, label, field, extra = {}) => (
    <Input id={`b-${id}`} label={label} value={d[field]} onChange={(ev) => set(field, ev.target.value)} error={e[field]} {...extra} />
  );

  return (
    <form className="st-form" onSubmit={(ev) => { ev.preventDefault(); f.save(); }} noValidate>
      <Card title="Contact details" description="Shown in the footer and on the Contact page. Leave a field empty to hide it.">
        {text('name', 'Business name', 'businessName', { required: true, maxLength: 100 })}
        <div className="st-grid">
          {text('phone', 'Primary contact number', 'primaryPhone', { icon: <Phone size={18} />, inputMode: 'tel', placeholder: '+91 98765 43210', hint: 'With the country code.' })}
          {text('wa', 'WhatsApp business number', 'whatsappNumber', { icon: <Phone size={18} />, inputMode: 'tel', placeholder: '+91 98765 43210', hint: 'Used for the WhatsApp button on the website.' })}
        </div>
        {text('email', 'Business email', 'email', { icon: <Mail size={18} />, type: 'email', placeholder: 'hello@yourstudio.com' })}
      </Card>

      <Card title="Studio address" description="Shown on the Contact page. If nothing is filled in, no address or map is shown.">
        {text('address', 'Address', 'address', { icon: <MapPin size={18} />, maxLength: 200, placeholder: 'Street, building, area' })}
        <div className="st-grid">
          {text('city', 'City', 'city', { maxLength: 80 })}
          {text('state', 'State', 'state', { maxLength: 80 })}
          {text('country', 'Country', 'country', { maxLength: 80 })}
          {text('postal', 'Postal code', 'postalCode', { maxLength: 12 })}
        </div>
        {text('maps', 'Google Maps link', 'mapsUrl', { placeholder: 'https://maps.app.goo.gl/…', hint: 'Paste the "Share" link of your studio from Google Maps. Used for "Open in Google Maps".' })}
      </Card>

      <Card title="Social media" description="Only the ones you fill in appear on the website.">
        <div className="st-grid">
          <Input id="b-ig" label="Instagram" value={d.social.instagram} onChange={(ev) => set('social.instagram', ev.target.value)} error={e['social.instagram']} placeholder="https://instagram.com/yourname" />
          <Input id="b-fb" label="Facebook" value={d.social.facebook} onChange={(ev) => set('social.facebook', ev.target.value)} error={e['social.facebook']} placeholder="https://facebook.com/yourpage" />
          <Input id="b-yt" label="YouTube" value={d.social.youtube} onChange={(ev) => set('social.youtube', ev.target.value)} error={e['social.youtube']} placeholder="https://youtube.com/@yourchannel" />
        </div>
        {e.social && <p className="field__error" role="alert">{e.social}</p>}
      </Card>

      <SaveBar dirty={f.dirty} saving={f.saving} onSave={f.save} onReset={f.reset} status={f.status} />
    </form>
  );
}
