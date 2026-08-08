import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { Colors } from '../../design/tokens';
import { IconRefresh } from '../ui/Icons';
import { analysisApi, ApiError } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { useTierStore } from '../../stores/tierStore';
import { MEAL_META, type MealType } from '../../utils/mealMeta';
import { HOME_MEALS, sumMeal } from '../../utils/mealInsights';
import { isMealSuggestRelevant } from '../../utils/mealSuggestTime';
import {
  parseMealSuggestContent,
  type MealSuggestContent,
  type MealSuggestIdea,
  type MealSuggestSlot,
} from '../../utils/parseMealSuggestContent';
import styles from './MealSuggestStories.module.css';

const MEAL_LABEL_KEY: Record<MealType, string> = {
  BREAKFAST: 'food.breakfast',
  TIZORAI: 'food.tizorai',
  LUNCH: 'food.lunch',
  UZSONNA: 'food.uzsonna',
  DINNER: 'food.dinner',
  SNACK: 'food.snack',
};

type Totals = { kcal: number; protein: number; carbs: number; fat: number };
type Goals = {
  dailyKcalGoal: number;
  dailyProteinGoal?: number | null;
  dailyCarbsGoal?: number | null;
  dailyFatGoal?: number | null;
};

type Props = {
  dateStr: string;
  isToday: boolean;
  totals: Totals;
  goals: Goals;
  byMealType: Record<string, unknown[] | undefined>;
};

function emptyMealsFromLog(byMealType: Record<string, unknown[] | undefined>): MealType[] {
  const all: MealType[] = [...HOME_MEALS, 'SNACK'];
  return all.filter((m) => sumMeal(byMealType[m] as any).kcal <= 0);
}

function estimateAmountG(idea: MealSuggestIdea): number {
  if (!idea.kcal || idea.kcal <= 0) return 100;
  return Math.max(50, Math.min(400, Math.round(idea.kcal / 1.5)));
}

export default function MealSuggestStories({
  dateStr,
  isToday,
  totals,
  goals,
  byMealType,
}: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  const tier = useTierStore((s) => s.status?.tier);
  const fetchTier = useTierStore((s) => s.fetch);

  const isAdmin = role === 'ADMIN';
  const isPremium = tier === 'PREMIUM';
  const maxRefresh: number | null = isAdmin ? null : isPremium ? 1 : 0;

  const scrollerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshingMeal, setRefreshingMeal] = useState<MealType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState<MealSuggestContent | null>(null);
  const generateOnceRef = useRef<string | null>(null);
  const nowHour = new Date().getHours();

  const remaining = useMemo(() => {
    const kcal = Math.round((goals.dailyKcalGoal ?? 0) - (totals.kcal ?? 0));
    return { kcal };
  }, [goals, totals]);

  const emptyMeals = useMemo(() => emptyMealsFromLog(byMealType), [byMealType]);

  const upcomingEmpty = useMemo(
    () => emptyMeals.filter((m) => isMealSuggestRelevant(m, nowHour)),
    [emptyMeals, nowHour],
  );

  const visibleSuggestions: MealSuggestSlot[] = useMemo(
    () =>
      (content?.suggestions ?? []).filter((s) => {
        const logs = byMealType[s.mealType] as any;
        return sumMeal(logs).kcal <= 0 && isMealSuggestRelevant(s.mealType, nowHour);
      }),
    [content, byMealType, nowHour],
  );

  const applyResult = (raw: string | null | undefined) => {
    setContent(parseMealSuggestContent(raw));
  };

  const load = useCallback(async () => {
    if (!isToday) {
      setContent(null);
      return;
    }
    if (upcomingEmpty.length === 0) {
      setContent(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await fetchTier();
      const locale = i18n.language?.startsWith('en') ? 'en' : 'hu';
      const cached = await analysisApi.get(dateStr, 'mealSuggest');
      const parsed = parseMealSuggestContent(cached.content);
      const cachedRelevant = (parsed?.suggestions ?? []).filter((s) =>
        isMealSuggestRelevant(s.mealType, nowHour),
      );

      if (cached.content && cachedRelevant.length === 0) {
        const generated = await analysisApi.generate(dateStr, locale, 'mealSuggest', undefined, {
          force: true,
        });
        applyResult(generated.content);
        generateOnceRef.current = dateStr;
        return;
      }

      if (cached.content) {
        applyResult(cached.content);
        generateOnceRef.current = dateStr;
        return;
      }

      if (generateOnceRef.current === dateStr) return;
      generateOnceRef.current = dateStr;
      const generated = await analysisApi.generate(dateStr, locale, 'mealSuggest');
      applyResult(generated.content);
    } catch (err) {
      generateOnceRef.current = null;
      setError(err instanceof ApiError ? err.message : t('homeScreen.mealSuggestError'));
    } finally {
      setLoading(false);
    }
  }, [dateStr, isToday, upcomingEmpty.length, fetchTier, t, nowHour]);

  useEffect(() => {
    generateOnceRef.current = null;
    void load();
  }, [load]);

  useEffect(() => {
    setActive(0);
    scrollerRef.current?.scrollTo({ left: 0 });
  }, [visibleSuggestions]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => {
      const w = el.clientWidth;
      if (w <= 0) return;
      const idx = Math.round(el.scrollLeft / (w * 0.9));
      setActive(Math.max(0, Math.min(visibleSuggestions.length - 1, idx)));
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [visibleSuggestions.length]);

  const openAiPrefill = (slot: MealSuggestSlot, idea?: MealSuggestIdea) => {
    const chosen = idea ?? slot.ideas[0];
    if (!chosen) return;
    navigate(`/ai-recognize?mealType=${slot.mealType}`, {
      state: {
        returnPath: '/home',
        prefillSuggestion: {
          dishName: chosen.name,
          ingredients: [
            {
              name: chosen.name,
              amountG: estimateAmountG(chosen),
              kcal: chosen.kcal,
              protein: chosen.protein,
              carbs: chosen.carbs,
              fat: chosen.fat,
              note: chosen.note,
            },
          ],
        },
      },
    });
  };

  const handleRefresh = async (meal: MealType) => {
    if (maxRefresh === 0) {
      navigate('/data-vault');
      return;
    }
    const used = content?.refreshByMeal?.[meal] ?? 0;
    if (maxRefresh != null && used >= maxRefresh) return;

    setRefreshingMeal(meal);
    setError(null);
    try {
      const locale = i18n.language?.startsWith('en') ? 'en' : 'hu';
      const res = await analysisApi.generate(dateStr, locale, 'mealSuggest', meal);
      applyResult(res.content);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        navigate('/data-vault');
        return;
      }
      setError(err instanceof ApiError ? err.message : t('homeScreen.mealSuggestError'));
    } finally {
      setRefreshingMeal(null);
    }
  };

  if (!isToday) return null;

  if (upcomingEmpty.length === 0 && emptyMeals.length === 0) {
    return (
      <div className={styles.root}>
        <div className={styles.emptyFace}>{t('homeScreen.mealSuggestAllDone')}</div>
      </div>
    );
  }

  if (upcomingEmpty.length === 0) {
    return (
      <div className={styles.root}>
        <div className={styles.emptyFace}>{t('homeScreen.mealSuggestDayDone')}</div>
      </div>
    );
  }

  if (remaining.kcal <= 0 && visibleSuggestions.length === 0 && !loading) {
    return (
      <div className={styles.root}>
        <div className={styles.emptyFace}>{t('homeScreen.mealSuggestGoalReached')}</div>
      </div>
    );
  }

  if (loading && visibleSuggestions.length === 0) {
    return (
      <div className={styles.root}>
        <div className={styles.loadingWrap}>
          <div className="spinner" />
          <span>{t('homeScreen.mealSuggestLoading')}</span>
        </div>
      </div>
    );
  }

  if (error && visibleSuggestions.length === 0) {
    return (
      <div className={styles.root}>
        <p className={styles.errorText}>{error}</p>
      </div>
    );
  }

  if (visibleSuggestions.length === 0) return null;

  return (
    <div className={styles.root}>
      {error && <p className={styles.errorText}>{error}</p>}
      <div className={styles.scroller} ref={scrollerRef}>
        {visibleSuggestions.map((slot) => {
          const MealIcon = MEAL_META[slot.mealType]?.Icon;
          const used = content?.refreshByMeal?.[slot.mealType] ?? 0;
          const canRefresh = maxRefresh === null || used < (maxRefresh ?? 0);
          const showPremiumHint = maxRefresh === 0;
          const showUsed = maxRefresh === 1 && used >= 1;

          return (
            <div key={slot.mealType} className={styles.card}>
              <div className={styles.cardFace}>
                <div className={styles.cardTop}>
                  <div className={styles.labelRow}>
                    {MealIcon && (
                      <span
                        className={styles.mealIcon}
                        style={{ background: MEAL_META[slot.mealType].bg }}
                      >
                        <MealIcon size={14} color={Colors.dashboard.stroke} />
                      </span>
                    )}
                    <span className={styles.label}>{t(MEAL_LABEL_KEY[slot.mealType])}</span>
                  </div>
                  {showPremiumHint ? (
                    <button
                      type="button"
                      className={`${styles.refreshBtn} ${styles.refreshBtnPremium}`}
                      onClick={() => navigate('/data-vault')}
                      aria-label={t('homeScreen.mealSuggestRefreshPremiumOnly')}
                    >
                      Premium
                    </button>
                  ) : canRefresh ? (
                    <button
                      type="button"
                      className={styles.refreshBtn}
                      disabled={refreshingMeal === slot.mealType}
                      onClick={() => void handleRefresh(slot.mealType)}
                      aria-label={t('homeScreen.mealSuggestRefresh')}
                    >
                      {refreshingMeal === slot.mealType ? (
                        <span className="spinner" style={{ width: 14, height: 14 }} />
                      ) : (
                        <IconRefresh size={16} color={Colors.dashboard.stroke} />
                      )}
                    </button>
                  ) : showUsed ? (
                    <span className={styles.refreshUsed}>
                      {t('homeScreen.mealSuggestRefreshUsed')}
                    </span>
                  ) : null}
                </div>

                <div className={styles.cardTitle}>{slot.title}</div>

                {slot.ideas.map((idea) => (
                  <button
                    key={idea.name}
                    type="button"
                    className={styles.idea}
                    onClick={() => openAiPrefill(slot, idea)}
                  >
                    <span className={styles.ideaName}>{idea.name}</span>
                    <span className={styles.ideaMacros}>
                      ~{idea.kcal} kcal · F {Math.round(idea.protein)} · Sz{' '}
                      {Math.round(idea.carbs)} · Zs {Math.round(idea.fat)}
                    </span>
                    {idea.note && <span className={styles.ideaNote}>{idea.note}</span>}
                  </button>
                ))}

                <button
                  type="button"
                  className={styles.addBtn}
                  onClick={() => openAiPrefill(slot)}
                >
                  {t('homeScreen.mealSuggestAdd')}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {visibleSuggestions.length > 1 && (
        <div className={styles.dots} aria-hidden>
          {visibleSuggestions.map((s, i) => (
            <span
              key={s.mealType}
              className={`${styles.dot} ${i === active ? styles.dotActive : ''}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
