import { Heart, Sparkles, CalendarDays, Briefcase, Baby, User } from 'lucide-react';

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
  { value: '5+', label: 'Years experience' },
  { value: '150+', label: 'Happy clients' },
  { value: '150+', label: 'Projects completed' },
  { value: '20+', label: 'Destinations' },
];

export const FEATURED = [
  { category: 'wedding', title: 'Weddings', to: '/portfolio?category=wedding', src: '/images/portfolio/weddings.jpg', fallback: 'linear-gradient(160deg, #4a3a2a, #0e0b08)' },
  { category: 'pre-wedding', title: 'Pre-Weddings', to: '/portfolio?category=pre-wedding', src: '/images/portfolio/pre-wedding.jpg', fallback: 'linear-gradient(160deg, #5a2a3a, #10080b)' },
  { category: 'portrait', title: 'Portraits', to: '/portfolio?category=portrait', src: '/images/portfolio/portraits.jpg', fallback: 'linear-gradient(160deg, #5a3d22, #120d08)' },
  { category: 'baby-shoot', title: 'BabyShoots', to: '/portfolio?category=baby-shoot', src: '/images/portfolio/baby-shoot.jpg', fallback: 'linear-gradient(160deg, #6a4a28, #0b0e12)' },
  { category: 'events', title: 'Events', to: '/portfolio?category=events', src: '/images/portfolio/events.jpg', fallback: 'linear-gradient(160deg, #4a2a5a, #0b0810)' },
  { category: 'commercial', title: 'Commercial', to: '/portfolio?category=commercial', src: '/images/portfolio/commercial.jpg', fallback: 'linear-gradient(160deg, #2a3a4a, #080b0e)' },
];

export const SERVICES = [
  { title: 'Weddings', icon: Heart, text: 'Timeless wedding photography that captures every emotion and beautiful moment.' },
  { title: 'Pre-weddings', icon: Sparkles, text: 'Beautiful pre-wedding shoots capturing the chemistry, love and story of couples.' },
  { title: 'Portrait', icon: User, text: 'Professional portraits for individuals, professionals and personal branding.' },
  { title: 'Baby-Shoots', icon: Baby, text: 'Heartwarming baby photography capturing precious little moments.' },
  { title: 'Events', icon: CalendarDays, text: 'Corporate events, parties and special occasions covered with care and creativity.' },
  { title: 'Commercial', icon: Briefcase, text: 'High-quality imagery for brands, products and marketing campaigns.' },
];

/** SAMPLE TEXT: replace with real client testimonials. */
export const TESTIMONIALS = [
  { quote: 'Working with Pratik was an incredible experience. The photos turned out beyond amazing!', name: 'Sarah & James', role: 'Wedding' },
  { quote: 'Calm, professional and endlessly creative. Every frame felt like a scene from a film.', name: 'Maya R.', role: 'Portrait session' },
  { quote: 'Pratik made the whole day effortless and delivered our gallery earlier than promised.', name: 'The Patel Family', role: 'Family shoot' },
];
