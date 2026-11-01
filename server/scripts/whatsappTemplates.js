/**
 * npm run whatsapp:templates
 * Prints the five message templates exactly as they must be created in Meta's WhatsApp Manager
 * (Message templates → Create template). They must be APPROVED before the website can send them.
 */
import 'dotenv/config';
import { TEMPLATES, EVENT_LABELS } from '../config/whatsappTemplates.js';

const language = process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en';
console.log(`\nCreate these ${Object.keys(TEMPLATES).length} templates. For each: Category = Utility, Language = "${language}" (must match WHATSAPP_TEMPLATE_LANGUAGE), no header, no footer, no buttons.`);
console.log('The NAME must be copied exactly. Paste the body as it is, then fill in the example for each {{number}} when Meta asks.\n');

for (const [name, t] of Object.entries(TEMPLATES)) {
  console.log('='.repeat(72));
  console.log(`${EVENT_LABELS[name]}`);
  console.log(`Name:     ${name}`);
  console.log(`Category: ${t.category}      Language: ${language}`);
  console.log('Body:');
  console.log(t.body.split('\n').map((line) => `  | ${line}`).join('\n'));
  console.log('Examples (Meta asks for one per {{number}}):');
  t.example.forEach((value, i) => console.log(`  {{${i + 1}}} = ${value}`));
  console.log();
}
console.log('After they are approved (status "Active"), run:  npm run whatsapp:test\n');
