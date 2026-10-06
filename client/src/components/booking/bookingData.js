import {
  Heart, Sparkles, User, CalendarDays, Briefcase, Lightbulb,
  Building2, Trees, Home, HelpCircle, CalendarCheck, Camera, Clock, ShieldCheck,
} from 'lucide-react';

export const STEPS = [
  { id: 1, label: 'Details' },
  { id: 2, label: 'Preferences' },
  { id: 3, label: 'Date & Time' },
  { id: 4, label: 'Review' },
];

/** ids match the Services page links: /booking?service=wedding */
export const SHOOT_TYPES = [
  { id: 'wedding', label: 'Wedding', text: 'Ceremony and celebration', icon: Heart },
  { id: 'pre-wedding', label: 'Pre-Wedding', text: 'Couple sessions', icon: Sparkles },
  { id: 'portrait', label: 'Portrait', text: 'Individuals, family, branding', icon: User },
  { id: 'events', label: 'Events', text: 'Corporate, parties, occasions', icon: CalendarDays },
  { id: 'commercial', label: 'Commercial', text: 'Brands, products, campaigns', icon: Briefcase },
  { id: 'custom', label: 'Custom', text: 'Something different?', icon: Lightbulb },
];

export const LOCATIONS = [
  { id: 'studio', label: 'Studio', text: 'At my studio', icon: Building2 },
  { id: 'outdoor', label: 'Outdoor', text: 'On location', icon: Trees },
  { id: 'client', label: 'At your location', text: 'Your home or venue', icon: Home },
  { id: 'undecided', label: 'Not sure yet', text: 'Need suggestions', icon: HelpCircle },
];

export const STYLES = ['Natural', 'Moody', 'Bright & Airy', 'Cinematic', 'Dark & Dramatic', 'Warm & Cozy', 'Minimal', 'Editorial'];
export const MAX_STYLES = 3;
export const MAX_PEOPLE = 50;
export const REQUESTS_MAX = 500;

/** Shown as the last option in the package picker */
export const CUSTOM_PACKAGE = {
  id: 'custom', name: 'Not sure yet', tagline: "I'll send you a custom quote", price: null, duration: 'To be discussed', durationHours: 2, features: [], popular: false, // keep durationHours equal to CUSTOM_DURATION_HOURS on the server
};

export const TRUST = [
  { icon: CalendarCheck, title: 'Easy booking', text: 'Simple process, quick response.' },
  { icon: Camera, title: 'Personalized', text: 'Every shoot is tailored to your vision.' },
  { icon: Clock, title: 'On time', text: 'Punctual, professional & reliable.' },
  { icon: ShieldCheck, title: 'Quality guaranteed', text: "High-quality images you'll cherish forever." },
];

// ---------- helpers ----------
export const labelOf = (list, id) => list.find((i) => i.id === id)?.label ?? '';
export const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const pad = (n) => String(n).padStart(2, '0');
export const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const formatDate = (k) => (k ? fromKey(k).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '');
export const formatTime = (t) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const d = new Date(); d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};
