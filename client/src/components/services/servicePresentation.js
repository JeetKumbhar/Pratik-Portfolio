import { Baby, Briefcase, CalendarDays, Camera, Heart, Sparkles, User } from 'lucide-react';

/**
 * How a service looks on the website. The WORDS come from Admin → Settings → Services; this only adds an icon and a
 * fallback gradient. The six starting services keep their icons; a service added later gets the camera and a neutral gradient.
 */
const LOOKS = {
  wedding: { icon: Heart, gradient: 'linear-gradient(160deg, #4a3a2a, #0e0b08)' },
  'pre-wedding': { icon: Sparkles, gradient: 'linear-gradient(160deg, #5a2a3a, #10080b)' },
  portrait: { icon: User, gradient: 'linear-gradient(160deg, #5a3d22, #120d08)' },
  'baby-shoot': { icon: Baby, gradient: 'linear-gradient(160deg, #6a4a28, #0b0e12)' },
  events: { icon: CalendarDays, gradient: 'linear-gradient(160deg, #4a2a5a, #0b0810)' },
  commercial: { icon: Briefcase, gradient: 'linear-gradient(160deg, #2a3a4a, #080b0e)' },
};
const NEUTRAL = { icon: Camera, gradient: 'linear-gradient(160deg, #3a3226, #0c0a08)' };

/** The services from settings → cards: { id, title, text, icon, gradient, coverImage } */
export const presentServices = (services) =>
  services.map((s) => ({
    id: s.slug, title: s.name, text: s.description, coverImage: s.coverImage || '',
    ...(LOOKS[s.slug] ?? NEUTRAL),
  }));
