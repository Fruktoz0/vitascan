export type KcalGoalTone = 'green' | 'yellow' | 'red';

/** Green: within ±10% of goal (same band as daysOnTarget). Yellow: ±10–25%. Red: farther. */
export function kcalGoalTone(kcal: number, goal: number): KcalGoalTone {
  if (goal <= 0) return 'green';
  const pct = Math.abs(kcal - goal) / goal;
  if (pct <= 0.1) return 'green';
  if (pct <= 0.25) return 'yellow';
  return 'red';
}

export function weekKcalGoalTone(
  dayKcalByDate: Map<string, number>,
  datesInRange: string[],
  goal: number,
): KcalGoalTone | null {
  let sum = 0;
  let n = 0;
  for (const date of datesInRange) {
    const kcal = dayKcalByDate.get(date);
    if (kcal == null) continue;
    sum += kcal;
    n += 1;
  }
  if (n === 0) return null;
  return kcalGoalTone(sum / n, goal);
}
