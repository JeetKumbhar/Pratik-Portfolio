import { SETTINGS_GROUPS } from '../config/constants.js';
import { buildDefaults, mergeStored, normalizeGroup, isNotificationEnabled } from './settingsSchema.js';
import { setRuntimeConfig } from './runtimeConfig.js';

/**
 * Reading and saving the settings document.
 *
 *   getSettings()              every group, always complete (defaults fill whatever was never saved). Cached for a few seconds
 *                              so a busy booking page does not read the database for every request; saving clears the cache.
 *   updateGroup(group, body)   validates (utils/settingsSchema.js), then writes ONLY that group, so two admins saving
 *                              different sections can never overwrite each other.
 *
 * createSettingsStore() takes the Mongoose model as a function so the logic can be tested without a database.
 */
export function createSettingsStore(getModel, { ttlMs = 5000, now = () => Date.now() } = {}) {
  let cache = null;
  let cachedAt = 0;
  let generation = 0; // bumped on every save: a read that started before a save must not refill the cache with the old values

  const publish = (settings) => {
    setRuntimeConfig({ countryCode: settings.general.countryCode, timezone: settings.general.timezone });
    return settings;
  };

  async function load() {
    const Setting = await getModel();
    const doc = await Setting.findOne({ key: 'site' }).lean();
    return publish(mergeStored(doc));
  }

  async function getSettings({ fresh = false } = {}) {
    if (!fresh && cache && now() - cachedAt < ttlMs) return cache;
    const startedAt = generation;
    try {
      const loaded = await load();
      if (startedAt !== generation) return loaded; // a save happened while this was loading: use it once, but do not keep it
      cache = loaded;
      cachedAt = now();
    } catch (err) {
      if (cache) return cache; // the database hiccuped: keep serving the last good settings
      throw err;
    }
    return cache;
  }

  async function updateGroup(group, input, { adminId } = {}) {
    if (!SETTINGS_GROUPS.includes(group)) throw Object.assign(new Error('Unknown settings group'), { statusCode: 404 });
    const Setting = await getModel();
    const current = await getSettings({ fresh: true });
    const next = normalizeGroup(group, input, current[group]);

    const write = () => Setting.findOneAndUpdate(
      { key: 'site' },
      { $set: { [group]: next, ...(adminId && { updatedBy: adminId }) }, $setOnInsert: { key: 'site' } },
      { upsert: true, new: true }
    );
    try {
      await write();
    } catch (err) {
      if (err?.code !== 11000) throw err;
      await write(); // two first-ever saves raced to create the document: the second one now just updates it
    }
    cache = null;
    generation += 1;
    const fresh = await getSettings({ fresh: true });
    return { settings: fresh, previous: current[group] };
  }

  const invalidate = () => { cache = null; generation += 1; };
  const isEventEnabled = async (event) => isNotificationEnabled(await getSettings(), event);

  return { getSettings, updateGroup, invalidate, isEventEnabled, defaults: buildDefaults };
}

// ---------------------------------------------------------------------- the real thing
const store = createSettingsStore(async () => (await import('../models/index.js')).Setting);

export const { getSettings, updateGroup, invalidate, isEventEnabled } = store;
