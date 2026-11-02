// /**
//  * npm run whatsapp:test             → checks your settings and your WhatsApp access token (sends nothing)
//  * npm run whatsapp:test -- --send   → sends ONE real test message to PHOTOGRAPHER_WHATSAPP_NUMBER
//  *                                     (uses the approved "new_message_admin" template with sample text)
//  */
// import 'dotenv/config';
// import { configStatus, getPhoneNumberInfo, normalizeInternational, sendTemplate } from '../services/whatsappService.js';
// import { TEMPLATES } from '../config/whatsappTemplates.js';

// const status = configStatus();
// console.log('\nSettings');
// console.log(`  Access token, phone number id, API version: ${status.configured ? 'all set' : 'MISSING'}`);
// console.log(`  Your WhatsApp number (PHOTOGRAPHER_WHATSAPP_NUMBER): ${status.photographerNumberSet ? 'set' : 'MISSING or invalid (needs the country code)'}`);
// console.log(`  Webhook (WHATSAPP_APP_SECRET + WHATSAPP_WEBHOOK_VERIFY_TOKEN): ${status.webhook.appSecretSet && status.webhook.verifyTokenSet ? 'set' : 'not set (delivery status and STOP replies will not be tracked)'}`);
// if (status.missing.length) console.log(`  Missing: ${status.missing.join(', ')}`);
// if (!status.configured) { console.log('\nFill in the missing values in server/.env (see docs/WHATSAPP_SETUP.md), then run this again.\n'); process.exit(1); }

// try {
//   const info = await getPhoneNumberInfo();
//   console.log(`\nConnected to WhatsApp as "${info.verified_name ?? 'unverified name'}" (${info.display_phone_number ?? 'number hidden'}), quality: ${info.quality_rating ?? 'n/a'}`);
// } catch (err) {
//   console.error(`\nCould not connect: ${err.safeMessage ?? err.message}\n`);
//   process.exit(1);
// }

// if (!process.argv.includes('--send')) {
//   console.log('\nThe connection works. To send one real test message to yourself:  npm run whatsapp:test -- --send\n');
//   process.exit(0);
// }

// const to = normalizeInternational(process.env.PHOTOGRAPHER_WHATSAPP_NUMBER);
// if (!to) { console.error('\nPHOTOGRAPHER_WHATSAPP_NUMBER is missing or invalid.\n'); process.exit(1); }

// try {
//   const t = TEMPLATES.new_message_admin;
//   const { messageId } = await sendTemplate({ to, template: 'new_message_admin', params: t.example });
//   console.log(`\nWhatsApp ACCEPTED the message (id ${messageId}). Check your phone.`);
//   console.log('"Accepted" is not "delivered": if nothing arrives within a minute, see the error list in docs/WHATSAPP_SETUP.md.\n');
// } catch (err) {
//   console.error(`\nSending failed: ${err.safeMessage ?? err.message}\n`);
//   process.exit(1);
// }






/**
 * npm run whatsapp:test
 *   Checks WhatsApp configuration and connection. Sends nothing.
 *
 * npm run whatsapp:test -- --send
 *   Sends the default new_message_admin template.
 *
 * npm run whatsapp:test -- --send --template booking_received_customer
 *   Sends the selected template to PHOTOGRAPHER_WHATSAPP_NUMBER.
 *
 * Only ONE message is sent per command.
 */

import 'dotenv/config';
import {
  configStatus,
  getPhoneNumberInfo,
  normalizeInternational,
  sendTemplate,
} from '../services/whatsappService.js';
import { TEMPLATES } from '../config/whatsappTemplates.js';

const args = process.argv.slice(2);
const shouldSend = args.includes('--send');

const templateArgIndex = args.indexOf('--template');
const templateName =
  templateArgIndex !== -1
    ? args[templateArgIndex + 1]
    : 'new_message_admin';

const status = configStatus();

console.log('\nSettings');
console.log(`  Access token, phone number id, API version: ${status.configured ? 'all set' : 'MISSING'}`);
console.log(`  WhatsApp recipient number: ${status.photographerNumberSet ? 'set' : 'MISSING or invalid'}`);
console.log(`  Webhook: ${status.webhook.appSecretSet && status.webhook.verifyTokenSet ? 'set' : 'not set (delivery status and STOP replies will not be tracked)'}`);

if (status.missing.length) {
  console.log(`  Missing: ${status.missing.join(', ')}`);
}

if (!status.configured) {
  console.log('\nFill in the missing values in server/.env and run again.\n');
  process.exit(1);
}

try {
  const info = await getPhoneNumberInfo();

  console.log(
    `\nConnected to WhatsApp as "${info.verified_name ?? 'unverified name'}" (${info.display_phone_number ?? 'number hidden'}), quality: ${info.quality_rating ?? 'n/a'}`
  );
} catch (err) {
  console.error(`\nCould not connect: ${err.safeMessage ?? err.message}\n`);
  process.exit(1);
}

if (!shouldSend) {
  console.log('\nConnection check complete. No message was sent.\n');
  process.exit(0);
}

if (!Object.hasOwn(TEMPLATES, templateName)) {
  console.error('\nInvalid template name.');
  console.log('\nAvailable templates:');
  Object.keys(TEMPLATES).forEach((name) => console.log(`  - ${name}`));
  process.exit(1);
}

const to = normalizeInternational(
  process.env.PHOTOGRAPHER_WHATSAPP_NUMBER
);

if (!to) {
  console.error('\nPHOTOGRAPHER_WHATSAPP_NUMBER is missing or invalid.\n');
  process.exit(1);
}

try {
  const template = TEMPLATES[templateName];

  console.log(`\nSending template: ${templateName}`);
  console.log(`Recipient: ${to}`);

  const { messageId } = await sendTemplate({
    to,
    template: templateName,
    params: template.example,
  });

  console.log(`\nWhatsApp ACCEPTED the message.`);
  console.log(`Template: ${templateName}`);
  console.log(`Message ID: ${messageId}`);
  console.log('\nCheck your WhatsApp. Accepted does not guarantee delivery.\n');
} catch (err) {
  console.error(
    `\nSending failed: ${err.safeMessage ?? err.message}\n`
  );
  process.exit(1);
}
