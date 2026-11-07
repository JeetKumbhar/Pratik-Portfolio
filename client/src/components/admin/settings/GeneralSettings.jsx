import Input from '../../common/Input';
import Select from '../../common/Select';
import useSettingsForm from '../../../hooks/useSettingsForm';
import { DEFAULT_FORMAT, formatDateKey, formatMoney, formatTimeKey } from '../../../utils/siteFormat';
import { timezoneLabel, timezoneOptions } from '../../../utils/settingsUtils';
import { Card, ImageField, SaveBar } from './ui';

const SAMPLE_DATE = '2026-11-05';
const SAMPLE_TIME = '15:30';

/** Settings → General: names, logo, favicon, currency, country code, timezone, date and time format. */
export default function GeneralSettings({ saved, options, token, onSaved, report }) {
  const f = useSettingsForm({ group: 'general', saved, token, onSaved, report });
  const { draft: d, errors: e, set } = f;
  const tzOptions = timezoneOptions(d.timezone).map((tz) => ({ value: tz, label: timezoneLabel(tz) }));

  return (
    <form className="st-form" onSubmit={(ev) => { ev.preventDefault(); f.save(); }} noValidate>
      <Card title="Website identity" description="The name shown in the menu, the footer and the browser tab.">
        <div className="st-grid">
          <Input id="g-site" label="Website name" required maxLength={80} value={d.websiteName} onChange={(ev) => set('websiteName', ev.target.value)} error={e.websiteName}
            hint="For example: Pratik Shelke Photography" />
          <Input id="g-name" label="Photographer name" required maxLength={80} value={d.photographerName} onChange={(ev) => set('photographerName', ev.target.value)} error={e.photographerName} />
        </div>
        <div className="st-grid">
          <ImageField label="Logo" value={d.logo} onChange={(v) => set('logo', v)} error={e.logo} token={token} enabled={options.imageStorageConfigured}
            hint="Optional. JPG, PNG or WebP up to 5 MB. Without a logo the camera icon is shown." />
          <ImageField label="Favicon" value={d.favicon} onChange={(v) => set('favicon', v)} error={e.favicon} token={token} enabled={options.imageStorageConfigured}
            hint="The small icon in the browser tab. A square image works best." />
        </div>
      </Card>

      <Card title="Region and formats" description="Used for prices, dates, times, phone numbers and 'today' on the booking calendar.">
        <div className="st-grid">
          <Select id="g-currency" label="Currency" options={options.currencies} value={d.currency} onChange={(ev) => set('currency', ev.target.value)} error={e.currency} />
          <Input id="g-cc" label="Default country code" inputMode="numeric" maxLength={6} value={`+${d.countryCode}`} onChange={(ev) => set('countryCode', ev.target.value.replace(/\D/g, ''))} error={e.countryCode}
            hint="Added to phone numbers typed without one, e.g. +91 for India." />
          <Select id="g-tz" label="Timezone" options={tzOptions} value={d.timezone} onChange={(ev) => set('timezone', ev.target.value)} error={e.timezone}
            hint="Decides what 'today' means for bookings, and the booking hours." />
          <Select id="g-date" label="Date format" options={options.dateFormats} value={d.dateFormat} onChange={(ev) => set('dateFormat', ev.target.value)} error={e.dateFormat} />
          <Select id="g-time" label="Time format" options={options.timeFormats} value={d.timeFormat} onChange={(ev) => set('timeFormat', ev.target.value)} error={e.timeFormat} />
        </div>
        <p className="st-preview" aria-label="Preview">
          Preview: <strong>{formatMoney(12500, d.currency || DEFAULT_FORMAT.currency)}</strong> · <strong>{formatDateKey(SAMPLE_DATE, d.dateFormat)}</strong> · <strong>{formatTimeKey(SAMPLE_TIME, d.timeFormat)}</strong>
        </p>
      </Card>

      <SaveBar dirty={f.dirty} saving={f.saving} onSave={f.save} onReset={f.reset} status={f.status} />
    </form>
  );
}
