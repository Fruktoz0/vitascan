import { useCallback, useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { AnalysisResultView } from './AnalysisResult';
import { MacroChip } from '../ui/MacroBar';
import { IconClose } from '../ui/Icons';
import { Colors } from '../../design/tokens';
import {
  analysisApi,
  ApiError,
  type DailyAnalysisResult,
  type WeeklyStatsResult,
} from '../../services/api';
import { parseAnalysisContent } from '../../utils/parseAnalysisContent';
import { MEAL_META, type MealType } from '../../utils/mealMeta';
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

  const summary = weekly.summary;
  const goals = weekly.goals;
  const remaining = analysis?.remaining ?? 2;
  const loggedDays = summary?.loggedDays ?? 0;
  const canGenerate = loggedDays >= 2 && remaining > 0 && !busy && !analysisLoading;

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

  const parsed = parseAnalysisContent(analysis?.content);
  const mealEntries = MEAL_ORDER.filter((m) => (weekly.mealAvg?.[m]?.daysWithMeal ?? 0) > 0);

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
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label={t('common.close', 'Bezárás')}>
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

          <section>
            <h3 className={styles.sectionTitle}>{t('homeScreen.weeklyInsightsMacros')}</h3>
            <div className={styles.macroRow}>
              <MacroChip type="protein" value={summary.avgProtein} goal={goals.dailyProteinGoal} />
              <MacroChip type="carbs" value={summary.avgCarbs} goal={goals.dailyCarbsGoal} />
              <MacroChip type="fat" value={summary.avgFat} goal={goals.dailyFatGoal} />
            </div>
          </section>

          {mealEntries.length > 0 && (
            <section>
              <h3 className={styles.sectionTitle}>{t('homeScreen.weeklyInsightsMeals')}</h3>
              <div className={styles.mealList}>
                {mealEntries.map((meal) => {
                  const entry = weekly.mealAvg[meal];
                  const { Icon, bg } = MEAL_META[meal];
                  return (
                    <div key={meal} className={styles.mealRow}>
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

          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <h3 className={styles.panelTitle}>{t('homeScreen.weeklyEvalAiTitle')}</h3>
                <p className={styles.panelMeta}>
                  {t('homeScreen.weeklyEvalRemaining', { count: remaining })}
                </p>
              </div>
            </div>

            {error && <p className={styles.error}>{error}</p>}

            {!parsed && (
              <p className={styles.empty}>{t('homeScreen.weeklyEvalEmpty')}</p>
            )}

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
            {parsed?.kind === 'plain' && (
              <p className={styles.empty}>{parsed.text}</p>
            )}

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
