/**
 * Topics on the contact form: the photography services from Settings plus a general question.
 * subjectOptions(services) builds the list for the form; SUBJECT_OPTIONS (the six starting services) is only the fallback
 * label list for old messages whose service no longer exists.
 */
export const SUBJECT_OPTIONS = [
  { value: 'wedding', label: 'Weddings' },
  { value: 'pre-wedding', label: 'Pre-weddings' },
  { value: 'portrait', label: 'Portrait' },
  { value: 'baby-shoot', label: 'Baby-Shoots' },
  { value: 'events', label: 'Events' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'general', label: 'General question' },
];

/** Admin side: labels for message subjects. Live service names first, then the starting list for services that were deleted. */
export const subjectLabelOptions = (services) => [...services.map((s) => ({ value: s.slug, label: s.name })), ...SUBJECT_OPTIONS];

export const subjectOptions = (services) => [
  ...services.map((s) => ({ value: s.slug, label: s.name })),
  { value: 'general', label: 'General question' },
];
