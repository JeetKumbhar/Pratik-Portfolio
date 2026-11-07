import mongoose from 'mongoose';
import { CLIENT_NOTE_MAX_LENGTH as NOTE_MAX_LENGTH } from '../config/constants.js';

/**
 * A PRIVATE note the admin keeps about a client ("Prefers candid wedding photography", "Follow up next week").
 * Kept in its own collection so it can never leak through a Client, Booking or WhatsApp response.
 * The only routes that read it are the admin-only /api/clients/:id/notes routes.
 *
 *   authorName  a copy of the admin's name when the note was written, so the note still says who wrote it
 *               if that admin is renamed or removed later.
 *   editedAt    set when the text is changed after it was written.
 */
const clientNoteSchema = new mongoose.Schema(
  {
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
    body: { type: String, required: [true, 'Write something first'], trim: true, minlength: [1, 'Write something first'], maxlength: [NOTE_MAX_LENGTH, `A note can be at most ${NOTE_MAX_LENGTH} characters`] },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    authorName: { type: String, trim: true, maxlength: 80, default: '' },
    editedAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        ret.id = String(ret._id);
        ret.clientId = String(ret.clientId);
        delete ret.authorId; // internal reference: the screen only needs the author's name
        delete ret.__v;
        return ret;
      },
    },
  }
);

// a client's notes, newest first
clientNoteSchema.index({ clientId: 1, createdAt: -1 });

export default mongoose.model('ClientNote', clientNoteSchema);
