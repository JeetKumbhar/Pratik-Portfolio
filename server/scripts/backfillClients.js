/**
 * npm run backfill:clients              → DRY RUN: reads everything, writes NOTHING, prints a report
 * npm run backfill:clients -- --apply   → creates the missing clients and links old bookings / WhatsApp conversations to them
 *
 * Run it once after deploying the Clients section (existing bookings and conversations were made before clients existed).
 * Safe to run again at any time: it only ever fills in records that have no client yet, never moves a record that already
 * has one, never deletes anything and never merges two clients. It is also safe while the website is live (one client per
 * phone number is enforced by a unique index, so a booking arriving at the same moment cannot create a duplicate).
 *
 * The report lists what needs a human decision (see utils/clientBackfill.js): numbers it could not place, one number used by
 * different names, and DIFFERENT numbers that look like the same person. Those are reported, never merged.
 * Reads MONGO_URI from .env. Prints booking references (AM-XXXXXX) but no names, emails or phone numbers.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import { Booking, Client, WhatsAppConversation } from '../models/index.js';
import { clientFromGroup, planBackfill } from '../utils/clientBackfill.js';
import { createClients } from '../utils/clients.js';

const apply = process.argv.includes('--apply');
const line = (text = '') => process.stdout.write(`${text}\n`);
const mask = (phone) => `${String(phone).slice(0, 2)}${'*'.repeat(Math.max(0, String(phone).length - 5))}${String(phone).slice(-3)}`; // 91*******210

try {
  await connectDB();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init())); // the unique + lookup indexes must exist before we write

  const [bookings, conversations, clients] = await Promise.all([
    Booking.find({}).select('bookingId name email phone createdAt clientId').lean(),
    WhatsAppConversation.find({}).select('phone name createdAt clientId').lean(),
    Client.find({}).select('normalizedPhone').lean(),
  ]);

  const { groups, report } = planBackfill({ bookings, conversations, clients });

  line(`\nClients backfill (${apply ? 'APPLY' : 'DRY RUN'})`);
  line('-----------------------------------');
  line(`Bookings:       ${report.bookingsTotal} total, ${report.bookingsAlreadyLinked} already linked, ${report.bookingsToLink} to link`);
  line(`Conversations:  ${report.conversationsTotal} total, ${report.conversationsAlreadyLinked} already linked, ${report.conversationsToLink} to link`);
  line(`Clients:        ${report.clientsExisting} exist, ${report.clientsToCreate} would be created`);

  if (report.unlinkable.length) {
    line(`\nNEEDS REVIEW: ${report.unlinkable.length} booking(s) have a phone number that cannot be placed. They stay unlinked:`);
    report.unlinkable.forEach((u) => line(`  ${u.bookingId}  ${u.reason}`));
  }
  if (report.possibleDuplicates.length) {
    line(`\nNEEDS REVIEW: ${report.possibleDuplicates.length} group(s) of DIFFERENT numbers share the same last 10 digits (maybe one person, another country code). NOT merged:`);
    report.possibleDuplicates.forEach((d) => line(`  ${d.phones.map(mask).join('  vs  ')}`));
  }
  if (report.sharedPhoneNames.length) {
    line(`\nFOR INFORMATION: ${report.sharedPhoneNames.length} number(s) are used with more than one name. They become ONE client (one client per number); rename it if needed:`);
    report.sharedPhoneNames.forEach((s) => line(`  ${mask(s.phone)}  used with ${s.names.length} different names`));
  }
  if (report.formatVariants.length) {
    line(`\nFOR INFORMATION: ${report.formatVariants.length} number(s) were typed in more than one format. They become ONE client each:`);
    report.formatVariants.forEach((f) => line(`  ${mask(f.phone)}  written ${f.variants.length} ways`));
  }

  if (!apply) {
    line('\nDRY RUN: nothing was written. Re-run with --apply to create the clients and link the records.');
  } else {
    const service = createClients(async () => ({ models: mongoose.models }));
    let created = 0;
    let linkedBookings = 0;
    let linkedConversations = 0;

    for (const group of groups) {
      const input = clientFromGroup(group);
      const { client, created: wasCreated } = await service.findOrCreateClient(input);
      if (wasCreated) created += 1;
      else await service.improveClient(client, { name: input.name, nameSource: input.nameSource, email: input.email });

      const b = await Booking.updateMany({ _id: { $in: group.bookings.map((x) => x._id) }, clientId: null }, { $set: { clientId: client._id } });
      const c = await WhatsAppConversation.updateMany({ _id: { $in: group.conversations.map((x) => x._id) }, clientId: null }, { $set: { clientId: client._id } });
      linkedBookings += b.modifiedCount;
      linkedConversations += c.modifiedCount;
    }
    line(`\nDone. Created ${created} client(s), linked ${linkedBookings} booking(s) and ${linkedConversations} conversation(s).`);
  }
} catch (err) {
  console.error(`\nBackfill failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.connection.close();
}
