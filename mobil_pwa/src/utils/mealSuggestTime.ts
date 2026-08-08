import type { MealType } from './mealMeta';

/**
 * After this local hour (0–23), the meal is considered past and should not be suggested.
 * SNACK stays available into the night (24 = never past by hour alone).
 */
export const MEAL_SUGGEST_UNTIL_HOUR: Record<MealType, number> = {
  BREAKFAST: 10,
  TIZORAI: 11,
  LUNCH: 15,
  UZSONNA: 17,
  DINNER: 22,
  SNACK: 24,
};

export function isMealSuggestRelevant(meal: MealType, localHour: number): boolean {
  return localHour < (MEAL_SUGGEST_UNTIL_HOUR[meal] ?? 24);
}

export function filterMealsByHour<T extends MealType>(meals: T[], localHour: number): T[] {
  return meals.filter((m) => isMealSuggestRelevant(m, localHour));
}
