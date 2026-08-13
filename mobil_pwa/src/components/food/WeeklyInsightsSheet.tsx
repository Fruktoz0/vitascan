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
  IconLockOutline,
  IconPieChartOutline,
  IconRestaurant,
  IconScaleOutline,
  IconTripOrigin,
} from '../ui/Icons';
import { Colors } from '../../design/tokens';
import {
  analysisApi,
  ApiError,
  statsApi,
  type DailyAnalysisResult,
  type WeeklyStatsResult,
} from '../../services/api';
import { getItem, setItem, deleteItem } from '../../services/storage';
import { parseAnalysisContent } from '../../utils/parseAnalysisContent';
import { MEAL_META, type MealType } from '../../utils/mealMeta';
import { BODY_PART_META, isBodyPart } from '../../utils/bodyMeta';
import { useTierStore } from '../../stores/tierStore';
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

function mondayOf(d: Date): Date {
  const x = new Date(d);
  x.setHours(12, 0, 0, 0);
  const dow = x.getDay();
  x.setDate(x.getDate() + (dow === 0 ? -6 : 1 - dow));
  x.setHours(0, 0, 0, 0);
  return x;
}

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

type WeekOption = { from: string; to: string; weeksBack: number; weekNum: number; monthKey: string };

function isoWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function eachYmd(from: string, to: string): string[] {
  const out: string[] = [];
  const d = parseLocalDate(from);
  const end = parseLocalDate(to);
  while (d.getTime() <= end.getTime()) {
    out.push(formatYmd(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function buildWeekOptions(count = 24): WeekOption[] {
  const currentMon = mondayOf(new Date());
  const weeks: WeekOption[] = [];
  for (let i = 0; i < count; i++) {
    const start = new Date(currentMon);
    start.setDate(start.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    weeks.push({
      from: formatYmd(start),
      to: formatYmd(end),
      weeksBack: i,
      weekNum: isoWeekNumber(start),
      monthKey: `${start.getFullYear()}-${start.getMonth()}`,
    });
  }
  return weeks;
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
  weekly: homeWeekly,
  analysis: homeAnalysis,
  analysisLoading: homeAnalysisLoading,
  onClose,
  onSelectDate,
  onAnalysisChange,
}: Props) {
  const { t } = useTranslation();
  const titleId = useId();
  const { fetch: fetchTier, isPremium } = useTierStore();
  const [weekly, setWeekly] = useState<WeeklyStatsResult>(homeWeekly);
  const [analysis, setAnalysis] = useState<DailyAnalysisResult | null>(homeAnalysis);
  const [analysisLoading, setAnalysisLoading] = useState(homeAnalysisLoading);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiCollapsed, setAiCollapsed] = useState(false);
  const [chartSpec, setChartSpec] = useState<WeeklyChartSpec | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [weekLoading, setWeekLoading] = useState(false);
  const [loggedDateSet, setLoggedDateSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setWeekly(homeWeekly);
    setAnalysis(homeAnalysis);
    setAnalysisLoading(homeAnalysisLoading);
    setPickerOpen(false);
    setError(null);
    fetchTier();
  }, [open]);

  useEffect(() => {
    if (!pickerOpen) return;
    let cancelled = false;
    const weeks = buildWeekOptions();
    const months = new Map<string, { year: number; month: number }>();
    for (const w of weeks) {
      const from = parseLocalDate(w.from);
      const to = parseLocalDate(w.to);
      months.set(`${from.getFullYear()}-${from.getMonth() + 1}`, {
        year: from.getFullYear(),
        month: from.getMonth() + 1,
      });
      months.set(`${to.getFullYear()}-${to.getMonth() + 1}`, {
        year: to.getFullYear(),
        month: to.getMonth() + 1,
      });
    }
    Promise.all([...months.values()].map(({ year, month }) => statsApi.loggedDays(year, month).catch(() => ({ dates: [] as string[] }))))
      .then((results) => {
        if (cancelled) return;
        setLoggedDateSet(new Set(results.flatMap((r) => r.dates)));
      });
    return () => {
      cancelled = true;
    };
  }, [pickerOpen]);

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
      if (e.key !== 'Escape') return;
      if (pickerOpen) {
        setPickerOpen(false);
        return;
      }
      if (!chartSpec) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, chartSpec, pickerOpen]);

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
      setAnalysis(result);
      if (weekly.from === homeWeekly.from) onAnalysisChange(result);
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

  const selectWeek = async (opt: WeekOption) => {
    if (opt.weeksBack > 1 && !isPremium()) return;
    if (opt.from === weekly.from) {
      setPickerOpen(false);
      return;
    }
    setWeekLoading(true);
    setError(null);
    try {
      const next = await statsApi.weekly({ weekStart: opt.from });
      setWeekly(next);
      setPickerOpen(false);
      setAnalysisLoading(true);
      try {
        const wa = await analysisApi.get(next.to, 'weeklyNutrition').catch(() => null);
        setAnalysis(wa);
      } finally {
        setAnalysisLoading(false);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError(t('premiumMeta.fullHistoryDesc'));
      } else {
        setError(t('homeScreen.weeklyEvalError'));
      }
    } finally {
      setWeekLoading(false);
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
          <span className={styles.headerSpacer} aria-hidden />
          <button
            type="button"
            id={titleId}
            className={styles.dateChip}
            onClick={() => setPickerOpen(true)}
            disabled={weekLoading}
            aria-haspopup="listbox"
            aria-expanded={pickerOpen}
            aria-label={t('homeScreen.weeklyPickWeek')}
          >
            <IconCalendarToday size={18} color={Colors.dashboard.stroke} />
            <span>{formatRangeLabel(weekly.from, weekly.to)}</span>
            <IconExpandMore size={18} color={Colors.dashboard.stroke} />
          </button>
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

        {pickerOpen && (
          <div
            className={styles.pickerOverlay}
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) setPickerOpen(false);
            }}
          >
            <div className={styles.pickerSheet} role="listbox" aria-label={t('homeScreen.weeklyPickWeek')}>
              <div className={styles.pickerHead}>
                <h3 className={styles.pickerTitle}>{t('homeScreen.weeklyPickWeek')}</h3>
                <button
                  type="button"
                  className={styles.closeBtn}
                  onClick={() => setPickerOpen(false)}
                  aria-label={t('common.close')}
                >
                  <IconClose size={20} color={Colors.dashboard.stroke} />
                </button>
              </div>
              <div className={styles.pickerList}>
                {buildWeekOptions().map((opt, index, all) => {
                  const locked = opt.weeksBack > 1 && !isPremium();
                  const selected = opt.from === weekly.from;
                  const hasLog = eachYmd(opt.from, opt.to).some((d) => loggedDateSet.has(d));
                  const prev = index > 0 ? all[index - 1] : null;
                  const showMonth = !prev || prev.monthKey !== opt.monthKey;
                  const monthLabel = parseLocalDate(opt.from).toLocaleDateString(
                    i18n.language === 'hu' ? 'hu-HU' : 'en-US',
                    { month: 'long', year: 'numeric' },
                  );
                  return (
                    <div key={opt.from} className={styles.pickerBlock}>
                      {showMonth ? (
                        <div className={styles.pickerMonth} aria-hidden={false}>
                          <span className={styles.pickerMonthLine} />
                          <span className={styles.pickerMonthLabel}>{monthLabel}</span>
                          <span className={styles.pickerMonthLine} />
                        </div>
                      ) : null}
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className={`${styles.pickerItem} ${selected ? styles.pickerItemSelected : ''} ${locked ? styles.pickerItemLocked : ''}`.trim()}
                        disabled={weekLoading}
                        onClick={() => selectWeek(opt)}
                      >
                        <span className={styles.pickerRange}>
                          <span className={styles.pickerWeekNum}>
                            {t('homeScreen.weeklyWeekNumber', { n: opt.weekNum })}
                          </span>
                          <span className={styles.pickerDates}>{formatRangeLabel(opt.from, opt.to)}</span>
                          {opt.weeksBack === 0 ? (
                            <span className={styles.pickerBadge}>{t('homeScreen.weeklyThisWeek')}</span>
                          ) : null}
                        </span>
                        <span className={styles.pickerEnd}>
                          {hasLog ? <span className={styles.pickerLoggedDot} aria-hidden /> : null}
                          {locked ? (
                            <IconLockOutline size={18} color={Colors.dashboard.stroke} />
                          ) : null}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
              {!isPremium() && (
                <p className={styles.pickerHint}>{t('homeScreen.weeklyLockedWeek')}</p>
              )}
            </div>
          </div>
        )}
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
