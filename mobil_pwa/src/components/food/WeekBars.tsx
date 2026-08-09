import styles from './WeekBars.module.css';
import i18n from '../../i18n';

export type WeekBarPoint = {
  date: string;
  value: number;
};

type Props = {
  points: WeekBarPoint[];
  selectedDate?: string | null;
  onSelectDate?: (date: string) => void;
  goal?: number | null;
  barColor?: string;
  unit?: string;
  formatValue?: (n: number) => string;
  /** Shown in header pill, e.g. "Cél 2000 kcal" */
  goalPill?: string | null;
};

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function weekdayShort(dateStr: string): string {
  return parseLocalDate(dateStr).toLocaleDateString(i18n.language === 'hu' ? 'hu-HU' : 'en-US', {
    weekday: 'narrow',
  });
}

export default function WeekBars({
  points,
  selectedDate,
  onSelectDate,
  goal,
  barColor = '#ffb77d',
  unit = '',
  formatValue = (n) => String(Math.round(n)),
  goalPill,
}: Props) {
  const rawMax = Math.max(1, goal ?? 0, ...points.map((p) => p.value));
  // Modest headroom so the goal line sits just above bar tops when value ≈ goal
  const maxVal = rawMax * 1.12;
  const goalPct = goal != null && goal > 0 ? (goal / maxVal) * 100 : null;
  const goalFloatBelow = goalPct != null && goalPct >= 72;

  return (
    <div className={styles.root}>
      {goalPill && (
        <div className={styles.goalPill} aria-label={goalPill}>
          <span className={styles.goalPillDot} aria-hidden />
          <span>{goalPill}</span>
        </div>
      )}
      <div className={`${styles.chart} ${goalPill ? styles.chartWithPill : ''}`.trim()}>
        {goalPct != null && (
          <>
            <div
              className={styles.goalLine}
              style={{ bottom: `calc(${goalPct}% + 22px)` }}
              aria-hidden
            />
            <span
              className={`${styles.goalFloat} ${goalFloatBelow ? styles.goalFloatBelow : ''}`.trim()}
              style={{ bottom: `calc(${goalPct}% + 22px)` }}
              aria-hidden
            >
              {formatValue(goal!)}
            </span>
          </>
        )}
        {points.map((p) => {
          const heightPct = p.value > 0 ? Math.max(8, (p.value / maxVal) * 100) : 6;
          const active = p.date === selectedDate;
          return (
            <button
              key={p.date}
              type="button"
              className={`${styles.col} ${active ? styles.colActive : ''}`}
              onClick={() => onSelectDate?.(p.date)}
              aria-label={`${p.date}: ${formatValue(p.value)}${unit ? ` ${unit}` : ''}`}
            >
              <div className={styles.barTrack}>
                <div
                  className={`${styles.bar} ${p.value <= 0 ? styles.barEmpty : ''}`}
                  style={{
                    height: `${heightPct}%`,
                    background: p.value <= 0 ? undefined : barColor,
                  }}
                >
                  {p.value > 0 && (
                    <span className={styles.valueLabel}>{formatValue(p.value)}</span>
                  )}
                </div>
              </div>
              <span className={styles.dayLabel}>{weekdayShort(p.date)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
