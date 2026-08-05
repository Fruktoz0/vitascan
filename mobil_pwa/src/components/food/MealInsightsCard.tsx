import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GlassCardSimple } from '../ui/GlassCard';
import KcalRing from '../ui/KcalRing';
import { IconAdd, IconRestaurant } from '../ui/Icons';
import { Colors } from '../../design/tokens';
import { MEAL_META, type MealType } from '../../utils/mealMeta';
import {
  HOME_MEALS,
  computeMealInsight,
  macroEnergyShares,
  mealKcalGoal,
  mealShareOfDay,
  pickDefaultMeal,
  sumMeal,
  type MealAvgEntry,
  type LogLike,
} from '../../utils/mealInsights';
import styles from './MealInsightsCard.module.css';

const MEAL_LABEL_KEY: Record<MealType, string> = {
  BREAKFAST: 'food.breakfast',
  TIZORAI: 'food.tizorai',
  LUNCH: 'food.lunch',
  UZSONNA: 'food.uzsonna',
  DINNER: 'food.dinner',
  SNACK: 'food.snack',
};

type Props = {
  byMealType: Record<string, LogLike[] | undefined>;
  dayKcal: number;
  dailyKcalGoal: number;
  weekAvgKcal?: number | null;
  mealAvg?: Record<string, MealAvgEntry> | null;
  isToday: boolean;
  onOpenDiary: (meal?: MealType) => void;
  onAddMeal: (meal: MealType) => void;
};

export default function MealInsightsCard({
  byMealType,
  dayKcal,
  dailyKcalGoal,
  weekAvgKcal,
  mealAvg,
  isToday,
  onOpenDiary,
  onAddMeal,
}: Props) {
  const { t } = useTranslation();
  const [selectedMeal, setSelectedMeal] = useState<MealType | null>(null);

  const mealTotals = useMemo(() => {
    const map: Record<MealType, ReturnType<typeof sumMeal>> = {} as any;
    for (const meal of HOME_MEALS) {
      map[meal] = sumMeal(byMealType[meal]);
    }
    return map;
  }, [byMealType]);

  useEffect(() => {
    setSelectedMeal(pickDefaultMeal(byMealType));
  }, [byMealType]);

  const insight = useMemo(
    () =>
      computeMealInsight({
        byMeal: byMealType,
        dayKcal,
        weekAvgKcal,
        mealAvg,
        isToday,
        nowHour: new Date().getHours(),
      }),
    [byMealType, dayKcal, weekAvgKcal, mealAvg, isToday],
  );

  const selectedTotals = selectedMeal ? mealTotals[selectedMeal] : null;
  const macroShares = selectedTotals ? macroEnergyShares(selectedTotals) : null;

  const insightText = (() => {
    switch (insight.kind) {
      case 'empty':
        return t('homeScreen.insightEmpty');
      case 'missingMeal':
        return t('homeScreen.insightMissingMeal', {
          meal: insight.meal ? t(MEAL_LABEL_KEY[insight.meal]) : '',
        });
      case 'vsWeekAvg':
        return insight.heavier
          ? t('homeScreen.insightVsWeekHigher', { kcal: insight.deltaKcal })
          : t('homeScreen.insightVsWeekLower', { kcal: insight.deltaKcal });
      case 'vsMealAvg':
        return insight.heavier
          ? t('homeScreen.insightVsMealHigher', {
              meal: insight.meal ? t(MEAL_LABEL_KEY[insight.meal]) : '',
              pct: insight.deltaPct,
            })
          : t('homeScreen.insightVsMealLower', {
              meal: insight.meal ? t(MEAL_LABEL_KEY[insight.meal]) : '',
              pct: insight.deltaPct,
            });
      case 'largestMeal':
        return t('homeScreen.insightLargestMeal', {
          meal: insight.meal ? t(MEAL_LABEL_KEY[insight.meal]) : '',
          kcal: insight.kcal,
          pct: insight.pct,
        });
      default:
        return '';
    }
  })();

  const handleCellTap = (meal: MealType) => {
    const empty = mealTotals[meal].kcal <= 0 && (byMealType[meal]?.length ?? 0) === 0;
    if (selectedMeal === meal && empty) {
      onAddMeal(meal);
      return;
    }
    if (selectedMeal === meal) {
      onOpenDiary(meal);
      return;
    }
    setSelectedMeal(meal);
  };

  return (
    <GlassCardSimple
      backgroundColor={Colors.dashboard.card}
      padding={16}
      customRadius={{
        borderTopLeftRadius: 32,
        borderTopRightRadius: 16,
        borderBottomRightRadius: 24,
        borderBottomLeftRadius: 32,
      }}
    >
      <div className={styles.root}>
        <div className={styles.header}>
          <span className={styles.headerLeft}>
            <span className={styles.iconCircle}>
              <span className={styles.iconShadow} />
              <span className={styles.iconInner}>
                <IconRestaurant size={20} color={Colors.dashboard.nutritionIcon} />
              </span>
            </span>
            <span className={styles.title}>{t('homeScreen.mealsOverview')}</span>
          </span>
          <button type="button" className={styles.diaryLink} onClick={() => onOpenDiary(selectedMeal ?? undefined)}>
            {t('homeScreen.openDiary')}
          </button>
        </div>

        <div className={styles.stackedBar} aria-hidden={dayKcal <= 0}>
          {dayKcal <= 0 ? (
            <div className={styles.stackedEmpty} />
          ) : (
            HOME_MEALS.map((meal) => {
              const kcal = mealTotals[meal].kcal;
              if (kcal <= 0) return null;
              const widthPct = (kcal / dayKcal) * 100;
              return (
                <div
                  key={meal}
                  className={styles.stackedSeg}
                  style={{ width: `${widthPct}%`, background: MEAL_META[meal].bg }}
                  title={`${t(MEAL_LABEL_KEY[meal])}: ${Math.round(kcal)} kcal`}
                />
              );
            })
          )}
        </div>

        <div className={styles.cells}>
          {HOME_MEALS.map((meal) => {
            const totals = mealTotals[meal];
            const goal = mealKcalGoal(dailyKcalGoal, meal);
            const empty = totals.kcal <= 0;
            const selected = selectedMeal === meal;
            const meta = MEAL_META[meal];
            const MealIcon = meta.Icon;
            const pct = mealShareOfDay(totals.kcal, dayKcal);
            return (
              <button
                key={meal}
                type="button"
                className={`${styles.cell} ${selected ? styles.cellSelected : ''} ${empty ? styles.cellEmpty : ''}`}
                onClick={() => handleCellTap(meal)}
              >
                <div className={styles.cellRingWrap}>
                  <KcalRing
                    consumed={totals.kcal}
                    goal={Math.max(goal, 1)}
                    size={36}
                    strokeWidth={3}
                    showLabel={false}
                  />
                  <span className={styles.cellIcon} style={{ background: meta.bg }}>
                    <MealIcon size={12} color={Colors.dashboard.stroke} />
                  </span>
                </div>
                <span className={styles.cellLabel}>{t(MEAL_LABEL_KEY[meal])}</span>
                <span className={styles.cellKcal}>
                  {empty ? '–' : `${Math.round(totals.kcal)}`}
                </span>
                <span className={styles.cellPct}>{empty ? '' : `${pct}%`}</span>
                {empty && (
                  <span className={styles.cellAdd} aria-hidden>
                    <IconAdd size={12} color={Colors.dashboard.stroke} />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {selectedMeal && selectedTotals && selectedTotals.kcal > 0 && macroShares && (
          <div className={styles.macros}>
            <div className={styles.macrosTitle}>
              {t('homeScreen.mealMacros', { meal: t(MEAL_LABEL_KEY[selectedMeal]) })}
            </div>
            <div className={styles.macroRows}>
              {(
                [
                  ['protein', selectedTotals.protein, macroShares.proteinPct, Colors.dashboard.proteinFill],
                  ['carbs', selectedTotals.carbs, macroShares.carbsPct, Colors.dashboard.carbsFill],
                  ['fat', selectedTotals.fat, macroShares.fatPct, Colors.dashboard.fatFill],
                ] as const
              ).map(([key, grams, pct, fill]) => (
                <div key={key} className={styles.macroRow}>
                  <div className={styles.macroMeta}>
                    <span>
                      {key === 'protein'
                        ? t('food.protein')
                        : key === 'carbs'
                          ? t('food.carbs')
                          : t('food.fat')}
                    </span>
                    <span>
                      {Math.round(grams * 10) / 10}g · {pct}%
                    </span>
                  </div>
                  <div className={styles.macroTrack}>
                    <div className={styles.macroFill} style={{ width: `${pct}%`, background: fill }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className={styles.insight}>{insightText}</p>
      </div>
    </GlassCardSimple>
  );
}
