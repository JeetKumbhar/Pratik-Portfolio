import { Camera, Image, Users, Sun, Aperture, Clapperboard, SlidersHorizontal } from 'lucide-react';

/** Drop files in client/public/. Missing ones fall back to a gradient (or hide the video). */
export const ABOUT_MEDIA = {
  heroImage: '/images/about/about-hero.jpg',
  heroVideo: '/videos/about-hero.mp4', // silent looping background, desktop only
  storyVideo: '/videos/story.mp4', // opens from "Watch my story"
  storyImage: '/images/about/story.jpg',
};

export const HERO_STATS = [
  { icon: Camera, value: '8+', label: 'Years experience' },
  { icon: Image, value: '250+', label: 'Projects completed' },
  { icon: Users, value: '98%', label: 'Happy clients' },
];

/** SAMPLE TEXT: replace with your real story. */
export const STORY = {
  heading: 'Behind the lens',
  paragraphs: [
    'I picked up my first camera on a long hike, chasing light across a ridge before sunrise. I came home with a few good frames and a feeling I couldn\'t shake: this was how I wanted to spend my life.',
    'Eight years later, that feeling hasn\'t changed. Whether it\'s a wedding at golden hour, a quiet portrait session or a mountain I hiked three hours to reach, I look for the same thing: the honest moment.',
    'I work calmly and stay out of the way, so the people in front of my camera can simply be themselves.',
  ],
  quote: 'The best photographs aren\'t posed. They\'re remembered.',
};

export const EXPERIENCE_STATS = [
  { value: 8, suffix: '+', label: 'Years experience' },
  { value: 250, suffix: '+', label: 'Projects completed' },
  { value: 98, suffix: '%', label: 'Happy clients' },
  { value: 20, suffix: '+', label: 'Destinations' },
];

/** SAMPLE TEXT: replace with your real milestones. */
export const MILESTONES = [
  { year: '2018', title: 'First paid shoot', text: 'Photographed a friend\'s elopement and never looked back.' },
  { year: '2020', title: 'Went full-time', text: 'Left my day job to build a studio focused on weddings and portraits.' },
  { year: '2023', title: 'Destination work', text: 'Started shooting landscapes and travel stories abroad.' },
  { year: 'Today', title: '250+ stories told', text: 'Still chasing the next honest moment.' },
];

export const STYLE_PILLARS = [
  { icon: Sun, title: 'Natural light', text: 'I follow the light instead of fighting it: golden hour, window light, soft overcast.' },
  { icon: Aperture, title: 'Candid moments', text: 'Gentle direction, no stiff poses. The in-between moments are often the best ones.' },
  { icon: Clapperboard, title: 'Cinematic tone', text: 'Rich, warm colour and deliberate framing so every frame feels like a scene.' },
  { icon: SlidersHorizontal, title: 'Honest editing', text: 'Refined, never overdone. Your photos should still look like your day.' },
];
