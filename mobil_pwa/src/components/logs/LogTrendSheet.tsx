import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { rangeForPreset, type PresetKey } from '../../utils/dateRangePresets';
import { toLocalDateStr } from '../../stores/dateStore';
import styles from './LogTrendSheet.module.css';

export type TrendPoint = { date: string; value: number };

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  unit: string;
  points: TrendPoint[];
  period: PresetKey;
  onPeriodChange: (key: PresetKey) => void;
  goal?: number | null;
  monthlyChange?: number | null;
  formatValue?: (n: number) => string;
  loading?: boolean;
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

function lastDays(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    out.push(toLocalDateStr(d));
  }
  return out;
}

function signed(n: number, format: (v: number) => string, unit: string) {
  const body = format(Math.abs(n));
  if (n > 0) return `+${body} ${unit}`;
  if (n < 0) return `−${body} ${unit}`;
  return `${body} ${unit}`;
}

export default function LogTrendSheet({
  open,
  onClose,
  title,
  unit,
  points,
  period,
  onPeriodChange,
  goal,
  monthlyChange,
  formatValue = (n) => n.toFixed(1),
  loading = false,
}: Props) {
  const { t } = useTranslation();
  const locale = i18n.language === 'hu' ? 'hu-HU' : 'en-US';

  const presets = useMemo(
    () =>
      [
        ['thisMonth', t('export.presets.thisMonth')],
        ['last7', t('export.presets.last7')],
        ['last30', t('export.presets.last30')],
        ['last90', t('export.presets.last90')],
      ] as const,
    [t],
  );

  const range = rangeForPreset(period);
  const ranged = useMemo(
    () => points.filter((p) => p.date >= range.from && p.date <= range.to),
    [points, range.from, range.to],
  );

  const weekDays = useMemo(() => lastDays(7), []);
  const byDate = useMemo(() => new Map(points.map((p) => [p.date, p.value])), [points]);
  const weekValues = weekDays.map((date) => byDate.get(date) ?? null);

  const periodChange =
    ranged.length >= 2 ? ranged[ranged.length - 1]!.value - ranged[0]!.value : null;
  const average =
    ranged.length > 0 ? ranged.reduce((s, p) => s + p.value, 0) / ranged.length : null;
  const latest = ranged[ranged.length - 1]?.value ?? points[points.length - 1]?.value ?? null;
  const vsGoal = goal != null && latest != null ? latest - goal : null;

  const formatShort = (iso: string) =>
    parseLocalDate(iso).toLocaleDateString(locale, { month: 'short', day: 'numeric' });

  if (!open) return null;

  return (
    <div className={styles.overlay} role="presentation" onClick={onClose}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-labelledby="log-trend-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="log-trend-title" className={styles.title}>
          {title}
        </h3>
        <p className={styles.hint}>
          {t('logStats.rangeHint', { from: formatShort(range.from), to: formatShort(range.to) })}
        </p>

        <div className={styles.presetRow}>
          {presets.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`${styles.preset} ${period === key ? styles.presetActive : ''}`}
              aria-pressed={period === key}
              onClick={() => onPeriodChange(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className={styles.loading}>
            <div className="spinner" />
          </div>
        ) : (
          <>
            <section className={styles.block}>
              <div className={styles.blockHead}>
                <span>{t('logStats.weekly')}</span>
              </div>
              <WeekBars days={weekDays} values={weekValues} goal={goal} />
            </section>

            <section className={styles.block}>
              <div className={styles.blockHead}>
                <span>{t('logStats.trend')}</span>
                {goal != null ? (
                  <span className={styles.goalHint}>
                    {t('logStats.goal')}: {formatValue(goal)} {unit}
                  </span>
                ) : null}
              </div>
              {ranged.length === 0 ? (
                <p className={styles.empty}>{t('logStats.noData')}</p>
              ) : (
                <LineChart points={ranged} goal={goal} formatValue={formatValue} locale={locale} />
              )}
            </section>

            <div className={styles.statsGrid}>
              <StatTile
                label={t('logStats.monthlyChange')}
                value={monthlyChange == null ? '—' : signed(monthlyChange, formatValue, unit)}
                tone={
                  monthlyChange == null ? undefined : monthlyChange < 0 ? 'down' : monthlyChange > 0 ? 'up' : undefined
                }
              />
              <StatTile
                label={t('logStats.periodChange')}
                value={periodChange == null ? '—' : signed(periodChange, formatValue, unit)}
                tone={periodChange == null ? undefined : periodChange < 0 ? 'down' : periodChange > 0 ? 'up' : undefined}
              />
              <StatTile
                label={t('logStats.average')}
                value={average == null ? '—' : `${formatValue(average)} ${unit}`}
              />
              <StatTile
                label={t('logStats.vsGoal')}
                value={vsGoal == null ? '—' : signed(vsGoal, formatValue, unit)}
                tone={vsGoal == null ? undefined : vsGoal < 0 ? 'down' : vsGoal > 0 ? 'up' : undefined}
              />
            </div>
          </>
        )}

        <button type="button" className={styles.closeBtn} onClick={onClose}>
          {t('common.ok')}
        </button>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'up' | 'down';
}) {
  return (
    <div className={styles.statTile}>
      <div className={styles.statLabel}>{label}</div>
      <div
        className={`${styles.statValue} ${
          tone === 'down' ? styles.toneDown : tone === 'up' ? styles.toneUp : ''
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function WeekBars({
  days,
  values,
  goal,
}: {
  days: string[];
  values: Array<number | null>;
  goal?: number | null;
}) {
  const nums = values.filter((v): v is number => v != null);
  if (goal != null) nums.push(goal);
  const max = Math.max(1, ...nums);
  const min = nums.length ? Math.min(...nums) : 0;
  const span = Math.max(max - min, 0.1);

  return (
    <div className={styles.weekChart}>
      {days.map((date, i) => {
        const v = values[i];
        const heightPct = v == null ? 6 : Math.max(10, ((v - min) / span) * 100);
        return (
          <div key={date} className={styles.weekCol}>
            <div className={styles.barTrack}>
              <div
                className={`${styles.bar} ${v == null ? styles.barEmpty : ''}`}
                style={{ height: `${heightPct}%` }}
              />
            </div>
            <span className={styles.dayLabel}>{weekdayShort(date)}</span>
          </div>
        );
      })}
    </div>
  );
}

function LineChart({
  points,
  goal,
  formatValue,
  locale,
}: {
  points: TrendPoint[];
  goal?: number | null;
  formatValue: (n: number) => string;
  locale: string;
}) {
  const w = 320;
  const h = 148;
  const padL = 40;
  const padR = 10;
  const padT = 10;
  const padB = 26;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;

  const values = points.map((p) => p.value);
  if (goal != null) values.push(goal);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const pad = (max - min) * 0.12;
  min -= pad;
  max += pad;

  const xAt = (i: number) =>
    padL + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const yAt = (v: number) => padT + ((max - v) / (max - min)) * innerH;

  const line = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(p.value).toFixed(1)}`)
    .join(' ');
  const area = `${line} L ${xAt(points.length - 1).toFixed(1)} ${padT + innerH} L ${xAt(0).toFixed(1)} ${padT + innerH} Z`;
  const goalY = goal != null ? yAt(goal) : null;
  const showDots = points.length <= 20;
  const labelIdx = Array.from(new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]));

  const tickFmt = (iso: string) =>
    parseLocalDate(iso).toLocaleDateString(locale, { month: 'numeric', day: 'numeric' });

  return (
    <svg className={styles.svg} viewBox={`0 0 ${w} ${h}`} role="img" aria-hidden>
      {goalY != null ? (
        <line x1={padL} x2={w - padR} y1={goalY} y2={goalY} className={styles.goalLine} />
      ) : null}
      <path d={area} className={styles.area} />
      <path d={line} className={styles.line} />
      {showDots
        ? points.map((p, i) => (
            <circle key={p.date} cx={xAt(i)} cy={yAt(p.value)} r={3.5} className={styles.dot} />
          ))
        : null}
      <text x={4} y={yAt(max) + 4} className={styles.axisText}>
        {formatValue(max)}
      </text>
      <text x={4} y={yAt(min)} className={styles.axisText}>
        {formatValue(min)}
      </text>
      {labelIdx.map((i) => (
        <text key={points[i]!.date} x={xAt(i)} y={h - 6} textAnchor="middle" className={styles.axisText}>
          {tickFmt(points[i]!.date)}
        </text>
      ))}
    </svg>
  );
}
