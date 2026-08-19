import { toLocalDateStr } from '../stores/dateStore';

export type DateRange = { from: string; to: string };

export const PRESET_KEYS = ['thisMonth', 'last7', 'last30', 'last90'] as const;
export type PresetKey = (typeof PRESET_KEYS)[number];

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function monthKey(iso: string) {
  const d = new Date(iso + 'T12:00:00');
  return `${d.getFullYear()}-${d.getMonth()}`;
}

export function defaultRange(): DateRange {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return {
    from: toLocalDateStr(addDays(now, -29)),
    to: toLocalDateStr(now),
  };
}

export function rangeForPreset(key: PresetKey): DateRange {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  let from = new Date(now);
  let to = new Date(now);
  if (key === 'thisMonth') {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
    to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  } else if (key === 'last7') {
    from = addDays(now, -6);
  } else if (key === 'last30') {
    from = addDays(now, -29);
  } else if (key === 'last90') {
    from = addDays(now, -89);
  }
  return { from: toLocalDateStr(from), to: toLocalDateStr(to) };
}

export function matchingPreset(from: string, to: string): PresetKey | null {
  return (
    PRESET_KEYS.find((key) => {
      const range = rangeForPreset(key);
      return range.from === from && range.to === to;
    }) ?? null
  );
}
