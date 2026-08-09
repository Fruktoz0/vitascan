import { useCallback, useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { AnalysisResultView } from './AnalysisResult';
import { MacroChip } from '../ui/MacroBar';
import { IconClose, IconExpandLess, IconExpandMore } from '../ui/Icons';
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

function formatDelta(n: number): string {
  return n > 0 ? `+${n}` : String(n);
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
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

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

  const handlePickDay = useCallback(
    (dateStr: string) => {
      onSelectDate(parseLocalDate(dateStr));
      onClose();
    },
    [onClose, onSelectDate],
  );

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setBusy(true);
    setError(null);
    try {
      const locale = i18n.language?.startsWith('en') ? 'en' : 'hu';
      const result = await analysisApi.generate(weekly.to, locale, 'weeklyNutrition');
      onAnalysisChange(result);
      // Keep collapsed if user already collapsed this week
      const stored = await getItem(collapseKey(weekly.to));
      if (stored === '1') setAiCollapsed(true);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          setError(t('homeScreen.weeklyEvalLimit'));
        } else {
          setError(err.message || t('homeScreen.weeklyEvalError'));
        }
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
        if (e.target === e.currentTarget) onClose();
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
            <h2 id={titleId} className={styles.title}>
              {t('homeScreen.weeklyInsightsTitle')}
            </h2>
            <p className={styles.range}>
              {weekly.from} → {weekly.to}
            </p>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label={t('common.close')}>
            <IconClose size={20} color={Colors.dashboard.stroke} />
          </button>
        </div>

        <div className={styles.body}>
          {summary.highestDay && summary.lowestDay && loggedDays >= 2 ? (
            <section>
              <h3 className={styles.sectionTitle}>{t('homeScreen.weeklyInsightsHighlights')}</h3>
              <div className={styles.heroPair}>
                <button
                  type="button"
                  className={`${styles.heroCard} ${styles.heroHigh}`}
                  onClick={() => handlePickDay(summary.highestDay!.date)}
                >
                  <span className={styles.heroLabel}>{t('homeScreen.weeklyInsightsHighest')}</span>
                  <span className={styles.heroDay}>{weekdayLabel(summary.highestDay.date)}</span>
                  <span className={styles.heroKcal}>{summary.highestDay.kcal} kcal</span>
                </button>
                <button
                  type="button"
                  className={`${styles.heroCard} ${styles.heroLow}`}
                  onClick={() => handlePickDay(summary.lowestDay!.date)}
                >
                  <span className={styles.heroLabel}>{t('homeScreen.weeklyInsightsLowest')}</span>
                  <span className={styles.heroDay}>{weekdayLabel(summary.lowestDay.date)}</span>
                  <span className={styles.heroKcal}>{summary.lowestDay.kcal} kcal</span>
                </button>
              </div>
            </section>
          ) : (
            <p className={styles.empty}>{t('homeScreen.weeklyInsightsNeedMoreDays')}</p>
          )}

          <section>
            <div className={styles.secondaryGrid}>
              {summary.kcalRange != null && (
                <div className={styles.miniCard}>
                  <span className={styles.miniLabel}>{t('homeScreen.weeklyInsightsRange')}</span>
                  <span className={styles.miniValue}>{summary.kcalRange} kcal</span>
                </div>
              )}
              <div className={styles.miniCard}>
                <span className={styles.miniLabel}>{t('homeScreen.weeklyEvalOnTarget')}</span>
                <span className={styles.miniValue}>{summary.daysOnTarget}/7</span>
              </div>
              <div className={styles.miniCard}>
                <span className={styles.miniLabel}>{t('homeScreen.weeklyInsightsTotal')}</span>
                <span className={styles.miniValue}>{summary.totalKcal} kcal</span>
              </div>
              {summary.emptyDays != null && (
                <div className={styles.miniCard}>
                  <span className={styles.miniLabel}>{t('homeScreen.weeklyInsightsEmptyDays')}</span>
                  <span className={styles.miniValue}>{summary.emptyDays}</span>
                </div>
              )}
              {summary.prevWeek && (
                <div className={styles.miniCard}>
                  <span className={styles.miniLabel}>{t('homeScreen.weeklyInsightsVsPrev')}</span>
                  <span className={`${styles.miniValue} ${prevDeltaClass ?? ''}`.trim()}>
                    {formatDelta(summary.prevWeek.deltaAvgKcal)} kcal
                  </span>
                </div>
              )}
              {summary.mostLoggedDay && (
                <button
                  type="button"
                  className={styles.miniCard}
                  style={{ cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'inherit' }}
                  onClick={() => handlePickDay(summary.mostLoggedDay!.date)}
                >
                  <span className={styles.miniLabel}>{t('homeScreen.weeklyInsightsMostLogs')}</span>
                  <span className={styles.miniValue}>
                    {weekdayLabel(summary.mostLoggedDay.date)} · {summary.mostLoggedDay.logCount}
                  </span>
                </button>
              )}
            </div>
          </section>

          {summary.bestDayVsGoal && summary.worstDayVsGoal && loggedDays >= 2 && (
            <section>
              <h3 className={styles.sectionTitle}>{t('homeScreen.weeklyInsightsGoalDays')}</h3>
              <div className={styles.heroPair}>
                <button
                  type="button"
                  className={`${styles.heroCard} ${styles.heroLow}`}
                  onClick={() => handlePickDay(summary.bestDayVsGoal!.date)}
                >
                  <span className={styles.heroLabel}>{t('homeScreen.weeklyInsightsBestVsGoal')}</span>
                  <span className={styles.heroDay}>{weekdayLabel(summary.bestDayVsGoal.date)}</span>
                  <span className={styles.heroKcal}>
                    {summary.bestDayVsGoal.kcal} · {formatDelta(summary.bestDayVsGoal.delta)}
                  </span>
                </button>
                <button
                  type="button"
                  className={`${styles.heroCard} ${styles.heroHigh}`}
                  onClick={() => handlePickDay(summary.worstDayVsGoal!.date)}
                >
                  <span className={styles.heroLabel}>{t('homeScreen.weeklyInsightsWorstVsGoal')}</span>
                  <span className={styles.heroDay}>{weekdayLabel(summary.worstDayVsGoal.date)}</span>
                  <span className={styles.heroKcal}>
                    {summary.worstDayVsGoal.kcal} · {formatDelta(summary.worstDayVsGoal.delta)}
                  </span>
                </button>
              </div>
            </section>
          )}

          <section>
            <h3 className={styles.sectionTitle}>{t('homeScreen.weeklyInsightsMacros')}</h3>
            <div className={styles.macroRow}>
              <MacroChip type="protein" value={summary.avgProtein} goal={goals.dailyProteinGoal} />
              <MacroChip type="carbs" value={summary.avgCarbs} goal={goals.dailyCarbsGoal} />
              <MacroChip type="fat" value={summary.avgFat} goal={goals.dailyFatGoal} />
            </div>
            {summary.macroAdherence && (
              <div className={styles.macroAdherence}>
                {summary.macroAdherence.protein != null && (
                  <span className={styles.adherenceChip}>
                    {t('food.protein')}: {summary.macroAdherence.protein}%
                  </span>
                )}
                {summary.macroAdherence.carbs != null && (
                  <span className={styles.adherenceChip}>
                    {t('food.carbs')}: {summary.macroAdherence.carbs}%
                  </span>
                )}
                {summary.macroAdherence.fat != null && (
                  <span className={styles.adherenceChip}>
                    {t('food.fat')}: {summary.macroAdherence.fat}%
                  </span>
                )}
              </div>
            )}
          </section>

          {mealEntries.length > 0 && (
            <section>
              <h3 className={styles.sectionTitle}>{t('homeScreen.weeklyInsightsMeals')}</h3>
              {summary.dominantMeal && (
                <p className={styles.empty} style={{ marginBottom: 8 }}>
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
                    <div
                      key={meal}
                      className={`${styles.mealRow} ${dominant ? styles.mealRowDominant : ''}`.trim()}
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
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {summary.body && (
            <section>
              <h3 className={styles.sectionTitle}>{t('homeScreen.weeklyInsightsBody')}</h3>
              <div className={styles.secondaryGrid}>
                {summary.body.weightDeltaKg != null && (
                  <div className={styles.miniCard}>
                    <span className={styles.miniLabel}>{t('homeScreen.weeklyInsightsWeightDelta')}</span>
                    <span
                      className={`${styles.miniValue} ${
                        summary.body.weightDeltaKg < 0
                          ? styles.miniValueMint
                          : summary.body.weightDeltaKg > 0
                            ? styles.miniValueOrange
                            : ''
                      }`.trim()}
                    >
                      {formatDelta(summary.body.weightDeltaKg)} kg
                    </span>
                  </div>
                )}
                {summary.body.firstWeightKg != null && summary.body.lastWeightKg != null && (
                  <div className={styles.miniCard}>
                    <span className={styles.miniLabel}>{t('homeScreen.weeklyInsightsWeightRange')}</span>
                    <span className={styles.miniValue}>
                      {summary.body.firstWeightKg} → {summary.body.lastWeightKg} kg
                    </span>
                  </div>
                )}
              </div>
              {summary.body.measurements.length > 0 && (
                <div className={styles.mealList} style={{ marginTop: 8 }}>
                  {summary.body.measurements.map((m) => (
                    <div key={m.bodyPart} className={styles.mealRow}>
                      <span className={styles.mealName}>
                        {isBodyPart(m.bodyPart)
                          ? t(BODY_PART_META[m.bodyPart].labelKey)
                          : m.bodyPart}
                      </span>
                      <span className={styles.mealMeta}>
                        {m.firstCm} → {m.lastCm} cm ({formatDelta(m.deltaCm)})
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          <section className={styles.panel}>
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
          </section>
        </div>
      </div>
    </div>
  );
}
