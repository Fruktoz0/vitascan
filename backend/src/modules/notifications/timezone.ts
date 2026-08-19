const DEFAULT_TZ = 'Europe/Budapest';

type ZonedParts = {
  ymd: string;
  hm: string;
};

function tzOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(date).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - date.getTime();
}

export function resolveTimezone(tz?: string | null): string {
  const value = tz?.trim() || DEFAULT_TZ;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return value;
  } catch {
    return DEFAULT_TZ;
  }
}

export function zonedParts(date = new Date(), timeZone = DEFAULT_TZ): ZonedParts {
  const tz = resolveTimezone(timeZone);
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
  const hour = String(parts.hour ?? '00').padStart(2, '0');
  const minute = String(parts.minute ?? '00').padStart(2, '0');
  return {
    ymd: `${parts.year}-${parts.month}-${parts.day}`,
    hm: `${hour === '24' ? '00' : hour}:${minute}`,
  };
}

/** Wall-clock `YYYY-MM-DD` + `HH:mm` in `timeZone` → UTC Date. */
export function zonedDate(ymd: string, hm: string, timeZone = DEFAULT_TZ): Date {
  const tz = resolveTimezone(timeZone);
  const [y, m, d] = ymd.split('-').map(Number);
  const [hh, mm] = hm.split(':').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm, 0));
  return new Date(guess.getTime() - tzOffsetMs(guess, tz));
}

export function zonedDayRange(ymd: string, timeZone = DEFAULT_TZ): { start: Date; end: Date } {
  const start = zonedDate(ymd, '00:00', timeZone);
  const next = new Date(start.getTime() + 36 * 60 * 60 * 1000);
  const nextYmd = zonedParts(next, timeZone).ymd;
  const end = zonedDate(nextYmd, '00:00', timeZone);
  return { start, end };
}

/** DATE column lookup (UTC midnight of the calendar day). */
export function dateOnlyUtc(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** Quiet window that may wrap midnight (e.g. 22:00–07:00). */
export function isInQuietHours(hm: string, start: string, end: string): boolean {
  if (start === end) return false;
  if (start < end) return hm >= start && hm < end;
  return hm >= start || hm < end;
}
