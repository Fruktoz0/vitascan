import { useTranslation } from 'react-i18next';
import { AVATAR_OPTIONS, resolveAvatarKey } from '../../design/avatars';
import { Colors } from '../../design/tokens';
import DoodleAvatar from './DoodleAvatar';
import { IconClose } from './Icons';
import styles from './AvatarPicker.module.css';

interface AvatarPickerProps {
  value?: string | null;
  onSelect: (key: string) => void;
  onClose: () => void;
}

export default function AvatarPicker({ value, onSelect, onClose }: AvatarPickerProps) {
  const { t } = useTranslation();
  const selected = resolveAvatarKey(value);

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div
        className={styles.sheet}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="avatar-picker-title"
      >
        <div className={styles.head}>
          <h3 id="avatar-picker-title">{t('profile.avatarPickerTitle')}</h3>
          <button type="button" className={styles.closeX} onClick={onClose} aria-label={t('profile.avatarClose')}>
            <IconClose size={20} color={Colors.dashboard.stroke} />
          </button>
        </div>
        <p className={styles.sub}>{t('profile.avatarPickerSub')}</p>
        <div className={styles.grid}>
          {AVATAR_OPTIONS.map((opt) => {
            const active = selected === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                className={`${styles.option} ${active ? styles.optionActive : ''}`}
                style={{ background: opt.bg }}
                onClick={() => onSelect(opt.key)}
                aria-pressed={active}
                aria-label={opt.key}
              >
                <DoodleAvatar avatarKey={opt.key} size={48} />
              </button>
            );
          })}
        </div>
        <button type="button" className={styles.done} onClick={onClose}>
          <span className={styles.doneShadow} />
          <span className={styles.doneFace}>{t('profile.avatarDone')}</span>
        </button>
      </div>
    </div>
  );
}

export function UserAvatar({
  avatarKey,
  className,
  size = 40,
}: {
  avatarKey?: string | null;
  className?: string;
  size?: number;
}) {
  return (
    <span className={className} style={{ width: size, height: size, display: 'inline-flex' }}>
      <DoodleAvatar avatarKey={avatarKey} size={size} />
    </span>
  );
}
