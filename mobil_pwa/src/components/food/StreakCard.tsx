import { useTranslation } from 'react-i18next';
import { GlassCardSimple } from '../ui/GlassCard';
import { Colors } from '../../design/tokens';
import styles from './StreakCard.module.css';

type Props = {
  streak: number;
};

function streakMessageKey(streak: number): string {
  if (streak <= 0) return 'homeScreen.streakZero';
  if (streak === 1) return 'homeScreen.streakOne';
  if (streak < 7) return 'homeScreen.streakShort';
  if (streak < 30) return 'homeScreen.streakMedium';
  return 'homeScreen.streakLong';
}

export default function StreakCard({ streak }: Props) {
  const { t } = useTranslation();

  return (
    <GlassCardSimple
      backgroundColor={Colors.dashboard.card}
      padding={14}
      customRadius={{
        borderTopLeftRadius: 24,
        borderTopRightRadius: 14,
        borderBottomRightRadius: 28,
        borderBottomLeftRadius: 16,
      }}
    >
      <div className={styles.root}>
        <div className={styles.numBlock}>
          <span className={styles.num}>{streak}</span>
          <span className={styles.unit}>{t('homeScreen.streakDays')}</span>
        </div>
        <p className={styles.msg}>{t(streakMessageKey(streak), { count: streak })}</p>
      </div>
    </GlassCardSimple>
  );
}
