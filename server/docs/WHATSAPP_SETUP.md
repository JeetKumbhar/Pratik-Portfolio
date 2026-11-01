# WhatsApp notifications: setup guide

The website sends five WhatsApp messages through the official **WhatsApp Business Platform (Cloud API)**:

| Event | Goes to | Needs |
|---|---|---|
| Booking received | customer | customer ticked "Send my booking updates on WhatsApp" |
| New booking | you | your number in `.env` |
| Booking confirmed | customer | opt-in |
| Booking cancelled | customer | opt-in |
| New contact message | you | your number in `.env` |

Bookings and messages are saved first. If WhatsApp is down, misconfigured or rejects a message, the booking still works,
and the failure shows up in **Admin > Notifications** with a Retry button.

Menu names in Meta's dashboards change from time to time. If a step below does not match what you see, look for the closest wording.


## 1. Create the Meta app
1. Go to developers.facebook.com, log in, **Create app**, choose the **Business** type.
2. Add the **WhatsApp** product to the app. Meta creates a WhatsApp Business Account (WABA) for you.
3. Open **WhatsApp > API Setup**. You will see a free **test phone number**, its **Phone number ID**, your **WhatsApp Business Account ID**, and a temporary access token (valid about 24 hours).

## 2. Try it with the test number (no business verification needed)
1. In API Setup, under **To**, add **your own WhatsApp number** as a recipient and confirm the code sent to it. In test mode you can only message numbers added here.
2. Put these in `server/.env`:
   ```
   WHATSAPP_ACCESS_TOKEN=<the temporary token>
   WHATSAPP_PHONE_NUMBER_ID=<Phone number ID>
   WHATSAPP_BUSINESS_ACCOUNT_ID=<WhatsApp Business Account ID>
   WHATSAPP_API_VERSION=v25.0
   PHOTOGRAPHER_WHATSAPP_NUMBER=<your number with country code, digits only, e.g. 919876543210>
   ```
   `WHATSAPP_API_VERSION`: use a version Meta currently supports (Meta's Graph API changelog lists the newest; v25.0 and v26.0 were current when this was written). Meta retires old versions, so check the changelog when you set up and again every year or so.
3. Create the templates (step 3) and wait for approval.
4. `npm run whatsapp:test` checks the connection. `npm run whatsapp:test -- --send` sends one real message to your number.

## 3. Message templates (required)
WhatsApp only lets a business start a conversation with an **approved template**. Run:

```
npm run whatsapp:templates
```

It prints the five templates. In **WhatsApp Manager > Message templates > Create template** create each one with:
- **Category:** Utility  - **Language:** English (must match `WHATSAPP_TEMPLATE_LANGUAGE`, default `en`)
- **Name:** copied exactly (for example `booking_confirmed_customer`)
- **Body:** pasted exactly, with the sample values it prints for each `{{number}}`
- no header, no footer, no buttons

Approval usually takes minutes to a few hours. If you edit a message in `server/config/whatsappTemplates.js`, create and approve the matching template again.

## 4. Production
1. Add and verify your real business phone number in WhatsApp Manager. It generally cannot be a number already used in the normal WhatsApp app unless you migrate it.
2. In **Meta Business Settings > Users > System users**, create a system user, give it the app and the WhatsApp account, and generate a **permanent token** with the `whatsapp_business_messaging` and `whatsapp_business_management` permissions. Use that as `WHATSAPP_ACCESS_TOKEN`. The temporary token expires.
3. Set all variables in your hosting provider's environment settings. Never commit them to Git, and never put them in React code.
4. Business-initiated messages are billed per message by Meta (the price depends on the country and category). Check Meta's current pricing page.

## 5. Webhook (delivery status and STOP replies)
Without it, messages show **Sent** (WhatsApp accepted them) but never **Delivered** or **Read**, and customers' STOP replies are not recorded.
1. In `.env` set `WHATSAPP_APP_SECRET` (App settings > Basic > App secret) and `WHATSAPP_WEBHOOK_VERIFY_TOKEN` (any long random text you make up).
2. In **WhatsApp > Configuration > Webhook**, set the callback URL to `https://YOUR-DOMAIN/api/webhooks/whatsapp` and the same verify token, then subscribe to the **messages** field.
3. Locally you need a public HTTPS address (a tunnel such as ngrok or cloudflared) pointing at your server.

Every webhook call is checked against Meta's signature; unsigned or wrongly signed calls are ignored.

## 6. Customer consent
- The booking form has an **unticked** box: "Send my booking updates on WhatsApp". Customers get WhatsApp messages only if they tick it.
- A customer who replies **STOP** is never messaged again (they can reply **START** to resume). This needs the webhook above.
- Customers should enter their phone **with the country code** (+1, +44, +91 ...). Numbers without it are not messaged, because guessing could reach a stranger. Optionally set `WHATSAPP_DEFAULT_COUNTRY_CODE` so 7-10 digit local numbers work.
- Messages contain only what is needed (booking id, shoot type, date, package).

## 7. Admin > Notifications
Shows every attempt: **Sent** = WhatsApp accepted it, **Delivered** = it reached the phone, **Read**, **Failed** (with the reason) or **Skipped**. Failed ones have a **Retry** button.
Each event is sent once per booking; confirming, cancelling and reopening the same booking will not send duplicates.

## Troubleshooting
| What you see | Meaning |
|---|---|
| access token invalid or expired | Make a new token (the 24-hour one expires). |
| not on the allowed recipient list | In test mode, add the number under API Setup > To. |
| template does not exist / not approved | Check the template name and language, and that its status is Active. |
| parameters do not match | The template in Meta differs from `whatsappTemplates.js`. Recreate it from `npm run whatsapp:templates`. |
| could not deliver (131026) | That number is not on WhatsApp, or it blocked business messages. |
| payment problem | Add a payment method in WhatsApp Manager. |
