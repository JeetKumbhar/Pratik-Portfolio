import { useCallback, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CloudOff } from 'lucide-react';
import Button from '../../components/common/Button';
import ConfirmModal from '../../components/common/ConfirmModal';
import EmptyState from '../../components/common/EmptyState';
import AccountSettings from '../../components/admin/settings/AccountSettings';
import AvailabilitySettings from '../../components/admin/settings/AvailabilitySettings';
import BookingSettings from '../../components/admin/settings/BookingSettings';
import BusinessSettings from '../../components/admin/settings/BusinessSettings';
import GeneralSettings from '../../components/admin/settings/GeneralSettings';
import NotificationSettings from '../../components/admin/settings/NotificationSettings';
import SeoSettings from '../../components/admin/settings/SeoSettings';
import ServicesSettings from '../../components/admin/settings/ServicesSettings';
import WebsiteSettings from '../../components/admin/settings/WebsiteSettings';
import useAuth from '../../hooks/useAuth';
import useFetch from '../../hooks/useFetch';
import useSettings from '../../hooks/useSettings';
import useUnsavedGuard from '../../hooks/useUnsavedGuard';
import { getAllSettings } from '../../services/settingsService';
import { SECTIONS, sectionKeyOf } from '../../utils/settingsUtils';
import { cx } from '../../utils/helpers';

/**
 * Admin → Settings. Nine sections, each with its own Save button. The section is in the address (?section=booking) so refresh,
 * back and bookmarks keep your place. Unsaved changes are never lost silently: switching sections or leaving the page asks first.
 * "Saved" is shown only after the server has confirmed it.
 */
export default function Settings() {
  const { token } = useAuth();
  const { refresh } = useSettings(); // the public copy of the settings, kept in step so the whole panel follows a save
  const [params, setParams] = useSearchParams();
  const section = sectionKeyOf(params.get('section'));
  const current = SECTIONS.find((s) => s.key === section);

  const { data, loading, error, reload } = useFetch(() => getAllSettings(token), [token]);
  const [overrides, setOverrides] = useState({}); // groups saved during this visit (newer than `data`)
  const dirtyRef = useRef({});
  const [dirtyGroups, setDirtyGroups] = useState([]);
  const [pendingSection, setPendingSection] = useState(null);

  const settings = useMemo(() => (data ? { ...data.data, ...overrides } : null), [data, overrides]);
  const options = data?.options;
  const dirty = dirtyGroups.length > 0;

  const report = useCallback((group, isDirty) => {
    if (!!dirtyRef.current[group] === isDirty) return;
    dirtyRef.current = { ...dirtyRef.current, [group]: isDirty };
    setDirtyGroups(Object.keys(dirtyRef.current).filter((k) => dirtyRef.current[k]));
  }, []);

  const onSaved = useCallback((group, saved) => {
    setOverrides((o) => ({ ...o, [group]: saved }));
    refresh();
  }, [refresh]);

  const blocker = useUnsavedGuard(dirty);

  const go = (key) => setParams({ section: key }, { replace: true });
  const choose = (key) => {
    if (key === section) return;
    if (dirty) setPendingSection(key); else go(key);
  };

  let body = null;
  if (settings && options) {
    const common = { token, onSaved, report, options };
    body = {
      general: <GeneralSettings key="general" saved={settings.general} {...common} />,
      business: <BusinessSettings key="business" saved={settings.business} {...common} />,
      booking: <BookingSettings key="booking" saved={settings.booking} savedNotifications={settings.notifications} {...common} />,
      services: <ServicesSettings key="services" token={token} imageEnabled={options.imageStorageConfigured} onChanged={refresh} />,
      availability: <AvailabilitySettings key="availability" saved={settings.availability} general={settings.general} {...common} />,
      notifications: <NotificationSettings key="notifications" saved={settings.notifications} {...common} />,
      website: <WebsiteSettings key="website" saved={settings.website} {...common} />,
      seo: <SeoSettings key="seo" saved={settings.seo} siteName={settings.general.websiteName} {...common} />,
      account: <AccountSettings key="account" token={token} />,
    }[section];
  }

  return (
    <div className="st">
      <p className="st__lead">Everything about how your website and bookings work. Each section is saved on its own.</p>

      {error && !data && (
        <EmptyState icon={<CloudOff size={32} />} title="Couldn't load the settings" message={error} action={<Button onClick={reload}>Try again</Button>} />
      )}
      {loading && !data && <div className="st__loading skeleton" aria-busy="true" aria-label="Loading settings" />}

      {settings && options && (
        <div className="st__layout">
          <nav className="st-nav" aria-label="Settings sections">
            <ul>
              {SECTIONS.map((s) => (
                <li key={s.key}>
                  <button type="button" className={cx('st-nav__item', s.key === section && 'is-active')} aria-current={s.key === section ? 'page' : undefined} onClick={() => choose(s.key)}>
                    {s.label}
                    {s.key === section && dirty && <span className="st-nav__dot" title="Unsaved changes" />}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <section className="st__panel" aria-labelledby="st-title">
            <header className="st__head">
              <h2 id="st-title" className="st__title">{current.label}</h2>
              <p className="st__blurb">{current.blurb}</p>
            </header>
            {body}
          </section>
        </div>
      )}

      <ConfirmModal isOpen={pendingSection !== null} onClose={() => setPendingSection(null)}
        onConfirm={() => { const next = pendingSection; setPendingSection(null); go(next); }}
        title="Discard unsaved changes?" message={`You changed something in ${current.label} that is not saved yet. If you move to another section, those changes are lost.`} confirmText="Discard and continue" cancelText="Keep editing" danger />

      <ConfirmModal isOpen={blocker.state === 'blocked'} onClose={() => blocker.reset?.()} onConfirm={() => blocker.proceed?.()}
        title="Leave without saving?" message="You have unsaved changes in Settings. If you leave this page they are lost." confirmText="Leave page" cancelText="Stay here" danger />
    </div>
  );
}
