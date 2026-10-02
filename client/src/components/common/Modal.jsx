import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * <Modal isOpen={open} onClose={() => setOpen(false)} title="Watch my story" size="lg">…</Modal>
 */
export default function Modal({ isOpen, onClose, title, children, footer, size = 'md' }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement;
    const onKey = (e) => e.key === 'Escape' && onClose?.();

    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previouslyFocused?.focus?.();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div
        ref={panelRef}
        className={`modal modal--${size}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        {(title || onClose) && (
          <div className="modal__header">
            <h2 className="modal__title">{title}</h2>
            <button type="button" className="modal__close" onClick={onClose} aria-label="Close dialog">
              <X size={20} />
            </button>
          </div>
        )}
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__footer">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
