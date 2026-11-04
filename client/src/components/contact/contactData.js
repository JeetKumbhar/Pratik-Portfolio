import { SITE } from '../../utils/constants';

/** SAMPLE LOCATION: replace the address and coordinates with your own studio / city. */
export const LOCATION = {
  lines: ['Mountain View Studio', 'Banff, Alberta, Canada'],
  lat: 51.1784,
  lng: -115.5708,
};

// wa.me wants digits only, with country code and no "+"
export const WHATSAPP_URL = `https://wa.me/${SITE.phone.replace(/\D/g, '')}`;

export const SUBJECT_OPTIONS = [
  { value: 'wedding', label: 'Weddings' },
  { value: 'pre-wedding', label: 'Pre-weddings' },
  { value: 'portrait', label: 'Portrait' },
  { value: 'baby-shoot', label: 'Baby-Shoots' },
  { value: 'events', label: 'Events' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'general', label: 'General question' },
];
