import type { MealType } from './mealMeta';

export type MealSuggestIdea = {
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  note?: string;
};

export type MealSuggestSlot = {
  mealType: MealType;
  title: string;
  ideas: MealSuggestIdea[];
};

export type MealSuggestContent = {
  remaining: { kcal: number; protein: number; carbs: number; fat: number } | null;
  suggestions: MealSuggestSlot[];
  refreshByMeal: Partial<Record<MealType, number>>;
};

const MEAL_TYPES = new Set<string>([
  'BREAKFAST',
  'TIZORAI',
  'LUNCH',
  'UZSONNA',
  'DINNER',
  'SNACK',
]);

export function parseMealSuggestContent(raw: string | null | undefined): MealSuggestContent | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<MealSuggestContent>;
    const suggestions: MealSuggestSlot[] = [];
    for (const row of Array.isArray(parsed.suggestions) ? parsed.suggestions : []) {
      if (!row || !MEAL_TYPES.has(row.mealType)) continue;
      const ideas = (Array.isArray(row.ideas) ? row.ideas : [])
        .filter((i) => i && typeof i.name === 'string' && i.name.trim())
        .slice(0, 2)
        .map((i) => ({
          name: String(i.name).trim(),
          kcal: Math.round(Number(i.kcal) || 0),
          protein: Number(i.protein) || 0,
          carbs: Number(i.carbs) || 0,
          fat: Number(i.fat) || 0,
          ...(typeof i.note === 'string' && i.note.trim() ? { note: i.note.trim() } : {}),
        }));
      if (ideas.length === 0) continue;
      suggestions.push({
        mealType: row.mealType as MealType,
        title: typeof row.title === 'string' && row.title.trim() ? row.title.trim() : row.mealType,
        ideas,
      });
    }
    return {
      remaining: parsed.remaining ?? null,
      suggestions,
      refreshByMeal:
        parsed.refreshByMeal && typeof parsed.refreshByMeal === 'object'
          ? parsed.refreshByMeal
          : {},
    };
  } catch {
    return null;
  }
}
