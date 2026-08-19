import type { DoodleMood } from '../components/ui/DoodleCharacter';
import type { MealType } from './mealMeta';
import { HOME_MEALS, getNearestMealType, sumMeal, type LogLike } from './mealInsights';

export type DoodleHintKey =
  | 'calm'
  | 'curious'
  | 'warnOver'
  | 'warnSugar'
  | 'celebrate'
  | 'emptyDay'
  | 'underGoal'
  | 'eveningWrap';

export type DoodleMoodResult = {
  mood: DoodleMood;
  hintKey: DoodleHintKey;
  meal?: MealType;
};

const SUGAR_WARN_G = 60;
const ARIA_KEYS: Record<DoodleHintKey, string> = {
  calm: 'homeScreen.doodleCalm',
  curious: 'homeScreen.doodleCurious',
  warnOver: 'homeScreen.doodleWarnOver',
  warnSugar: 'homeScreen.doodleWarnSugar',
  celebrate: 'homeScreen.doodleCelebrate',
  emptyDay: 'homeScreen.doodleEmptyDay',
  underGoal: 'homeScreen.doodleUnderGoal',
  eveningWrap: 'homeScreen.doodleEveningWrap',
};

function mealKcal(byMealType: Record<string, LogLike[] | undefined>, meal: MealType): number {
  return sumMeal(byMealType[meal]).kcal;
}

function nearestHomeMeal(now: Date): MealType {
  const nearest = getNearestMealType(now);
  return HOME_MEALS.includes(nearest) ? nearest : 'DINNER';
}

export function doodleAriaI18nKey(hintKey: DoodleHintKey): string {
  return ARIA_KEYS[hintKey];
}

export function doodleTipsI18nKey(hintKey: DoodleHintKey): string {
  return `homeScreen.doodleTips.${hintKey}`;
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
  const hour = now.getHours();
  const hasLogs = opts.kcal > 0;
  const over = opts.goal > 0 && opts.kcal > opts.goal * 1.1;
  const onTarget = opts.goal > 0 && hasLogs && Math.abs(opts.kcal - opts.goal) / opts.goal <= 0.1;
  const sugary = (opts.sugar ?? 0) >= SUGAR_WARN_G && hasLogs;

  if (over) return { mood: 'warn', hintKey: 'warnOver' };
  if (sugary) return { mood: 'warn', hintKey: 'warnSugar' };
  if (!hasLogs) return { mood: 'curious', hintKey: 'emptyDay' };

  if (opts.isToday) {
    const meal = nearestHomeMeal(now);
    if (mealKcal(opts.byMealType, meal) <= 0) {
      return { mood: 'curious', hintKey: 'curious', meal };
    }
    if (onTarget && (hour >= 18 || opts.kcal >= opts.goal * 0.85)) {
      return { mood: 'celebrate', hintKey: 'celebrate' };
    }
    if (hour >= 21) {
      return { mood: 'calm', hintKey: 'eveningWrap' };
    }
    if (opts.goal > 0 && opts.kcal < opts.goal * 0.7 && hour >= 14) {
      return { mood: 'calm', hintKey: 'underGoal' };
    }
    return { mood: 'calm', hintKey: 'calm' };
  }

  if (onTarget) return { mood: 'celebrate', hintKey: 'celebrate' };
  return { mood: 'calm', hintKey: 'calm' };
}
