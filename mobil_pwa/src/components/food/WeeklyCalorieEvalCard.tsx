import { useTranslation } from 'react-i18next';
import { GlassCardSimple } from '../ui/GlassCard';
import { IconChevronRight } from '../ui/Icons';
import { Colors } from '../../design/tokens';
import type { WeeklyStatsSummary } from '../../services/api';
import styles from './WeeklyCalorieEvalCard.module.css';

type Props = {
  summary: WeeklyStatsSummary;
  goalKcal: number;
  teaser?: string | null;
  onOpen: () => void;
};

function formatDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

export default function WeeklyCalorieEvalCard({ summary, goalKcal, teaser, onOpen }: Props) {
  const { t } = useTranslation();
  const delta = summary.avgDeltaVsGoal;
  const deltaClass =
    delta < 0 ? styles.chipValueMint : delta > 0 ? styles.chipValueOrange : undefined;

  return (
    <GlassCardSimple
      backgroundColor={Colors.dashboard.card}
      padding={16}
      customRadius={{
        borderTopLeftRadius: 22,
        borderTopRightRadius: 18,
        borderBottomRightRadius: 26,
        borderBottomLeftRadius: 16,
      }}
    >
      <button type="button" className={styles.root} onClick={onOpen} aria-haspopup="dialog">
        <div className={styles.header}>
          <div className={styles.titleBlock}>
            <h2 className={styles.title}>{t('homeScreen.weeklyEvalTitle')}</h2>
            <p className={styles.subtitle}>
              {t('homeScreen.weeklyEvalDetails')} · {t('homeScreen.goal')}: {goalKcal} kcal
            </p>
          </div>
          <span className={styles.chevron} aria-hidden>
            <IconChevronRight size={20} color={Colors.dashboard.stroke} />
          </span>
        </div>

        <div className={styles.grid}>
          <div className={styles.chip}>
            <span className={styles.chipLabel}>{t('homeScreen.weeklyEvalAvg')}</span>
            <span className={styles.chipValue}>{Math.round(summary.avgKcal)}</span>
          </div>
          <div className={styles.chip}>
            <span className={styles.chipLabel}>{t('homeScreen.weeklyEvalVsGoal')}</span>
            <span className={`${styles.chipValue} ${deltaClass ?? ''}`.trim()}>
              {formatDelta(delta)} kcal
            </span>
          </div>
          <div className={styles.chip}>
            <span className={styles.chipLabel}>{t('homeScreen.weeklyEvalOnTarget')}</span>
            <span className={styles.chipValue}>{summary.daysOnTarget}/7</span>
          </div>
          <div className={styles.chip}>
            <span className={styles.chipLabel}>{t('homeScreen.weeklyEvalLogged')}</span>
            <span className={styles.chipValue}>{summary.loggedDays}/7</span>
          </div>
        </div>

        {teaser ? <p className={styles.teaser}>{teaser}</p> : null}
      </button>
    </GlassCardSimple>
  );
}
