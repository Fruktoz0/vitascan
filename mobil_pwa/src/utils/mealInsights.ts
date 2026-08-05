import type { MealType } from './mealMeta';

/** Home overview meals (SNACK lives only in the diary). */
export const HOME_MEALS: MealType[] = ['BREAKFAST', 'TIZORAI', 'LUNCH', 'UZSONNA', 'DINNER'];

/** Share of daily kcal goal per meal type. */
export const MEAL_KCAL_SHARE: Record<MealType, number> = {
  BREAKFAST: 0.25,
  TIZORAI: 0.1,
  LUNCH: 0.3,
  UZSONNA: 0.1,
  DINNER: 0.25,
  SNACK: 0,
};

export type MealTotals = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type MealAvgEntry = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  daysWithMeal: number;
};

export type LogLike = {
  kcal?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
};

export function sumMeal(logs: LogLike[] | undefined): MealTotals {
  return (logs ?? []).reduce<MealTotals>(
    (acc, l) => ({
      kcal: acc.kcal + (l.kcal ?? 0),
      protein: acc.protein + (l.protein ?? 0),
      carbs: acc.carbs + (l.carbs ?? 0),
      fat: acc.fat + (l.fat ?? 0),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

export function mealKcalGoal(dailyKcalGoal: number, meal: MealType): number {
  return Math.round(dailyKcalGoal * (MEAL_KCAL_SHARE[meal] ?? 0));
}

export function mealShareOfDay(mealKcal: number, dayKcal: number): number {
  if (dayKcal <= 0) return 0;
  return Math.round((mealKcal / dayKcal) * 100);
}

/** Macro energy share within a meal (protein/carbs 4 kcal/g, fat 9). */
export function macroEnergyShares(totals: MealTotals): {
  proteinPct: number;
  carbsPct: number;
  fatPct: number;
} {
  const p = totals.protein * 4;
  const c = totals.carbs * 4;
  const f = totals.fat * 9;
  const sum = p + c + f;
  if (sum <= 0) return { proteinPct: 0, carbsPct: 0, fatPct: 0 };
  return {
    proteinPct: Math.round((p / sum) * 100),
    carbsPct: Math.round((c / sum) * 100),
    fatPct: Math.round((f / sum) * 100),
  };
}

export function pickDefaultMeal(
  byMeal: Record<string, LogLike[] | undefined>,
  meals: MealType[] = HOME_MEALS,
): MealType | null {
  let best: MealType | null = null;
  let bestKcal = -1;
  for (const meal of meals) {
    const kcal = sumMeal(byMeal[meal]).kcal;
    if (kcal > bestKcal) {
      bestKcal = kcal;
      best = meal;
    }
  }
  return bestKcal > 0 ? best : null;
}

/** Hour after which a main meal is considered "missing" (local time). */
const MISSING_AFTER_HOUR: Partial<Record<MealType, number>> = {
  BREAKFAST: 11,
  LUNCH: 15,
  DINNER: 21,
};

export type InsightKind =
  | 'empty'
  | 'missingMeal'
  | 'vsWeekAvg'
  | 'largestMeal'
  | 'vsMealAvg';

export type InsightResult = {
  kind: InsightKind;
  meal?: MealType;
  kcal?: number;
  pct?: number;
  deltaKcal?: number;
  deltaPct?: number;
  heavier?: boolean;
};

export function computeMealInsight(opts: {
  byMeal: Record<string, LogLike[] | undefined>;
  dayKcal: number;
  weekAvgKcal?: number | null;
  mealAvg?: Record<string, MealAvgEntry> | null;
  isToday: boolean;
  nowHour: number;
  meals?: MealType[];
}): InsightResult {
  const meals = opts.meals ?? HOME_MEALS;
  const hasAny = meals.some((m) => (opts.byMeal[m]?.length ?? 0) > 0) || opts.dayKcal > 0;

  if (!hasAny) return { kind: 'empty' };

  if (opts.isToday) {
    for (const meal of ['BREAKFAST', 'LUNCH', 'DINNER'] as MealType[]) {
      const after = MISSING_AFTER_HOUR[meal];
      if (after == null) continue;
      if (opts.nowHour >= after && sumMeal(opts.byMeal[meal]).kcal <= 0) {
        return { kind: 'missingMeal', meal };
      }
    }
  }

  const weekAvg = opts.weekAvgKcal;
  if (weekAvg != null && weekAvg > 0 && opts.dayKcal > 0) {
    const delta = opts.dayKcal - weekAvg;
    const absPct = Math.abs(delta) / weekAvg;
    if (absPct >= 0.1) {
      return {
        kind: 'vsWeekAvg',
        deltaKcal: Math.round(Math.abs(delta)),
        heavier: delta > 0,
      };
    }
  }

  const largest = pickDefaultMeal(opts.byMeal, meals);
  if (largest && opts.mealAvg) {
    const kcal = sumMeal(opts.byMeal[largest]).kcal;
    const avg = opts.mealAvg[largest];
    if (avg && avg.kcal > 0 && avg.daysWithMeal > 0) {
      const delta = kcal - avg.kcal;
      const absPct = Math.abs(delta) / avg.kcal;
      if (absPct >= 0.15) {
        return {
          kind: 'vsMealAvg',
          meal: largest,
          deltaPct: Math.round(absPct * 100),
          heavier: delta > 0,
        };
      }
    }
  }

  if (largest) {
    const kcal = sumMeal(opts.byMeal[largest]).kcal;
    return {
      kind: 'largestMeal',
      meal: largest,
      kcal: Math.round(kcal),
      pct: mealShareOfDay(kcal, opts.dayKcal),
    };
  }

  return { kind: 'empty' };
}
