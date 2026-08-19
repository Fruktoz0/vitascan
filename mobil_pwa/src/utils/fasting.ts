export type FastingProtocol = '16:8' | '18:6' | '20:4' | 'OMAD' | 'CUSTOM';

export function protocolLabelKey(protocol: string) {
  if (protocol === '16:8') return 'fasting.protocol168';
  if (protocol === '18:6') return 'fasting.protocol186';
  if (protocol === '20:4') return 'fasting.protocol204';
  if (protocol === 'OMAD') return 'fasting.protocolOMAD';
  return 'fasting.protocolCUSTOM';
}

export function sessionDayKey(iso: string) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const FASTING_PROTOCOLS: FastingProtocol[] = ['16:8', '18:6', '20:4', 'OMAD', 'CUSTOM'];

export const PROTOCOL_MINUTES: Record<Exclude<FastingProtocol, 'CUSTOM'>, number> = {
  '16:8': 960,
  '18:6': 1080,
  '20:4': 1200,
  OMAD: 1380,
};

export function resolveGoalMinutes(protocol: string, custom?: number): number {
  if (protocol === 'CUSTOM') {
    const n = custom ?? 960;
    return Math.min(1439, Math.max(60, Math.round(n)));
  }
  return PROTOCOL_MINUTES[protocol as keyof typeof PROTOCOL_MINUTES] ?? 960;
}

export function formatHms(ms: number, withSeconds = true): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return withSeconds ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
}

/** Human duration with unit, e.g. "8 óra 15 perc" / "8 h 15 min". */
export function formatDurationLabel(ms: number, locale: string): string {
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  return formatMinutesLabel(totalMin, locale);
}

export function formatMinutesLabel(totalMin: number, locale: string): string {
  const minutes = Math.max(0, Math.round(totalMin));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hu = locale.toLowerCase().startsWith('hu');
  if (hu) {
    if (h === 0) return `${m} perc`;
    if (m === 0) return `${h} óra`;
    return `${h} óra ${m} perc`;
  }
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

export function eatingWindowMinutes(goalMinutes: number): number {
  return Math.max(0, 24 * 60 - goalMinutes);
}
