import type { DoodleMood } from '../components/ui/DoodleCharacter';
import type { MealType } from './mealMeta';
import { HOME_MEALS, getNearestMealType, sumMeal, type LogLike } from './mealInsights';

export type DoodleMoodResult = {
  mood: DoodleMood;
  hintKey: 'calm' | 'curious' | 'warnOver' | 'warnSugar' | 'celebrate';
  meal?: MealType;
};

const SUGAR_WARN_G = 60;

function mealKcal(byMealType: Record<string, LogLike[] | undefined>, meal: MealType): number {
  return sumMeal(byMealType[meal]).kcal;
}

function nearestHomeMeal(now: Date): MealType {
  const nearest = getNearestMealType(now);
  return HOME_MEALS.includes(nearest) ? nearest : 'DINNER';
}

/** Főoldali doodle hangulat a napi napló alapján. */
export function doodleMoodForDay(opts: {
  isToday: boolean;
  now?: Date;
  kcal: number;
  goal: number;
  sugar?: number;
  byMealType: Record<string, LogLike[] | undefined>;
}): DoodleMoodResult {
  const now = opts.now ?? new Date();
  const hasLogs = opts.kcal > 0;
  const over = opts.goal > 0 && opts.kcal > opts.goal * 1.1;
  const onTarget = opts.goal > 0 && hasLogs && Math.abs(opts.kcal - opts.goal) / opts.goal <= 0.1;
  const sugary = (opts.sugar ?? 0) >= SUGAR_WARN_G && hasLogs;

  if (over) return { mood: 'warn', hintKey: 'warnOver' };
  if (sugary) return { mood: 'warn', hintKey: 'warnSugar' };

  if (opts.isToday) {
    const meal = nearestHomeMeal(now);
    if (mealKcal(opts.byMealType, meal) <= 0) {
      return { mood: 'curious', hintKey: 'curious', meal };
    }
    if (onTarget && (now.getHours() >= 18 || opts.kcal >= opts.goal * 0.85)) {
      return { mood: 'celebrate', hintKey: 'celebrate' };
    }
    return { mood: 'calm', hintKey: 'calm' };
  }

  if (onTarget) return { mood: 'celebrate', hintKey: 'celebrate' };
  return { mood: 'calm', hintKey: 'calm' };
}
