/**
 * Splits an element's text into words so they can be animated one by one.
 * (A tiny stand-in for GSAP's SplitText; no extra dependency.)
 *
 * - Child elements (like the gold script word in the hero title) are kept.
 * - Screen readers get the original text through a hidden copy; the animated words are aria-hidden.
 * - Only use it on elements whose text is static (headings).
 *
 * Returns { inners, revert }.  Animate `inners`; call revert() to restore the original markup.
 */
export function splitWords(el) {
  const original = el.innerHTML;
  const fullText = el.textContent;
  const inners = [];

  const visual = document.createElement('span');
  visual.setAttribute('aria-hidden', 'true');

  const walk = (source, target) => {
    source.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        node.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) {
            target.appendChild(document.createTextNode(' '));
            return;
          }
          const word = document.createElement('span');
          word.className = 'split__word';
          const inner = document.createElement('span');
          inner.className = 'split__inner';
          inner.textContent = part;
          word.appendChild(inner);
          target.appendChild(word);
          inners.push(inner);
        });
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const shell = node.cloneNode(false); // keep tag + classes, rebuild its children
        target.appendChild(shell);
        walk(node, shell);
      }
    });
  };
  walk(el, visual);

  const readable = document.createElement('span');
  readable.className = 'sr-only';
  readable.textContent = fullText;

  el.replaceChildren(readable, visual);

  return {
    inners,
    revert() {
      el.innerHTML = original;
    },
  };
}
