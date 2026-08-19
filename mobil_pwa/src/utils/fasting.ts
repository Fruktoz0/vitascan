export type FastingProtocol = '16:8' | '18:6' | '20:4' | 'OMAD' | 'CUSTOM';

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

export function eatingWindowMinutes(goalMinutes: number): number {
  return Math.max(0, 24 * 60 - goalMinutes);
}
