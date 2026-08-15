import { useTranslation } from 'react-i18next';
import styles from './CopyUndoBar.module.css';

type Props = {
  count: number;
  onUndo: () => void;
  onDismiss: () => void;
};

export default function CopyUndoBar({ count, onUndo, onDismiss }: Props) {
  const { t } = useTranslation();
  return (
    <div className={styles.bar} role="status">
      <span className={styles.text}>
        {t('foodLibraryScreen.copyUndo', { count })}
      </span>
      <button type="button" className={styles.undo} onClick={onUndo}>
        {t('foodLibraryScreen.copyUndoAction')}
      </button>
      <button
        type="button"
        className={styles.dismiss}
        onClick={onDismiss}
        aria-label={t('common.close')}
      >
        ×
      </button>
    </div>
  );
}
