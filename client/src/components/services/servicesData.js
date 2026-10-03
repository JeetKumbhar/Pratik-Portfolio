import { Heart, Sparkles, User, CalendarDays, Briefcase, Lightbulb } from 'lucide-react';

/**
 * Photos go in client/public/images/services/<id>.jpg (e.g. wedding.jpg).
 * Missing photos fall back to the gradient.
 * `id` doubles as the booking shoot type: /booking?service=<id>
 */
export const SERVICES = [
  {
    id: 'wedding', title: 'Wedding Photography', icon: Heart,
    text: 'Timeless coverage of your ceremony and celebration, from getting ready to the last dance.',
    gradient: 'linear-gradient(160deg, #4a3a2a, #0e0b08)',
  },
  {
    id: 'pre-wedding', title: 'Pre-Wedding', icon: Sparkles,
    text: 'Relaxed couple sessions in beautiful locations before the big day.',
    gradient: 'linear-gradient(160deg, #5a2a3a, #10080b)',
  },
  {
    id: 'portrait', title: 'Portrait', icon: User,
    text: 'Professional portraits for individuals, families and personal branding.',
    gradient: 'linear-gradient(160deg, #5a3d22, #120d08)',
  },
  {
    id: 'events', title: 'Events', icon: CalendarDays,
    text: 'Corporate events, parties and special occasions covered with care and creativity.',
    gradient: 'linear-gradient(160deg, #4a2a5a, #0b0810)',
  },
  {
    id: 'commercial', title: 'Commercial', icon: Briefcase,
    text: 'High-quality imagery for brands, products and marketing campaigns.',
    gradient: 'linear-gradient(160deg, #2a3a4a, #080b0e)',
  },
  {
    id: 'custom', title: 'Custom Shoots', icon: Lightbulb,
    text: 'Have something different in mind? Tell me your idea and we\'ll plan it together.',
    gradient: 'linear-gradient(160deg, #6a4a28, #0b0e12)',
  },
];

/** SAMPLE TEXT: edit to match your real policies. */
export const FAQS = [
  { q: 'How far in advance should I book?', a: 'For weddings, 3 to 6 months ahead is ideal, especially for peak season. Portraits and smaller shoots can often be arranged within a couple of weeks.' },
  { q: 'How long until I receive my photos?', a: 'Portrait and small sessions are usually delivered within 1 to 2 weeks. Weddings and large events take 3 to 4 weeks, as every image is carefully edited.' },
  { q: 'Do you travel for shoots?', a: 'Yes. I shoot on location and travel for destination weddings and landscape work. Travel costs for far-away locations are quoted separately.' },
  { q: 'How do I secure my date?', a: 'Submit a booking request and I\'ll confirm availability within 24 hours. A deposit then reserves your date, with the balance due before the shoot.' },
  { q: 'What if I need to reschedule?', a: 'Life happens. Let me know as early as you can and we\'ll find a new date that works, subject to availability.' },
  { q: 'Can I get prints and an album?', a: 'Every package includes a print release so you can print anywhere. The Premium package also includes a 10x10 photo album.' },
];
