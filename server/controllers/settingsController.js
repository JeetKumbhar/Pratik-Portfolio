import bcrypt from 'bcryptjs';
import { Booking, Notification, User } from '../models/index.js';
import asyncHandler from '../utils/asyncHandler.js';
import { httpError } from '../utils/httpError.js';
import { ACTIVE_BOOKING_STATUSES, BOOKING_STATUSES, BOOKING_STATUS_FLOW, SETTINGS_GROUPS, WEEKDAYS } from '../config/constants.js';
import { getSettings, updateGroup } from '../utils/settings.js';
import { LIMITS, NOTIFICATION_EVENT_KEYS, OPTIONS, scrubPublic, toPublic } from '../utils/settingsSchema.js';
import { openHoursFor } from '../utils/schedule.js';
import { addDays, isEmail, todayKey } from '../utils/validators.js';
import { createUploadSignature, deleteImage, isConfigured as storageConfigured } from '../utils/imageStorage.js';
import { isImageInUse } from '../utils/imageUsage.js';
import { signToken } from '../utils/token.js';
import { EVENT_LABELS, TEMPLATES } from '../config/whatsappTemplates.js';
import * as whatsapp from '../services/whatsappService.js';

/**
 * Admin → Settings.
 *   PUBLIC  GET /api/settings/public         only what the website needs (no notification choices, no schedule, no admin data)
 *   ADMIN   everything else, behind protect + adminOnly (see routes/settingsRoutes.js)
 * Secrets (WhatsApp token, database, JWT) are never part of any response here: they live in the server's .env.
 */
const fieldError = (field, message, status = 400) => Object.assign(httpError(status, message), { fieldErrors: { [field]: message } });

// ---------------------------------------------------------------- public
// GET /api/settings/public
export const getPublicSettings = asyncHandler(async (req, res) => {
  const settings = await getSettings();
  res.set('Cache-Control', 'public, max-age=30');
  res.json({ success: true, data: scrubPublic(toPublic(settings)) });
});

// ---------------------------------------------------------------- admin: read
// GET /api/settings → every group + the choices the screen needs for its dropdowns
export const getAllSettings = asyncHandler(async (req, res) => {
  const settings = await getSettings({ fresh: true });
  res.json({
    success: true,
    data: settings,
    options: {
      ...OPTIONS,
      limits: LIMITS,
      weekdays: WEEKDAYS,
      notificationEvents: NOTIFICATION_EVENT_KEYS.map((key) => ({ key, label: EVENT_LABELS[key] })),
      bookingStatuses: BOOKING_STATUSES,
      bookingStatusFlow: BOOKING_STATUS_FLOW,
      imageStorageConfigured: storageConfigured(),
    },
  });
});

// GET /api/settings/:group
export const getSettingsGroup = asyncHandler(async (req, res) => {
  const { group } = req.params;
  if (!SETTINGS_GROUPS.includes(group)) throw httpError(404, 'Unknown settings group');
  const settings = await getSettings({ fresh: true });
  res.json({ success: true, data: settings[group] });
});

// ---------------------------------------------------------------- admin: write
const IMAGE_FIELDS = { general: ['logo', 'favicon'], seo: ['ogImage'] };

/** Upcoming active bookings that fall outside the working hours the admin just saved (informational: nothing is changed or cancelled) */
async function bookingsOutsideHours(settings) {
  const today = todayKey();
  const upcoming = await Booking.find({ date: { $gte: today, $lte: addDays(today, 730) }, status: { $in: ACTIVE_BOOKING_STATUSES } })
    .select('bookingId name date time package.durationHours').sort({ date: 1, time: 1 }).limit(500).lean();
  return upcoming.filter((b) => {
    const open = openHoursFor(b.date, settings.availability);
    const hours = b.package?.durationHours ?? 1;
    const start = Number(b.time.slice(0, 2));
    return Array.from({ length: hours }, (_, i) => `${String(start + i).padStart(2, '0')}:00`).some((h) => !open.has(h));
  }).map((b) => ({ reference: b.bookingId, name: b.name, date: b.date, time: b.time }));
}

// PATCH /api/settings/:group   body: any fields of that group (see utils/settingsSchema.js)
export const updateSettingsGroup = asyncHandler(async (req, res) => {
  const { group } = req.params;
  if (!SETTINGS_GROUPS.includes(group)) throw httpError(404, 'Unknown settings group');

  const { settings, previous } = await updateGroup(group, req.body, { adminId: req.user._id });
  const saved = settings[group];

  // A replaced or removed image is deleted from storage (best effort: a leftover file is harmless, a failed save is not)
  for (const field of IMAGE_FIELDS[group] ?? []) {
    const old = previous?.[field]?.publicId;
    if (old && old !== saved[field]?.publicId && !(await isImageInUse(old))) {
      try { await deleteImage(old); } catch (err) { console.error(`[settings] could not remove the old ${field}: ${err.message}`); }
    }
  }

  const extra = {};
  if (group === 'availability') {
    const outside = await bookingsOutsideHours(settings);
    if (outside.length) extra.warnings = { bookingsOutsideHours: { count: outside.length, examples: outside.slice(0, 10) } };
  }
  res.json({ success: true, message: 'Settings saved', data: saved, ...extra });
});

// GET /api/settings/upload-signature → permission for ONE direct-to-Cloudinary upload (logo, favicon, sharing image, service cover)
export const getBrandingUploadSignature = asyncHandler(async (req, res) => {
  if (!storageConfigured()) throw httpError(503, 'Image storage is not set up on the server.');
  res.json({ success: true, data: createUploadSignature(Date.now(), 'branding') });
});

// ---------------------------------------------------------------- WhatsApp
const SUCCESS_STATUSES = ['sent', 'delivered', 'read'];

const purpose = {
  new_booking_admin: 'Tells you when a customer sends a booking request.',
  booking_received_customer: 'Confirms to the customer that their request arrived (only if they opted in).',
  booking_confirmed_customer: 'Tells the customer their booking is confirmed (only if they opted in).',
  booking_cancelled_customer: 'Tells the customer their booking was cancelled (only if they opted in).',
  new_message_admin: 'Tells you when someone sends the website contact form.',
};

const templateInfo = (statuses) => Object.entries(TEMPLATES).map(([event, t]) => {
  const match = statuses?.filter((s) => s.name === event) ?? [];
  const approved = match.some((s) => s.status === 'APPROVED');
  return {
    event,
    label: EVENT_LABELS[event],
    purpose: purpose[event] ?? '',
    template: event, // the template's name at Meta equals the event name
    category: t.category,
    recipient: t.recipient,
    // only Meta's own answer counts: null = not checked, never "approved because it exists here"
    approval: statuses ? (approved ? 'APPROVED' : match[0]?.status ?? 'NOT_FOUND') : null,
  };
});

// GET /api/settings/whatsapp/status[?live=1]
// No secrets, ever: only names, statuses and messages that are already free of tokens. live=1 also asks Meta (slower).
export const getWhatsAppStatus = asyncHandler(async (req, res) => {
  const cfg = whatsapp.configStatus();
  const [lastSuccess, lastFailure] = await Promise.all([
    Notification.findOne({ status: { $in: SUCCESS_STATUSES } }).sort({ sentAt: -1 }).select('sentAt event').lean(),
    Notification.findOne({ status: 'failed' }).sort({ updatedAt: -1 }).select('lastError event updatedAt').lean(),
  ]);

  const out = {
    configured: cfg.configured,
    missing: cfg.missing, // names of missing .env settings, never values
    photographerNumberSet: cfg.photographerNumberSet,
    webhook: cfg.webhook,
    lastSuccessAt: lastSuccess?.sentAt ?? null,
    lastError: lastFailure ? { message: lastFailure.lastError, at: lastFailure.updatedAt, event: lastFailure.event } : null,
    connection: { state: cfg.configured ? 'unchecked' : 'disconnected' }, // connected | disconnected | error | unchecked
    templates: templateInfo(null),
    templateCheck: { state: 'unchecked' },
  };

  if (req.query.live === '1' && cfg.configured) {
    try {
      const info = await whatsapp.getPhoneNumberInfo();
      out.connection = { state: 'connected', displayPhoneNumber: info.display_phone_number ?? '', verifiedName: info.verified_name ?? '', quality: info.quality_rating ?? '' };
    } catch (err) {
      out.connection = { state: 'error', message: err?.safeMessage ?? 'Could not check the WhatsApp connection.' };
    }
    try {
      out.templates = templateInfo(await whatsapp.listTemplateStatuses());
      out.templateCheck = { state: 'checked' };
    } catch (err) {
      out.templateCheck = { state: 'error', message: err?.safeMessage ?? 'Could not check the templates.' };
    }
  }
  res.json({ success: true, data: out });
});

// POST /api/settings/whatsapp/test   { confirm: true }
// Sends the "new contact message" template, filled with SAMPLE text, to the photographer's own number from .env (never to a number
// typed into this request). Nothing is stored. Needs confirm:true so it cannot be triggered by accident.
export const sendWhatsAppTest = asyncHandler(async (req, res) => {
  if (req.body?.confirm !== true) throw httpError(400, 'Please confirm that you want to send a test message.');
  if (!whatsapp.isConfigured()) throw httpError(503, 'WhatsApp is not configured on the server.');
  const to = whatsapp.normalizeInternational(process.env.PHOTOGRAPHER_WHATSAPP_NUMBER);
  if (!to) throw httpError(503, 'PHOTOGRAPHER_WHATSAPP_NUMBER is missing or invalid on the server.');

  const template = TEMPLATES.new_message_admin;
  try {
    await whatsapp.sendTemplate({ to, template: 'new_message_admin', params: template.example });
  } catch (err) {
    throw httpError(502, err?.safeMessage ?? 'The test message could not be sent.');
  }
  res.json({ success: true, message: `Test message sent to ****${to.slice(-4)}. It contains sample text.` });
});

// ---------------------------------------------------------------- account & security
const passwordBytes = (s) => Buffer.byteLength(s, 'utf8');

async function verifyCurrentPassword(req, supplied) {
  if (typeof supplied !== 'string' || !supplied) throw fieldError('currentPassword', 'Enter your current password.');
  const user = await User.findById(req.user._id).select('+password');
  if (!user || !(await bcrypt.compare(supplied, user.password))) {
    // 400, not 401: a wrong password here must not look like an expired login to the admin screen
    throw fieldError('currentPassword', 'Your current password is incorrect.');
  }
  return user;
}

// GET /api/settings/account
export const getAccount = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: {
      name: req.user.name,
      email: req.user.email,
      session: {
        signedInAt: req.tokenInfo?.issuedAt ? new Date(req.tokenInfo.issuedAt * 1000).toISOString() : null,
        expiresAt: req.tokenInfo?.expiresAt ? new Date(req.tokenInfo.expiresAt * 1000).toISOString() : null,
      },
      features: {
        changeEmail: true,
        changePassword: true,
        logoutEverywhere: true,
        // Login tokens are stateless, so the server keeps no list of devices. It can end ALL sessions at once, but cannot list them.
        listSessions: false,
      },
    },
  });
});

// PATCH /api/settings/account/email   { currentPassword, email }
export const changeEmail = asyncHandler(async (req, res) => {
  const user = await verifyCurrentPassword(req, req.body?.currentPassword);
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!isEmail(email)) throw fieldError('email', 'Enter a valid email address.');
  if (email === user.email) throw fieldError('email', 'That is already your email address.');
  try {
    user.email = email;
    await user.save();
  } catch (err) {
    if (err?.code === 11000) throw fieldError('email', 'That email address is already in use.', 409);
    throw err;
  }
  res.json({ success: true, message: 'Email updated', data: { name: user.name, email: user.email } });
});

/** Counts up in ONE database step, so two sessions doing this at the same moment each get their own number. */
async function bumpTokenVersion(userId) {
  const updated = await User.findOneAndUpdate({ _id: userId }, { $inc: { tokenVersion: 1 } }, { new: true }).select('tokenVersion').lean();
  return updated?.tokenVersion ?? 1;
}

// PATCH /api/settings/account/password   { currentPassword, newPassword, confirmPassword }
// Every other session is signed out; this one gets a fresh token so the admin stays logged in.
export const changePassword = asyncHandler(async (req, res) => {
  const user = await verifyCurrentPassword(req, req.body?.currentPassword);
  const { newPassword, confirmPassword } = req.body ?? {};
  if (typeof newPassword !== 'string' || newPassword.length < 8) throw fieldError('newPassword', 'The new password must be at least 8 characters.');
  if (passwordBytes(newPassword) > 72) throw fieldError('newPassword', 'The new password is too long (72 characters at most).'); // bcrypt ignores everything past 72 bytes
  if (newPassword !== confirmPassword) throw fieldError('confirmPassword', 'The two new passwords do not match.');
  if (await bcrypt.compare(newPassword, user.password)) throw fieldError('newPassword', 'Choose a password you have not used before.');

  user.password = newPassword; // hashed by the model's save hook, like at account creation
  await user.save();
  const version = await bumpTokenVersion(user._id);
  res.json({ success: true, message: 'Password changed. All other sessions were signed out.', token: signToken(user._id, version) });
});

// POST /api/settings/account/logout-all   { currentPassword }
export const logoutEverywhere = asyncHandler(async (req, res) => {
  const user = await verifyCurrentPassword(req, req.body?.currentPassword);
  const version = await bumpTokenVersion(user._id);
  res.json({ success: true, message: 'Signed out everywhere else. You stay signed in on this device.', token: signToken(user._id, version) });
});
