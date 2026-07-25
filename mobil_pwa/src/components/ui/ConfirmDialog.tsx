import styles from './ConfirmDialog.module.css';

type Props = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** If omitted, only a single dismiss button is shown */
  onConfirm?: () => void;
  onClose: () => void;
  destructive?: boolean;
};

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'OK',
  cancelLabel = 'Mégse',
  onConfirm,
  onClose,
  destructive = false,
}: Props) {
  if (!visible) return null;

  const dual = typeof onConfirm === 'function';

  return (
    <div className={styles.overlay} role="presentation" onClick={onClose}>
      <div
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-dialog-title" className={styles.title}>
          {title}
        </h2>
        <p className={styles.message}>{message}</p>
        <div className={styles.actions}>
          {dual ? (
            <>
              <button type="button" className={styles.secondary} onClick={onClose}>
                <span className={styles.btnShadow} />
                <span className={styles.btnFace}>{cancelLabel}</span>
              </button>
              <button
                type="button"
                className={destructive ? styles.danger : styles.primary}
                onClick={() => {
                  onConfirm?.();
                  onClose();
                }}
              >
                <span className={styles.btnShadow} />
                <span className={styles.btnFace}>{confirmLabel}</span>
              </button>
            </>
          ) : (
            <button type="button" className={styles.primary} onClick={onClose}>
              <span className={styles.btnShadow} />
              <span className={styles.btnFace}>{confirmLabel}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
