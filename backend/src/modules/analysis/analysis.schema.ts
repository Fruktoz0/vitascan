import { z } from 'zod';

const MealTypeSchema = z.enum([
  'BREAKFAST',
  'TIZORAI',
  'LUNCH',
  'UZSONNA',
  'DINNER',
  'SNACK',
]);

export const AnalysisQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dátum formátum: YYYY-MM-DD').optional(),
  kind: z.enum(['nutrition', 'fitness', 'coach', 'mealSuggest', 'weeklyNutrition']).optional(),
});

export const GenerateAnalysisSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dátum formátum: YYYY-MM-DD').optional(),
  locale: z.enum(['hu', 'en']).optional(),
  /** Client local ISO datetime, e.g. 2026-07-25T18:42:00+02:00 */
  localTime: z.string().min(8).max(40).optional(),
  kind: z.enum(['nutrition', 'fitness', 'coach', 'mealSuggest', 'weeklyNutrition']).optional(),
  /** mealSuggest refresh: regenerate a single empty meal slot */
  mealType: MealTypeSchema.optional(),
  /** mealSuggest: ignore daily cache and regenerate batch */
  force: z.boolean().optional(),
});

export type GenerateAnalysisInput = z.infer<typeof GenerateAnalysisSchema>;

export const MAX_GENERATIONS_PER_DAY = 5;
/** Home coach nudges — separate from full nutrition/fitness analysis quota. */
export const MAX_COACH_GENERATIONS_PER_DAY = 8;
/** Premium: max refreshes per meal slot per day (admin unlimited). */
export const MAX_MEAL_SUGGEST_REFRESH_PREMIUM = 1;
/** Weekly calorie evaluation — separate quota keyed by week end date. */
export const MAX_WEEKLY_NUTRITION_GENERATIONS = 2;
