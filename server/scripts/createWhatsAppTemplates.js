
import 'dotenv/config';
import { TEMPLATES } from '../config/whatsappTemplates.js';

const {
  WHATSAPP_ACCESS_TOKEN,
  WHATSAPP_BUSINESS_ACCOUNT_ID,
  WHATSAPP_API_VERSION,
  WHATSAPP_TEMPLATE_LANGUAGE = 'en',
} = process.env;

const required = {
  WHATSAPP_ACCESS_TOKEN,
  WHATSAPP_BUSINESS_ACCOUNT_ID,
  WHATSAPP_API_VERSION,
};

for (const [key, value] of Object.entries(required)) {
  if (!value) {
    console.error(`Missing environment variable: ${key}`);
    process.exit(1);
  }
}

if (!/^v\d+\.\d+$/.test(WHATSAPP_API_VERSION)) {
  console.error('Invalid WHATSAPP_API_VERSION format.');
  process.exit(1);
}

const baseUrl = `https://graph.facebook.com/${WHATSAPP_API_VERSION}`;
const headers = {
  Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
  'Content-Type': 'application/json',
};

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...headers, ...options.headers },
  });

  const data = await response.json();

  if (!response.ok) {
    const error = new Error(
      data.error?.message || `Meta API error: ${response.status}`
    );
    error.code = data.error?.code;
    error.status = response.status;
    throw error;
  }

  return data;
}

async function getExistingTemplates() {
  const url = new URL(
    `${baseUrl}/${WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates`
  );

  url.searchParams.set('fields', 'name,status,language');
  url.searchParams.set('limit', '100');

  const result = await apiRequest(url.toString());

  if (result.paging?.next) {
    console.warn(
      'Warning: More than 100 templates may exist. Only the first 100 were checked.'
    );
  }

  return result.data || [];
}

async function createTemplate(name, template) {
  const payload = {
    name,
    language: WHATSAPP_TEMPLATE_LANGUAGE,
    category: template.category,
    components: [
      {
        type: 'BODY',
        text: template.body,
        example: {
          body_text: [template.example],
        },
      },
    ],
  };

  return apiRequest(
    `${baseUrl}/${WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

async function main() {
  console.log('\nChecking existing WhatsApp templates...');

  const existing = await getExistingTemplates();

  console.log(`Found ${existing.length} templates in Meta.\n`);

  for (const [name, template] of Object.entries(TEMPLATES)) {
    const match = existing.find(
      (item) =>
        item.name === name &&
        item.language === WHATSAPP_TEMPLATE_LANGUAGE
    );

    if (match) {
      console.log(
        `[SKIPPED] ${name} already exists. Status: ${match.status}`
      );
      continue;
    }

    try {
      const result = await createTemplate(name, template);

      console.log(`[SUBMITTED] ${name}`);
      console.log(`  Meta ID: ${result.id}`);
      console.log(`  Status: ${result.status}`);
      console.log(`  Category: ${result.category}`);
    } catch (error) {
      console.error(`[FAILED] ${name}`);
      console.error(`  ${error.message}`);
      if (error.code) console.error(`  Meta error code: ${error.code}`);
    }

    console.log('');
  }

  console.log('Template submission process finished.');
  console.log('Submission does not mean approval.');
  console.log('Check each template status in WhatsApp Manager.\n');
}

main().catch((error) => {
  console.error('\nTemplate process failed:', error.message);
  process.exitCode = 1;
});
