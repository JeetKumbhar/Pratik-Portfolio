import Input from '../../common/Input';
import Textarea from '../../common/Textarea';
import useSettingsForm from '../../../hooks/useSettingsForm';
import { Card, ImageField, SaveBar } from './ui';

/** Settings → SEO & Social: what search engines and link previews show for the site as a whole. */
export default function SeoSettings({ saved, options, token, onSaved, report, siteName }) {
  const f = useSettingsForm({ group: 'seo', saved, token, onSaved, report });
  const { draft: d, errors: e, set } = f;
  const title = d.title || siteName;
  const shareTitle = d.shareTitle || title;
  const shareText = d.shareDescription || d.description;

  return (
    <form className="st-form" onSubmit={(ev) => { ev.preventDefault(); f.save(); }} noValidate>
      <Card title="Search engines" description="The default title and description of your website in Google. Pages that set their own are left alone.">
        <Input id="s-title" label="SEO title" maxLength={70} value={d.title} onChange={(ev) => set('title', ev.target.value)} error={e.title} hint={`${d.title.length}/70 · around 50–60 characters works best.`} />
        <Textarea id="s-desc" label="Meta description" maxLength={200} rows={3} value={d.description} onChange={(ev) => set('description', ev.target.value)} error={e.description}
          hint="One or two sentences about what you offer and where." />
        <Input id="s-keys" label="Keywords" maxLength={200} value={d.keywords} onChange={(ev) => set('keywords', ev.target.value)} error={e.keywords} hint="Separated by commas. Search engines give these little weight today." />
        <Input id="s-canon" label="Canonical website address" value={d.canonicalUrl} onChange={(ev) => set('canonicalUrl', ev.target.value)} error={e.canonicalUrl}
          placeholder="https://www.yourwebsite.com" hint="Your main address, so search engines know which version to list. Leave empty if unsure." />
        <div className="st-serp" aria-label="Search result preview">
          <p className="st-serp__url">{d.canonicalUrl || 'www.yourwebsite.com'}</p>
          <p className="st-serp__title">{title}</p>
          <p className="st-serp__desc">{d.description || 'No description yet. Search engines will pick text from your pages.'}</p>
        </div>
      </Card>

      <Card title="When your link is shared" description="How the site looks in WhatsApp, Facebook, Instagram messages and similar.">
        <Input id="s-st" label="Sharing title" maxLength={70} value={d.shareTitle} onChange={(ev) => set('shareTitle', ev.target.value)} error={e.shareTitle} hint="Leave empty to use the SEO title." />
        <Textarea id="s-sd" label="Sharing description" maxLength={200} rows={3} value={d.shareDescription} onChange={(ev) => set('shareDescription', ev.target.value)} error={e.shareDescription} hint="Leave empty to use the meta description." />
        <ImageField label="Sharing image" wide value={d.ogImage} onChange={(v) => set('ogImage', v)} error={e.ogImage} token={token} enabled={options.imageStorageConfigured}
          hint="A landscape photo around 1200 × 630 pixels. JPG, PNG or WebP up to 5 MB." />
        <div className="st-share" aria-label="Sharing preview">
          {d.ogImage?.url ? <img src={d.ogImage.url} alt="" /> : <div className="st-share__empty">No image</div>}
          <div><p className="st-share__title">{shareTitle}</p><p className="st-share__desc">{shareText || ' '}</p></div>
        </div>
      </Card>

      <SaveBar dirty={f.dirty} saving={f.saving} onSave={f.save} onReset={f.reset} status={f.status} />
    </form>
  );
}
