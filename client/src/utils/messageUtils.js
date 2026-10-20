/** Small helpers for the admin Messages screens. Pure functions, no React. */

/** The first ~90 characters on one line, for the list */
export function previewText(text = '', max = 90) {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1).trimEnd()}…` : oneLine;
}

/** 'wedding' → 'Wedding photography' (options = the contact form's SUBJECT_OPTIONS); unknown values show as they are */
export function subjectLabel(value, options = []) {
  return options.find((o) => o.value === value)?.label ?? value ?? 'General question';
}

/** A ready-to-send reply in the photographer's own email app */
export function replyHref(message, topic) {
  const first = (message.name || '').trim().split(/\s+/)[0] || 'there';
  return `mailto:${message.email}?subject=${encodeURIComponent(`Re: ${topic}`)}&body=${encodeURIComponent(`Hi ${first},\n\n`)}`;
}
