import Modal from './Modal';
import Button from './Button';

/**
 * <ConfirmModal isOpen={open} onClose={close} onConfirm={submit}
 *   title="Submit booking request?" message="I'll get back to you within 24 hours."
 *   confirmText="Submit request" />
 */
export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  loading = false,
  danger = false,
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>{cancelText}</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmText}
          </Button>
        </>
      }
    >
      {message && <p className="confirm__message">{message}</p>}
    </Modal>
  );
}
