import { useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { IconArrowBack, IconEggAlt, IconGrain, IconOpacity } from '../ui/Icons';
import { Colors } from '../../design/tokens';
import WeekBars, { type WeekBarPoint } from './WeekBars';
import styles from './WeeklyMetricChartSheet.module.css';

export type WeeklyChartKind = 'kcal' | 'protein' | 'carbs' | 'fat' | 'meal' | 'weight';

export type MealDayPoint = {
  date: string;
  kcal: number;
  protein?: number;
  carbs?: number;
  fat?: number;
};

export type WeeklyChartSpec = {
  kind: WeeklyChartKind;
  title: string;
  points: WeekBarPoint[];
  goal?: number | null;
  barColor?: string;
  unit?: string;
  highlightDate?: string | null;
  mealType?: string;
  mealSeries?: MealDayPoint[];
  formatValue?: (n: number) => string;
};

type Props = {
  open: boolean;
  spec: WeeklyChartSpec | null;
  onClose: () => void;
  onOpenDay: (date: string) => void;
};

type ExtremePoint = { date: string; value: number };

function formatShortDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(i18n.language === 'hu' ? 'hu-HU' : 'en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function weekdayLong(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(i18n.language === 'hu' ? 'hu-HU' : 'en-US', {
    weekday: 'long',
  });
}

function findExtremes(points: WeekBarPoint[]): { high: ExtremePoint; low: ExtremePoint } | null {
  const series = points.filter((p) => p.value > 0);
  if (series.length < 2) return null;
  let high = series[0];
  let low = series[0];
  for (const row of series) {
    if (row.value > high.value) high = row;
    if (row.value < low.value) low = row;
  }
  if (high.date === low.date) return null;
  return { high, low };
}

function MacroMiniGrid({
  protein,
  carbs,
  fat,
}: {
  protein: number;
  carbs: number;
  fat: number;
}) {
  const { t } = useTranslation();
  const cells = [
    {
      key: 'protein',
      value: protein,
      label: t('food.protein'),
      Icon: IconEggAlt,
      iconColor: Colors.dashboard.proteinFill,
    },
    {
      key: 'carbs',
      value: carbs,
      label: t('food.carbs'),
      Icon: IconGrain,
      iconColor: Colors.dashboard.carbsFill,
    },
    {
      key: 'fat',
      value: fat,
      label: t('food.fat'),
      Icon: IconOpacity,
      iconColor: Colors.dashboard.fatFill,
    },
  ] as const;

  return (
    <div className={styles.macroGrid}>
      {cells.map(({ key, value, label, Icon, iconColor }) => (
        <div key={key} className={styles.macroCell} aria-label={`${label}: ${Math.round(value)}g`}>
          <span className={styles.macroCellIcon} aria-hidden>
            <Icon size={14} color={iconColor} />
          </span>
          <span className={styles.macroCellValue}>{Math.round(value)}g</span>
        </div>
      ))}
    </div>
  );
}

export default function WeeklyMetricChartSheet({ open, spec, onClose, onOpenDay }: Props) {
  const { t } = useTranslation();
  const titleId = useId();
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !spec) return;
    setSelected(spec.highlightDate ?? spec.points.find((p) => p.value > 0)?.date ?? null);
  }, [open, spec]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const mealExtremes = useMemo(() => {
    if (!spec || spec.kind !== 'meal') return null;
    const series = (spec.mealSeries ?? []).filter((d) => d.kcal > 0);
    if (series.length < 2) return null;
    let high = series[0];
    let low = series[0];
    for (const row of series) {
      if (row.kcal > high.kcal) high = row;
      if (row.kcal < low.kcal) low = row;
    }
    if (high.date === low.date) return null;
    return { high, low };
  }, [spec]);

  const valueExtremes = useMemo(() => {
    if (!spec) return null;
    if (spec.kind === 'meal') return null;
    if (spec.kind === 'protein' || spec.kind === 'carbs' || spec.kind === 'fat' || spec.kind === 'weight') {
      return findExtremes(spec.points);
    }
    return null;
  }, [spec]);

  const weightStats = useMemo(() => {
    if (!spec || spec.kind !== 'weight') return null;
    const values = spec.points.filter((p) => p.value > 0).map((p) => p.value);
    if (values.length === 0) return null;
    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    return {
      avg,
      count: values.length,
      delta: values.length >= 2 ? values[values.length - 1] - values[0] : null,
    };
  }, [spec]);

  if (!open || !spec) return null;

  const selectedPoint = spec.points.find((p) => p.date === selected);
  const unit =
    spec.unit ??
    (spec.kind === 'kcal' || spec.kind === 'meal' ? 'kcal' : spec.kind === 'weight' ? 'kg' : 'g');
  const formatValue =
    spec.formatValue ??
    (spec.kind === 'weight' ? (n: number) => n.toFixed(1) : (n: number) => String(Math.round(n)));

  const macroName =
    spec.kind === 'protein'
      ? t('food.protein')
      : spec.kind === 'carbs'
        ? t('food.carbs')
        : spec.kind === 'fat'
          ? t('food.fat')
          : null;

  const highLabel =
    spec.kind === 'weight'
      ? t('homeScreen.weeklyWeightHighest')
      : macroName
        ? t('homeScreen.weeklyMacroHighest', { macro: macroName })
        : t('homeScreen.weeklyInsightsHighest');

  const lowLabel =
    spec.kind === 'weight'
      ? t('homeScreen.weeklyWeightLowest')
      : macroName
        ? t('homeScreen.weeklyMacroLowest', { macro: macroName })
        : t('homeScreen.weeklyInsightsLowest');

  return (
    <div className={styles.overlay} role="presentation">
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className={styles.header}>
          <button
            type="button"
            className={styles.backBtn}
            onClick={onClose}
            aria-label={t('common.back', 'Vissza')}
          >
            <IconArrowBack size={20} color={Colors.dashboard.stroke} />
          </button>
          <div className={styles.headerText}>
            <h2 id={titleId} className={styles.title}>
              {spec.title}
            </h2>
            <p className={styles.sub}>{t('homeScreen.weeklyChartSubtitle')}</p>
          </div>
        </div>

        <div className={styles.body}>
          <div className={styles.chartCard}>
            <WeekBars
              points={spec.points}
              selectedDate={selected}
              onSelectDate={setSelected}
              goal={spec.goal}
              barColor={spec.barColor}
              unit={unit}
              formatValue={formatValue}
              goalPill={
                spec.goal != null && spec.goal > 0
                  ? t('homeScreen.weeklyChartGoalPill', {
                      value: Math.round(spec.goal),
                      unit,
                    })
                  : null
              }
            />
          </div>

          {mealExtremes && (
            <div className={styles.extremesBlock}>
              <p className={styles.extremesHint}>{t('homeScreen.weeklyChartExtremes')}</p>
              <div className={styles.extremesPair}>
                <button
                  type="button"
                  className={`${styles.extremeCard} ${styles.extremeHigh}`}
                  onClick={() => setSelected(mealExtremes.high.date)}
                >
                  <span className={styles.extremeLabel}>{t('homeScreen.weeklyInsightsHighest')}</span>
                  <span className={styles.extremeDay}>{weekdayLong(mealExtremes.high.date)}</span>
                  <span className={styles.extremeKcal}>
                    {Math.round(mealExtremes.high.kcal)}
                    <span className={styles.extremeUnit}>kcal</span>
                  </span>
                  <MacroMiniGrid
                    protein={mealExtremes.high.protein ?? 0}
                    carbs={mealExtremes.high.carbs ?? 0}
                    fat={mealExtremes.high.fat ?? 0}
                  />
                </button>
                <button
                  type="button"
                  className={`${styles.extremeCard} ${styles.extremeLow}`}
                  onClick={() => setSelected(mealExtremes.low.date)}
                >
                  <span className={styles.extremeLabel}>{t('homeScreen.weeklyInsightsLowest')}</span>
                  <span className={styles.extremeDay}>{weekdayLong(mealExtremes.low.date)}</span>
                  <span className={styles.extremeKcal}>
                    {Math.round(mealExtremes.low.kcal)}
                    <span className={styles.extremeUnit}>kcal</span>
                  </span>
                  <MacroMiniGrid
                    protein={mealExtremes.low.protein ?? 0}
                    carbs={mealExtremes.low.carbs ?? 0}
                    fat={mealExtremes.low.fat ?? 0}
                  />
                </button>
              </div>
            </div>
          )}

          {valueExtremes && (
            <div className={styles.extremesBlock}>
              <p className={styles.extremesHint}>{t('homeScreen.weeklyChartExtremes')}</p>
              <div className={styles.extremesPair}>
                <button
                  type="button"
                  className={`${styles.extremeCard} ${styles.extremeHigh}`}
                  onClick={() => setSelected(valueExtremes.high.date)}
                >
                  <span className={styles.extremeLabel}>{highLabel}</span>
                  <span className={styles.extremeDay}>{weekdayLong(valueExtremes.high.date)}</span>
                  <span className={styles.extremeKcal}>
                    {formatValue(valueExtremes.high.value)}
                    <span className={styles.extremeUnit}>{unit}</span>
                  </span>
                  {spec.goal != null &&
                    spec.goal > 0 &&
                    (spec.kind === 'protein' || spec.kind === 'carbs' || spec.kind === 'fat') && (
                      <span className={styles.ratioChip}>
                        {t('homeScreen.weeklyMacroGoal', { goal: Math.round(spec.goal) })}
                      </span>
                    )}
                </button>
                <button
                  type="button"
                  className={`${styles.extremeCard} ${styles.extremeLow}`}
                  onClick={() => setSelected(valueExtremes.low.date)}
                >
                  <span className={styles.extremeLabel}>{lowLabel}</span>
                  <span className={styles.extremeDay}>{weekdayLong(valueExtremes.low.date)}</span>
                  <span className={styles.extremeKcal}>
                    {formatValue(valueExtremes.low.value)}
                    <span className={styles.extremeUnit}>{unit}</span>
                  </span>
                  {spec.goal != null &&
                    spec.goal > 0 &&
                    (spec.kind === 'protein' || spec.kind === 'carbs' || spec.kind === 'fat') && (
                      <span className={styles.ratioChip}>
                        {t('homeScreen.weeklyMacroGoal', { goal: Math.round(spec.goal) })}
                      </span>
                    )}
                </button>
              </div>
            </div>
          )}

          {weightStats && (
            <div className={styles.statsRow}>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>{t('homeScreen.weeklyWeightAvg')}</span>
                <span className={styles.statValue}>
                  {weightStats.avg.toFixed(1)}
                  <span className={styles.extremeUnit}>kg</span>
                </span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>{t('homeScreen.weeklyWeightLogs')}</span>
                <span className={styles.statValue}>{weightStats.count}</span>
              </div>
              {weightStats.delta != null && (
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>{t('homeScreen.weeklyInsightsWeightDelta')}</span>
                  <span
                    className={`${styles.statValue} ${
                      weightStats.delta < 0
                        ? styles.statMint
                        : weightStats.delta > 0
                          ? styles.statOrange
                          : ''
                    }`.trim()}
                  >
                    {weightStats.delta > 0 ? '+' : ''}
                    {weightStats.delta.toFixed(1)}
                    <span className={styles.extremeUnit}>kg</span>
                  </span>
                </div>
              )}
            </div>
          )}

          {selected && selectedPoint && selectedPoint.value > 0 && (
            <div className={styles.selectedCard}>
              <span className={styles.selectedLabel}>{formatShortDate(selected)}</span>
              <span className={styles.selectedValue}>
                {formatValue(selectedPoint.value)} {unit}
              </span>
            </div>
          )}

          {selected && (
            <div className={styles.ctaWrap}>
              <span className={styles.ctaShadow} aria-hidden />
              <button
                type="button"
                className={styles.cta}
                onClick={() => onOpenDay(selected)}
              >
                {t('homeScreen.weeklyChartOpenDay')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
