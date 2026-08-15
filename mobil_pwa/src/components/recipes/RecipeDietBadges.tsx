import { Colors } from '../../design/tokens';
import { RECIPE_DIET_META } from '../../utils/recipeMeta';
import type { RecipeDietTag } from '../../services/api';
import styles from './RecipeDietBadges.module.css';
import { useTranslation } from 'react-i18next';

type Variant = 'card' | 'chip' | 'compact';

export function RecipeDietBadges({
  tags,
  variant = 'card',
}: {
  tags?: RecipeDietTag[] | null;
  variant?: Variant;
}) {
  const { t } = useTranslation();
  const list = (tags ?? []).filter((tag) => tag in RECIPE_DIET_META);
  if (!list.length) return null;

  return (
    <div className={variant === 'compact' ? styles.compact : variant === 'chip' ? styles.chips : styles.row}>
      {list.map((tag) => {
        const meta = RECIPE_DIET_META[tag];
        const Icon = meta.Icon;
        const label = t(meta.labelKey);
        if (variant === 'compact') {
          return (
            <span
              key={tag}
              className={styles.compactIcon}
              style={{ background: meta.bg }}
              title={label}
              aria-label={label}
            >
              <Icon size={16} color={Colors.dashboard.stroke} />
            </span>
          );
        }
        return (
          <span key={tag} className={styles.badge}>
            <span className={styles.icon} style={{ background: meta.bg }}>
              <Icon size={16} color={Colors.dashboard.stroke} />
            </span>
            {variant === 'chip' ? label : <span className={styles.label}>{label}</span>}
          </span>
        );
      })}
    </div>
  );
}
