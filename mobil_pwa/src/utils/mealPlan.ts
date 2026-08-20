import { toLocalDateStr } from '../stores/dateStore';
import type { MealType } from './mealMeta';

export const PLAN_MEALS: MealType[] = ['BREAKFAST', 'LUNCH', 'DINNER'];
export const PLAN_OWNER_KEY = 'vitascan.mealPlanOwnerId';

export function startOfIsoWeek(ref: Date): Date {
  const d = new Date(ref);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return d;
}

export function addDays(date: Date, n: number): Date {
  const x = new Date(date);
  x.setDate(x.getDate() + n);
  return x;
}

export function parseDateKey(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

export function weekDates(weekStart: string): string[] {
  const start = parseDateKey(weekStart);
  return Array.from({ length: 7 }, (_, i) => toLocalDateStr(addDays(start, i)));
}

export function setPlanOwnerId(ownerId: string | null) {
  try {
    if (ownerId) sessionStorage.setItem(PLAN_OWNER_KEY, ownerId);
    else sessionStorage.removeItem(PLAN_OWNER_KEY);
  } catch {
    /* ignore */
  }
}

export function getPlanOwnerId(): string | null {
  try {
    return sessionStorage.getItem(PLAN_OWNER_KEY);
  } catch {
    return null;
  }
}
