import { Heart, CalendarDays, Mountain, Briefcase, Users, User } from 'lucide-react';

/**
 * Drop your photos in client/public/images/... using these names (or change the paths).
 * Missing images fall back to a warm gradient, so the page still looks fine without them.
 */
export const IMAGES = {
  hero: '/images/hero/hero.jpg',
  about: '/images/about/about.jpg',
  showreel: '/videos/showreel.mp4',
};

/** Layered background: dark overlay on top, then the photo, then a gradient fallback. */
export const photoBg = (src, fallback = 'linear-gradient(135deg, #3a2a14, #0f0c08)') =>
  `linear-gradient(0deg, rgba(0,0,0,0.7), rgba(0,0,0,0) 55%), url("${src}"), ${fallback}`;

export const HERO_STATS = [
  { value: '8+', label: 'Years experience' },
  { value: '250+', label: 'Happy clients' },
  { value: '250+', label: 'Projects completed' },
  { value: '20+', label: 'Destinations' },
];

export const FEATURED = [
  { title: 'Portraits', to: '/portfolio?category=portraits', src: '/images/portfolio/portraits.jpg', fallback: 'linear-gradient(160deg, #5a3d22, #120d08)' },
  { title: 'Weddings', to: '/portfolio?category=weddings', src: '/images/portfolio/weddings.jpg', fallback: 'linear-gradient(160deg, #4a3a2a, #0e0b08)' },
  { title: 'Landscapes', to: '/portfolio?category=landscapes', src: '/images/portfolio/landscapes.jpg', fallback: 'linear-gradient(160deg, #6a4a28, #0b0e12)' },
  { title: 'Events', to: '/portfolio?category=events', src: '/images/portfolio/events.jpg', fallback: 'linear-gradient(160deg, #4a2a5a, #0b0810)' },
];

export const SERVICES = [
  { title: 'Portraits', icon: User, text: 'Professional portraits for individuals, professionals and personal branding.' },
  { title: 'Weddings', icon: Heart, text: 'Timeless wedding photography that captures every emotion and beautiful moment.' },
  { title: 'Events', icon: CalendarDays, text: 'Corporate events, parties and special occasions covered with care and creativity.' },
  { title: 'Landscapes', icon: Mountain, text: 'Breathtaking landscape and travel photography that captures nature at its best.' },
  { title: 'Commercial', icon: Briefcase, text: 'High-quality imagery for brands, products and marketing campaigns.' },
  { title: 'Family', icon: Users, text: 'Natural and heartwarming family photos you\'ll treasure forever.' },
];

/** SAMPLE TEXT: replace with real client testimonials. */
export const TESTIMONIALS = [
  { quote: 'Working with Alex was an incredible experience. The photos turned out beyond amazing!', name: 'Sarah & James', role: 'Wedding' },
  { quote: 'Calm, professional and endlessly creative. Every frame felt like a scene from a film.', name: 'Maya R.', role: 'Portrait session' },
  { quote: 'Alex made the whole day effortless and delivered our gallery earlier than promised.', name: 'The Patel Family', role: 'Family shoot' },
];
