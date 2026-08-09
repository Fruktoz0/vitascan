import { useCallback, useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { AnalysisResultView } from './AnalysisResult';
import WeeklyMetricChartSheet, { type WeeklyChartSpec } from './WeeklyMetricChartSheet';
import { MacroChip } from '../ui/MacroBar';
import {
  IconCalendarToday,
  IconClose,
  IconExpandLess,
  IconExpandMore,
  IconFlag,
  IconLocalFire,
  IconPieChartOutline,
  IconRestaurant,
  IconScaleOutline,
  IconTripOrigin,
} from '../ui/Icons';
import { Colors } from '../../design/tokens';
import {
  analysisApi,
  ApiError,
  type DailyAnalysisResult,
  type WeeklyStatsResult,
} from '../../services/api';
import { getItem, setItem, deleteItem } from '../../services/storage';
import { parseAnalysisContent } from '../../utils/parseAnalysisContent';
import { MEAL_META, type MealType } from '../../utils/mealMeta';
import { BODY_PART_META, isBodyPart } from '../../utils/bodyMeta';
import styles from './WeeklyInsightsSheet.module.css';

type Props = {
  open: boolean;
  weekly: WeeklyStatsResult;
  analysis: DailyAnalysisResult | null;
  analysisLoading: boolean;
  onClose: () => void;
  onSelectDate: (date: Date) => void;
  onAnalysisChange: (next: DailyAnalysisResult | null) => void;
};

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function weekdayLabel(dateStr: string): string {
  return parseLocalDate(dateStr).toLocaleDateString(i18n.language === 'hu' ? 'hu-HU' : 'en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatRangeLabel(from: string, to: string): string {
  const locale = i18n.language === 'hu' ? 'hu-HU' : 'en-US';
  const a = parseLocalDate(from);
  const b = parseLocalDate(to);
  const yearNow = new Date().getFullYear();
  const opts: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    ...(a.getFullYear() !== yearNow || b.getFullYear() !== yearNow ? { year: 'numeric' } : {}),
  };
  return `${a.toLocaleDateString(locale, opts)} – ${b.toLocaleDateString(locale, opts)}`;
}

function formatDelta(n: number, decimals = 0): string {
  const v = decimals > 0 ? n.toFixed(decimals) : String(Math.round(n));
  const num = Number(v);
  if (num > 0) return `+${decimals > 0 ? v : Math.round(n)}`;
  return decimals > 0 ? v : String(Math.round(n));
}

function formatKg(n: number): string {
  return n.toFixed(1);
}

function formatCm(n: number): string {
  return n.toFixed(1);
}

function shortDate(dateStr: string | null): string {
  if (!dateStr) return '';
  return parseLocalDate(dateStr).toLocaleDateString(i18n.language === 'hu' ? 'hu-HU' : 'en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function collapseKey(weekTo: string) {
  return `weeklyAiCollapsed:${weekTo}`;
}

const MEAL_ORDER: MealType[] = ['BREAKFAST', 'TIZORAI', 'LUNCH', 'UZSONNA', 'DINNER', 'SNACK'];

const MEAL_I18N: Record<MealType, string> = {
  BREAKFAST: 'food.breakfast',
  TIZORAI: 'food.tizorai',
  LUNCH: 'food.lunch',
  UZSONNA: 'food.uzsonna',
  DINNER: 'food.dinner',
  SNACK: 'food.snack',
};

export default function WeeklyInsightsSheet({
  open,
  weekly,
  analysis,
  analysisLoading,
  onClose,
  onSelectDate,
  onAnalysisChange,
}: Props) {
  const { t } = useTranslation();
  const titleId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiCollapsed, setAiCollapsed] = useState(false);
  const [chartSpec, setChartSpec] = useState<WeeklyChartSpec | null>(null);

  const summary = weekly.summary;
  const goals = weekly.goals;
  const remaining = analysis?.remaining ?? 2;
  const maxQuota =
    analysis?.max ?? Math.max(2, remaining + (analysis?.generationCount ?? 0));
  const loggedDays = summary?.loggedDays ?? 0;
  const canGenerate = loggedDays >= 2 && remaining > 0 && !busy && !analysisLoading;
  const parsed = parseAnalysisContent(analysis?.content);
  const hasContent = !!parsed;

  useEffect(() => {
    if (!open) {
      setChartSpec(null);
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !chartSpec) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, chartSpec]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      if (!hasContent) {
        if (!cancelled) setAiCollapsed(false);
        return;
      }
      const stored = await getItem(collapseKey(weekly.to));
      if (!cancelled) setAiCollapsed(stored === '1');
    })();
    return () => {
      cancelled = true;
    };
  }, [open, weekly.to, hasContent]);

  const setCollapsedPersist = async (next: boolean) => {
    setAiCollapsed(next);
    if (next) await setItem(collapseKey(weekly.to), '1');
    else await deleteItem(collapseKey(weekly.to));
  };

  const openDayAndClose = useCallback(
    (dateStr: string) => {
      onSelectDate(parseLocalDate(dateStr));
      setChartSpec(null);
      onClose();
    },
    [onClose, onSelectDate],
  );

  const openKcalChart = (highlightDate?: string | null) => {
    setChartSpec({
      kind: 'kcal',
      title: t('homeScreen.weeklyChartKcal'),
      points: weekly.days.map((d) => ({ date: d.date, value: d.kcal })),
      goal: goals?.dailyKcalGoal ?? null,
      barColor: '#ffb77d',
      unit: 'kcal',
      highlightDate: highlightDate ?? null,
    });
  };

  const openMacroChart = (kind: 'protein' | 'carbs' | 'fat') => {
    const colors = {
      protein: Colors.dashboard.proteinFill,
      carbs: Colors.dashboard.carbsFill,
      fat: Colors.dashboard.fatFill,
    };
    const goalsMap = {
      protein: goals?.dailyProteinGoal,
      carbs: goals?.dailyCarbsGoal,
      fat: goals?.dailyFatGoal,
    };
    const titles = {
      protein: t('food.protein'),
      carbs: t('food.carbs'),
      fat: t('food.fat'),
    };
    setChartSpec({
      kind,
      title: t('homeScreen.weeklyChartMacro', { macro: titles[kind] }),
      points: weekly.days.map((d) => ({ date: d.date, value: d[kind] })),
      goal: goalsMap[kind] ?? null,
      barColor: colors[kind],
      unit: 'g',
    });
  };

  const openMealChart = (meal: MealType) => {
    const series =
      weekly.mealDaily?.[meal] ??
      weekly.days.map((d) => ({ date: d.date, kcal: 0, protein: 0, carbs: 0, fat: 0 }));
    setChartSpec({
      kind: 'meal',
      title: t('homeScreen.weeklyChartMeal', { meal: t(MEAL_I18N[meal]) }),
      points: series.map((p) => ({ date: p.date, value: p.kcal })),
      barColor: '#ffb77d',
      unit: 'kcal',
      mealType: meal,
      mealSeries: series.map((p) => ({
        date: p.date,
        kcal: p.kcal,
        protein: p.protein ?? 0,
        carbs: p.carbs ?? 0,
        fat: p.fat ?? 0,
      })),
    });
  };

  const openWeightChart = () => {
    const series =
      weekly.weightDaily ??
      weekly.days.map((d) => ({ date: d.date, weightKg: null as number | null }));
    setChartSpec({
      kind: 'weight',
      title: t('homeScreen.weeklyChartWeight'),
      points: series.map((p) => ({ date: p.date, value: p.weightKg ?? 0 })),
      barColor: Colors.dashboard.waterIcon,
      unit: 'kg',
      formatValue: (n) => n.toFixed(1),
      highlightDate:
        summary?.body?.lastWeightDate ??
        series.find((p) => p.weightKg != null)?.date ??
        null,
    });
  };

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setBusy(true);
    setError(null);
    try {
      const locale = i18n.language?.startsWith('en') ? 'en' : 'hu';
      const result = await analysisApi.generate(weekly.to, locale, 'weeklyNutrition');
      onAnalysisChange(result);
      const stored = await getItem(collapseKey(weekly.to));
      if (stored === '1') setAiCollapsed(true);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429) setError(t('homeScreen.weeklyEvalLimit'));
        else setError(err.message || t('homeScreen.weeklyEvalError'));
      } else {
        setError(t('homeScreen.weeklyEvalError'));
      }
    } finally {
      setBusy(false);
    }
  };

  if (!open || !summary || !goals) return null;

  const mealEntries = MEAL_ORDER.filter((m) => (weekly.mealAvg?.[m]?.daysWithMeal ?? 0) > 0);
  const previewText =
    parsed?.kind === 'structured'
      ? parsed.data.summary.positives[0] ??
        parsed.data.suggestions[0] ??
        parsed.data.summary.negatives[0] ??
        null
      : parsed?.kind === 'plain'
        ? parsed.text
        : null;

  const avgDelta = summary.avgDeltaVsGoal;
  const avgDeltaClass =
    avgDelta < 0 ? styles.miniValueMint : avgDelta > 0 ? styles.miniValueOrange : undefined;
  const prevDelta = summary.prevWeek?.deltaAvgKcal;
  const prevDeltaClass =
    prevDelta == null
      ? undefined
      : prevDelta < 0
        ? styles.miniValueMint
        : prevDelta > 0
          ? styles.miniValueOrange
          : undefined;

  return (
    <div
      className={styles.overlay}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !chartSpec) onClose();
      }}
    >
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.blobA} aria-hidden />
        <div className={styles.blobB} aria-hidden />

        <div className={styles.header}>
          <div className={styles.headerText}>
            <div className={styles.titleRow}>
              <h2 id={titleId} className={styles.title}>
                {t('homeScreen.weeklyInsightsTitle')}
              </h2>
              <span className={styles.dateChip}>
                <IconCalendarToday size={14} color={Colors.dashboard.stroke} />
                {formatRangeLabel(weekly.from, weekly.to)}
              </span>
            </div>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label={t('common.close')}>
            <IconClose size={20} color={Colors.dashboard.stroke} />
          </button>
        </div>

        <div className={styles.body}>
          {/* Group 1: Összkép */}
          <section className={styles.group}>
            <div className={styles.groupHead}>
              <span className={styles.iconCircle} style={{ background: Colors.dashboard.blobPeach }}>
                <IconLocalFire size={20} color={Colors.dashboard.stroke} />
              </span>
              <h3 className={styles.groupTitle}>{t('homeScreen.weeklyGroupOverview')}</h3>
            </div>
            <div className={styles.groupBody}>
              {summary.highestDay && summary.lowestDay && loggedDays >= 2 ? (
                <>
                  <p className={styles.sectionHint}>{t('homeScreen.weeklyInsightsHighlights')}</p>
                  <div className={styles.heroPair}>
                    <button
                      type="button"
                      className={`${styles.heroCard} ${styles.heroHigh}`}
                      onClick={() => openKcalChart(summary.highestDay!.date)}
                    >
                      <span className={styles.heroLabel}>{t('homeScreen.weeklyInsightsHighest')}</span>
                      <span className={styles.heroDay}>{weekdayLabel(summary.highestDay.date)}</span>
                      <span className={styles.heroKcal}>
                        {summary.highestDay.kcal}
                        <span className={styles.heroUnit}>kcal</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`${styles.heroCard} ${styles.heroLow}`}
                      onClick={() => openKcalChart(summary.lowestDay!.date)}
                    >
                      <span className={styles.heroLabel}>{t('homeScreen.weeklyInsightsLowest')}</span>
                      <span className={styles.heroDay}>{weekdayLabel(summary.lowestDay.date)}</span>
                      <span className={styles.heroKcal}>
                        {summary.lowestDay.kcal}
                        <span className={styles.heroUnit}>kcal</span>
                      </span>
                    </button>
                  </div>
                </>
              ) : (
                <p className={styles.empty}>{t('homeScreen.weeklyInsightsNeedMoreDays')}</p>
              )}

              <div className={styles.secondaryGrid}>
                {summary.kcalRange != null && (
                  <button type="button" className={styles.miniCardBtn} onClick={() => openKcalChart()}>
                    <span className={styles.miniLabel}>{t('homeScreen.weeklyInsightsSwing')}</span>
                    <span className={styles.miniValue}>{summary.kcalRange} kcal</span>
                  </button>
                )}
                <div className={styles.miniCard}>
                  <span className={styles.miniLabel}>{t('homeScreen.weeklyEvalOnTarget')}</span>
                  <span className={styles.miniValue}>{summary.daysOnTarget}/7</span>
                </div>
                <div className={styles.miniCard}>
                  <span className={styles.miniLabel}>{t('homeScreen.weeklyInsightsTotal')}</span>
                  <span className={styles.miniValue}>{summary.totalKcal} kcal</span>
                </div>
                <div
                  className={`${styles.miniCard} ${
                    avgDelta != null && avgDelta < 0
                      ? styles.miniTintMint
                      : avgDelta != null && avgDelta > 0
                        ? styles.miniTintOrange
                        : ''
                  }`.trim()}
                >
                  <span className={styles.miniLabel}>{t('homeScreen.weeklyInsightsAvgDelta')}</span>
                  <span className={`${styles.miniValue} ${avgDeltaClass ?? ''}`.trim()}>
                    {formatDelta(avgDelta)} kcal
                  </span>
                </div>
                {summary.prevWeek && (
                  <div
                    className={`${styles.miniCard} ${
                      summary.prevWeek.deltaAvgKcal < 0
                        ? styles.miniTintMint
                        : summary.prevWeek.deltaAvgKcal > 0
                          ? styles.miniTintOrange
                          : ''
                    }`.trim()}
                  >
                    <span className={styles.miniLabel}>{t('homeScreen.weeklyInsightsAvgChange')}</span>
                    <span className={`${styles.miniValue} ${prevDeltaClass ?? ''}`.trim()}>
                      {formatDelta(summary.prevWeek.deltaAvgKcal)} kcal
                    </span>
                  </div>
                )}
                {summary.mostLoggedDay && (
                  <button
                    type="button"
                    className={styles.miniCardBtn}
                    onClick={() => openDayAndClose(summary.mostLoggedDay!.date)}
                  >
                    <span className={styles.miniLabel}>{t('homeScreen.weeklyInsightsMostLogs')}</span>
                    <span className={styles.miniValue}>
                      {weekdayLabel(summary.mostLoggedDay.date)} · {summary.mostLoggedDay.logCount}
                    </span>
                  </button>
                )}
              </div>

              {summary.bestDayVsGoal && summary.worstDayVsGoal && loggedDays >= 2 && (
                <>
                  <p className={styles.sectionHint}>{t('homeScreen.weeklyInsightsGoalDays')}</p>
                  <div className={styles.heroPair}>
                    <button
                      type="button"
                      className={`${styles.heroCard} ${styles.heroLow}`}
                      onClick={() => openKcalChart(summary.bestDayVsGoal!.date)}
                    >
                      <span className={styles.heroLabel}>{t('homeScreen.weeklyInsightsBestVsGoal')}</span>
                      <span className={styles.heroDay}>{weekdayLabel(summary.bestDayVsGoal.date)}</span>
                      <span className={styles.heroKcal}>
                        {summary.bestDayVsGoal.kcal}
                        <span className={styles.heroUnit}>kcal</span>
                      </span>
                      <span
                        className={`${styles.heroDelta} ${
                          summary.bestDayVsGoal.delta < 0
                            ? styles.miniValueMint
                            : summary.bestDayVsGoal.delta > 0
                              ? styles.miniValueOrange
                              : ''
                        }`.trim()}
                      >
                        {formatDelta(summary.bestDayVsGoal.delta)} kcal
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`${styles.heroCard} ${styles.heroHigh}`}
                      onClick={() => openKcalChart(summary.worstDayVsGoal!.date)}
                    >
                      <span className={styles.heroLabel}>{t('homeScreen.weeklyInsightsWorstVsGoal')}</span>
                      <span className={styles.heroDay}>{weekdayLabel(summary.worstDayVsGoal.date)}</span>
                      <span className={styles.heroKcal}>
                        {summary.worstDayVsGoal.kcal}
                        <span className={styles.heroUnit}>kcal</span>
                      </span>
                      <span
                        className={`${styles.heroDelta} ${
                          summary.worstDayVsGoal.delta < 0
                            ? styles.miniValueMint
                            : summary.worstDayVsGoal.delta > 0
                              ? styles.miniValueOrange
                              : ''
                        }`.trim()}
                      >
                        {formatDelta(summary.worstDayVsGoal.delta)} kcal
                      </span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Group 2: Tápanyagok */}
          <section className={styles.group}>
            <div className={styles.groupHead}>
              <span className={styles.iconCircle} style={{ background: Colors.dashboard.blobMint }}>
                <IconPieChartOutline size={20} color={Colors.dashboard.stroke} />
              </span>
              <h3 className={styles.groupTitle}>{t('homeScreen.weeklyGroupMacros')}</h3>
            </div>
            <div className={styles.groupBody}>
              <div className={styles.macroRow}>
                <MacroChip
                  type="protein"
                  value={summary.avgProtein}
                  goal={goals.dailyProteinGoal}
                  adherencePct={summary.macroAdherence?.protein}
                  compare
                  onClick={() => openMacroChart('protein')}
                />
                <MacroChip
                  type="carbs"
                  value={summary.avgCarbs}
                  goal={goals.dailyCarbsGoal}
                  adherencePct={summary.macroAdherence?.carbs}
                  compare
                  onClick={() => openMacroChart('carbs')}
                />
                <MacroChip
                  type="fat"
                  value={summary.avgFat}
                  goal={goals.dailyFatGoal}
                  adherencePct={summary.macroAdherence?.fat}
                  compare
                  onClick={() => openMacroChart('fat')}
                />
              </div>
            </div>
          </section>

          {/* Group 3: Étkezések */}
          {mealEntries.length > 0 && (
            <section className={styles.group}>
              <div className={styles.groupHead}>
                <span className={styles.iconCircle} style={{ background: Colors.dashboard.blobLavender }}>
                  <IconRestaurant size={20} color={Colors.dashboard.stroke} />
                </span>
                <h3 className={styles.groupTitle}>{t('homeScreen.weeklyGroupMeals')}</h3>
              </div>
              <div className={styles.groupBody}>
                {summary.dominantMeal && (
                  <p className={styles.dominantNote}>
                    {t('homeScreen.weeklyInsightsDominantMeal', {
                      meal: t(
                        MEAL_I18N[(summary.dominantMeal.mealType as MealType) || 'SNACK'] ??
                          'food.snack',
                      ),
                      pct: summary.dominantMeal.sharePct,
                    })}
                  </p>
                )}
                <div className={styles.mealList}>
                  {mealEntries.map((meal) => {
                    const entry = weekly.mealAvg[meal];
                    const { Icon, bg } = MEAL_META[meal];
                    const dominant = summary.dominantMeal?.mealType === meal;
                    return (
                      <button
                        key={meal}
                        type="button"
                        className={`${styles.mealRowBtn} ${dominant ? styles.mealRowDominant : ''}`.trim()}
                        onClick={() => openMealChart(meal)}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <span
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 12,
                              background: bg,
                              display: 'grid',
                              placeItems: 'center',
                              border: '1.5px solid var(--stroke, #1c1b1b)',
                              flexShrink: 0,
                            }}
                            aria-hidden
                          >
                            <Icon size={18} color={Colors.dashboard.stroke} />
                          </span>
                          <span className={styles.mealName}>{t(MEAL_I18N[meal])}</span>
                        </div>
                        <span className={styles.mealMeta}>
                          {t('homeScreen.weeklyInsightsMealAvg', {
                            kcal: Math.round(entry.kcal),
                            days: entry.daysWithMeal,
                          })}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {/* Group 4: Test + AI */}
          <section className={styles.group}>
            <div className={styles.groupHead}>
              <span className={styles.iconCircle} style={{ background: Colors.dashboard.softBlue }}>
                <IconScaleOutline size={20} color={Colors.dashboard.stroke} />
              </span>
              <h3 className={styles.groupTitle}>{t('homeScreen.weeklyGroupBodyAi')}</h3>
            </div>
            <div className={styles.groupBody}>
              {summary.body &&
                (summary.body.weightDeltaKg != null ||
                  summary.body.firstWeightKg != null ||
                  summary.body.measurements.length > 0) && (
                  <div className={styles.bodyBlock}>
                    <p className={styles.sectionHint}>{t('homeScreen.weeklyInsightsBody')}</p>
                    {(summary.body.weightDeltaKg != null || summary.body.firstWeightKg != null) && (
                      <button
                        type="button"
                        className={`${styles.weightBlock} ${styles.weightBlockFeatured}`}
                        onClick={openWeightChart}
                      >
                        <p className={styles.weightBlockTitle}>
                          {t('homeScreen.weeklyInsightsWeightRange')}
                        </p>
                        <div className={styles.compareRow}>
                          <div
                            className={styles.compareTile}
                            aria-label={t('homeScreen.weeklyInsightsStart')}
                          >
                            <span className={styles.compareTileDateRow}>
                              <IconTripOrigin size={14} color={Colors.dashboard.stroke} aria-hidden />
                              <span className={styles.compareTileDate}>
                                {shortDate(summary.body.firstWeightDate) || '—'}
                              </span>
                            </span>
                            <span className={styles.compareTileValue}>
                              {summary.body.firstWeightKg != null
                                ? `${formatKg(summary.body.firstWeightKg)} kg`
                                : '—'}
                            </span>
                          </div>
                          <span
                            className={`${styles.deltaBadge} ${
                              summary.body.weightDeltaKg != null && summary.body.weightDeltaKg < 0
                                ? styles.deltaBadgeMint
                                : summary.body.weightDeltaKg != null && summary.body.weightDeltaKg > 0
                                  ? styles.deltaBadgeOrange
                                  : styles.deltaBadgeNeutral
                            }`.trim()}
                          >
                            {summary.body.weightDeltaKg != null
                              ? `${formatDelta(summary.body.weightDeltaKg, 1)} kg`
                              : '—'}
                          </span>
                          <div
                            className={styles.compareTile}
                            aria-label={t('homeScreen.weeklyInsightsEnd')}
                          >
                            <span className={styles.compareTileDateRow}>
                              <IconFlag size={14} color={Colors.dashboard.stroke} aria-hidden />
                              <span className={styles.compareTileDate}>
                                {shortDate(summary.body.lastWeightDate) || '—'}
                              </span>
                            </span>
                            <span className={styles.compareTileValue}>
                              {summary.body.lastWeightKg != null
                                ? `${formatKg(summary.body.lastWeightKg)} kg`
                                : '—'}
                            </span>
                          </div>
                        </div>
                        <span className={styles.weightTapHint}>{t('homeScreen.weeklyWeightTap')}</span>
                      </button>
                    )}
                    {summary.body.measurements.length > 0 && (
                      <div className={styles.measureList}>
                        {summary.body.measurements.map((m) => {
                          const unchanged = Math.abs(m.deltaCm) < 0.05;
                          const label = isBodyPart(m.bodyPart)
                            ? t(BODY_PART_META[m.bodyPart].labelKey)
                            : m.bodyPart;
                          if (unchanged) {
                            return (
                              <div key={m.bodyPart} className={styles.measureStatic}>
                                <p className={styles.weightBlockTitle}>{label}</p>
                                <span className={styles.measureCurrent}>
                                  {formatCm(m.lastCm)} cm
                                </span>
                                <span className={styles.measureUnchanged}>
                                  {t('homeScreen.weeklyBodyNoChange')}
                                </span>
                              </div>
                            );
                          }
                          return (
                            <div key={m.bodyPart} className={styles.weightBlock}>
                              <p className={styles.weightBlockTitle}>{label}</p>
                              <div className={styles.compareRow}>
                                <div
                                  className={styles.compareTile}
                                  aria-label={t('homeScreen.weeklyInsightsStart')}
                                >
                                  <span className={styles.compareTileDateRow}>
                                    <IconTripOrigin
                                      size={14}
                                      color={Colors.dashboard.stroke}
                                      aria-hidden
                                    />
                                    <span className={styles.compareTileDate}>
                                      {shortDate(m.firstDate ?? null) || '—'}
                                    </span>
                                  </span>
                                  <span className={styles.compareTileValue}>
                                    {formatCm(m.firstCm)} cm
                                  </span>
                                </div>
                                <span
                                  className={`${styles.deltaBadge} ${
                                    m.deltaCm < 0
                                      ? styles.deltaBadgeMint
                                      : m.deltaCm > 0
                                        ? styles.deltaBadgeOrange
                                        : styles.deltaBadgeNeutral
                                  }`.trim()}
                                >
                                  {formatDelta(m.deltaCm, 1)} cm
                                </span>
                                <div
                                  className={styles.compareTile}
                                  aria-label={t('homeScreen.weeklyInsightsEnd')}
                                >
                                  <span className={styles.compareTileDateRow}>
                                    <IconFlag size={14} color={Colors.dashboard.stroke} aria-hidden />
                                    <span className={styles.compareTileDate}>
                                      {shortDate(m.lastDate ?? null) || '—'}
                                    </span>
                                  </span>
                                  <span className={styles.compareTileValue}>
                                    {formatCm(m.lastCm)} cm
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

              <div className={styles.panel}>
                {hasContent ? (
                  <button
                    type="button"
                    className={styles.panelHeadBtn}
                    onClick={() => setCollapsedPersist(!aiCollapsed)}
                    aria-expanded={!aiCollapsed}
                  >
                    <div>
                      <h3 className={styles.panelTitle}>{t('homeScreen.weeklyEvalAiTitle')}</h3>
                      <p className={styles.panelMeta}>
                        {t('homeScreen.weeklyEvalRemaining', { count: remaining, max: maxQuota })}
                      </p>
                    </div>
                    {aiCollapsed ? (
                      <IconExpandMore size={22} color={Colors.dashboard.stroke} />
                    ) : (
                      <IconExpandLess size={22} color={Colors.dashboard.stroke} />
                    )}
                  </button>
                ) : (
                  <div className={styles.panelHead}>
                    <div>
                      <h3 className={styles.panelTitle}>{t('homeScreen.weeklyEvalAiTitle')}</h3>
                      <p className={styles.panelMeta}>
                        {t('homeScreen.weeklyEvalRemaining', { count: remaining, max: maxQuota })}
                      </p>
                    </div>
                  </div>
                )}

                {error && <p className={styles.error}>{error}</p>}
                {!parsed && <p className={styles.empty}>{t('homeScreen.weeklyEvalEmpty')}</p>}

                {hasContent && aiCollapsed && (
                  <>
                    {previewText && <p className={styles.preview}>{previewText}</p>}
                    <p className={styles.expandHint}>{t('homeScreen.weeklyEvalExpand')}</p>
                  </>
                )}

                {hasContent && !aiCollapsed && (
                  <>
                    {parsed?.kind === 'structured' && (
                      <div className={styles.analysisBox}>
                        <AnalysisResultView
                          data={parsed.data}
                          hideMeals
                          summaryTitle={t('homeScreen.weeklyEvalSummary')}
                          suggestionsTitle={t('homeScreen.weeklyEvalSuggestions')}
                        />
                      </div>
                    )}
                    {parsed?.kind === 'plain' && <p className={styles.empty}>{parsed.text}</p>}
                  </>
                )}

                {(!hasContent || !aiCollapsed) && (
                  <div className={styles.ctaWrap}>
                    <span className={styles.ctaShadow} aria-hidden />
                    <button
                      type="button"
                      className={styles.cta}
                      onClick={handleGenerate}
                      disabled={!canGenerate}
                    >
                      {busy || analysisLoading
                        ? t('homeScreen.weeklyEvalAnalyzing')
                        : t('homeScreen.weeklyEvalStart')}
                    </button>
                  </div>
                )}
                {loggedDays < 2 && (
                  <p className={styles.hint}>{t('homeScreen.weeklyInsightsNeedMoreDays')}</p>
                )}
                {loggedDays >= 2 && remaining <= 0 && (
                  <p className={styles.hint}>{t('homeScreen.weeklyEvalLimit')}</p>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>

      <WeeklyMetricChartSheet
        open={!!chartSpec}
        spec={chartSpec}
        onClose={() => setChartSpec(null)}
        onOpenDay={openDayAndClose}
      />
    </div>
  );
}
