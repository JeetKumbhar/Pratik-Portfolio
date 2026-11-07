import { Service, Setting } from '../models/index.js';

/**
 * Is this stored image still the logo, favicon, sharing image or a service cover? Used before deleting a replaced image from
 * storage, so one picture shared by two places is never removed while the other still shows it.
 */
export async function isImageInUse(publicId) {
  if (!publicId) return false;
  const [services, settings] = await Promise.all([
    Service.countDocuments({ 'coverImage.publicId': publicId }),
    Setting.countDocuments({ $or: [{ 'general.logo.publicId': publicId }, { 'general.favicon.publicId': publicId }, { 'seo.ogImage.publicId': publicId }] }),
  ]);
  return services + settings > 0;
}
