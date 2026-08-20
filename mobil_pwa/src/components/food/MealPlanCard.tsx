import { useTranslation } from 'react-i18next';
import { GlassCardSimple } from '../ui/GlassCard';
import { IconCalendarMonthOutline } from '../ui/Icons';
import { Colors } from '../../design/tokens';
import type { MealPlanSlot } from '../../services/api';
import { MEAL_META, type MealType } from '../../utils/mealMeta';
import styles from './MealPlanCard.module.css';

const MEAL_I18N: Record<string, string> = {
  BREAKFAST: 'food.breakfast',
  LUNCH: 'food.lunch',
  DINNER: 'food.dinner',
};

type Props = {
  slot: MealPlanSlot | null;
  busy?: boolean;
  onOpen: () => void;
  onPush: (slot: MealPlanSlot) => void;
};

export default function MealPlanCard({ slot, busy, onOpen, onPush }: Props) {
  const { t } = useTranslation();
  const meal = (slot?.mealType ?? 'LUNCH') as MealType;
  const meta = MEAL_META[meal] ?? MEAL_META.LUNCH;
  const MealIcon = meta.Icon;

  let status = t('mealPlan.homeEmpty');
  if (slot?.logged) status = t('mealPlan.homeDone');
  else if (slot?.title) status = slot.title;

  return (
    <GlassCardSimple
      backgroundColor="#e8f5e9"
      padding={20}
      customRadius={{
        borderTopLeftRadius: 24,
        borderTopRightRadius: 32,
        borderBottomRightRadius: 24,
        borderBottomLeftRadius: 32,
      }}
    >
      <button type="button" className={styles.headerBtn} onClick={onOpen}>
        <div className={styles.titleRow}>
          <div className={styles.iconCircle}>
            <span className={styles.iconShadow} />
            <span className={styles.iconInner}>
              <IconCalendarMonthOutline size={24} color={Colors.dashboard.stroke} />
            </span>
          </div>
          <div>
            <div className={styles.title}>{t('mealPlan.title')}</div>
            <div className={styles.goal}>{status}</div>
          </div>
        </div>
        {slot ? (
          <span className={styles.mealBadge} style={{ background: meta.bg }}>
            <MealIcon size={16} color={Colors.dashboard.stroke} />
          </span>
        ) : null}
      </button>

      {slot && !slot.logged ? (
        <div className={styles.metaRow}>
          <span className={styles.mealName}>{t(MEAL_I18N[slot.mealType] ?? 'food.lunch')}</span>
          {slot.kcal != null ? (
            <span className={styles.kcal}>{t('mealPlan.kcal', { kcal: slot.kcal })}</span>
          ) : null}
        </div>
      ) : null}

      <div className={styles.btnRow}>
        {slot && slot.loggable && !slot.logged ? (
          <button type="button" className={styles.btnWrapper} disabled={busy} onClick={() => onPush(slot)}>
            <span className={styles.btnShadow} />
            <span className={styles.btnFace}>{busy ? t('mealPlan.pushing') : t('mealPlan.push')}</span>
          </button>
        ) : (
          <button type="button" className={styles.btnWrapper} onClick={onOpen}>
            <span className={styles.btnShadow} />
            <span className={styles.btnFace}>{t('mealPlan.homeOpen')}</span>
          </button>
        )}
      </div>
    </GlassCardSimple>
  );
}
