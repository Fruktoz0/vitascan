import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { GlassCardSimple } from '../ui/GlassCard';
import { Colors } from '../../design/tokens';
import { toLocalDateStr } from '../../stores/dateStore';
import styles from './WeeklyKcalChart.module.css';

export type WeeklyDay = {
  date: string;
  kcal: number;
  logCount: number;
};

type Props = {
  days: WeeklyDay[];
  avgKcal?: number;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
};

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function weekdayShort(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  return d.toLocaleDateString(i18n.language === 'hu' ? 'hu-HU' : 'en-US', { weekday: 'narrow' });
}

export default function WeeklyKcalChart({ days, avgKcal, selectedDate, onSelectDate }: Props) {
  const { t } = useTranslation();
  const selectedStr = toLocalDateStr(selectedDate);
  const maxKcal = Math.max(1, ...days.map((d) => d.kcal));

  return (
    <GlassCardSimple
      backgroundColor={Colors.dashboard.card}
      padding={16}
      customRadius={{
        borderTopLeftRadius: 20,
        borderTopRightRadius: 28,
        borderBottomRightRadius: 16,
        borderBottomLeftRadius: 24,
      }}
    >
      <div className={styles.root}>
        <div className={styles.header}>
          <span className={styles.title}>{t('homeScreen.weeklyKcal')}</span>
          {avgKcal != null && (
            <span className={styles.avg}>
              {t('homeScreen.weeklyAvg', { kcal: Math.round(avgKcal) })}
            </span>
          )}
        </div>
        <div className={styles.chart}>
          {days.map((day) => {
            const heightPct = day.kcal > 0 ? Math.max(8, (day.kcal / maxKcal) * 100) : 6;
            const active = day.date === selectedStr;
            const isFuture = day.date > toLocalDateStr(new Date());
            return (
              <button
                key={day.date}
                type="button"
                className={`${styles.col} ${active ? styles.colActive : ''} ${isFuture ? styles.colFuture : ''}`.trim()}
                onClick={() => onSelectDate(parseLocalDate(day.date))}
                aria-label={`${day.date}: ${Math.round(day.kcal)} kcal`}
              >
                <div className={styles.barTrack}>
                  <div
                    className={`${styles.bar} ${day.kcal <= 0 ? styles.barEmpty : ''}`}
                    style={{ height: `${heightPct}%` }}
                  />
                </div>
                <span className={styles.dayLabel}>{weekdayShort(day.date)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </GlassCardSimple>
  );
}
