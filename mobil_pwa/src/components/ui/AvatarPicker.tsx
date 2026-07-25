import { AVATAR_OPTIONS, avatarUrl } from '../../design/avatars';
import { Colors } from '../../design/tokens';
import styles from './AvatarPicker.module.css';

interface AvatarPickerProps {
  value?: string | null;
  onSelect: (key: string) => void;
  onClose: () => void;
}

export default function AvatarPicker({ value, onSelect, onClose }: AvatarPickerProps) {
  const selected = value?.trim() || 'Felix';

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div
        className={styles.sheet}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Avatar választó"
      >
        <div className={styles.handle} />
        <h3 className={styles.title}>Válassz avatárt</h3>
        <p className={styles.sub}>Ingyenes illusztrációk — bármikor cserélheted.</p>
        <div className={styles.grid}>
          {AVATAR_OPTIONS.map((key) => {
            const active = selected === key;
            return (
              <button
                key={key}
                type="button"
                className={`${styles.option} ${active ? styles.optionActive : ''}`}
                onClick={() => onSelect(key)}
              >
                <img src={avatarUrl(key)} alt={key} />
              </button>
            );
          })}
        </div>
        <button type="button" className={styles.closeBtn} onClick={onClose}>
          Kész
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
    <img
      className={className}
      src={avatarUrl(avatarKey)}
      alt=""
      width={size}
      height={size}
      style={{ borderRadius: '50%', objectFit: 'cover', background: Colors.dashboard.softBlue }}
    />
  );
}
