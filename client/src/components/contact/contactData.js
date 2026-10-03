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
  { value: 'wedding', label: 'Wedding photography' },
  { value: 'pre-wedding', label: 'Pre-wedding shoot' },
  { value: 'portrait', label: 'Portrait session' },
  { value: 'events', label: 'Event coverage' },
  { value: 'commercial', label: 'Commercial project' },
  { value: 'custom', label: 'Custom shoot' },
  { value: 'general', label: 'General question' },
];
