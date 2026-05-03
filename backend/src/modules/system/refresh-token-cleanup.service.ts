import { PrismaClient } from '@prisma/client';

export const RT_CLEANUP_KEYS = {
  INTERVAL_HOURS: 'refresh_token_cleanup_interval_hours',
  REVOKED_RETENTION_DAYS: 'refresh_token_revoked_retention_days',
  LAST_RUN_AT: 'refresh_token_cleanup_last_run_at',
  LAST_DELETED_COUNT: 'refresh_token_cleanup_last_deleted_count',
} as const;

const DEFAULT_INTERVAL_HOURS = 24;
const DEFAULT_REVOKED_RETENTION_DAYS = 7;

const MIN_INTERVAL_HOURS = 1;
const MAX_INTERVAL_HOURS = 24 * 30; // 30 nap
const MIN_RETENTION_DAYS = 0;
const MAX_RETENTION_DAYS = 365;

async function getSetting(prisma: PrismaClient, key: string): Promise<string | null> {
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  return row?.value ?? null;
}

async function upsertSetting(prisma: PrismaClient, key: string, value: string) {
  await prisma.systemSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

function parsePositiveInt(raw: string | null, fallback: number, min: number, max: number): number {
  if (raw == null || raw === '') return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export type RefreshTokenCleanupConfig = {
  intervalHours: number;
  revokedRetentionDays: number;
  lastRunAt: string | null;
  lastDeletedCount: number | null;
};

export async function getRefreshTokenCleanupConfig(prisma: PrismaClient): Promise<RefreshTokenCleanupConfig> {
  const [intervalRaw, retentionRaw, lastRunRaw, lastDelRaw] = await Promise.all([
    getSetting(prisma, RT_CLEANUP_KEYS.INTERVAL_HOURS),
    getSetting(prisma, RT_CLEANUP_KEYS.REVOKED_RETENTION_DAYS),
    getSetting(prisma, RT_CLEANUP_KEYS.LAST_RUN_AT),
    getSetting(prisma, RT_CLEANUP_KEYS.LAST_DELETED_COUNT),
  ]);

  const intervalHours = parsePositiveInt(
    intervalRaw,
    DEFAULT_INTERVAL_HOURS,
    MIN_INTERVAL_HOURS,
    MAX_INTERVAL_HOURS,
  );
  const revokedRetentionDays = parsePositiveInt(
    retentionRaw,
    DEFAULT_REVOKED_RETENTION_DAYS,
    MIN_RETENTION_DAYS,
    MAX_RETENTION_DAYS,
  );

  let lastDeletedCount: number | null = null;
  if (lastDelRaw != null && lastDelRaw !== '') {
    const n = parseInt(lastDelRaw, 10);
    if (Number.isFinite(n)) lastDeletedCount = n;
  }
  return {
    intervalHours,
    revokedRetentionDays,
    lastRunAt: lastRunRaw,
    lastDeletedCount,
  };
}

export async function setRefreshTokenCleanupConfig(
  prisma: PrismaClient,
  input: { intervalHours?: number; revokedRetentionDays?: number },
): Promise<RefreshTokenCleanupConfig> {
  if (input.intervalHours !== undefined) {
    const v = Math.min(
      MAX_INTERVAL_HOURS,
      Math.max(MIN_INTERVAL_HOURS, Math.floor(input.intervalHours)),
    );
    await upsertSetting(prisma, RT_CLEANUP_KEYS.INTERVAL_HOURS, String(v));
  }
  if (input.revokedRetentionDays !== undefined) {
    const v = Math.min(
      MAX_RETENTION_DAYS,
      Math.max(MIN_RETENTION_DAYS, Math.floor(input.revokedRetentionDays)),
    );
    await upsertSetting(prisma, RT_CLEANUP_KEYS.REVOKED_RETENTION_DAYS, String(v));
  }
  return getRefreshTokenCleanupConfig(prisma);
}

/** Lejárt, illetve a megadott napnál régebben visszavont refresh token sorok törlése. */
export async function purgeStaleRefreshTokens(
  prisma: PrismaClient,
  revokedRetentionDays: number,
): Promise<number> {
  const now = new Date();
  const retentionCutoff = new Date(now);
  retentionCutoff.setUTCDate(retentionCutoff.getUTCDate() - revokedRetentionDays);

  const result = await prisma.refreshToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: now } },
        {
          AND: [{ revokedAt: { not: null } }, { revokedAt: { lt: retentionCutoff } }],
        },
      ],
    },
  });
  return result.count;
}

export async function runRefreshTokenCleanupJob(prisma: PrismaClient): Promise<{ deleted: number }> {
  const { revokedRetentionDays } = await getRefreshTokenCleanupConfig(prisma);
  const deleted = await purgeStaleRefreshTokens(prisma, revokedRetentionDays);
  await upsertSetting(prisma, RT_CLEANUP_KEYS.LAST_RUN_AT, new Date().toISOString());
  await upsertSetting(prisma, RT_CLEANUP_KEYS.LAST_DELETED_COUNT, String(deleted));
  return { deleted };
}

export function shouldRunScheduledCleanup(
  lastRunAtIso: string | null,
  intervalHours: number,
  nowMs: number = Date.now(),
): boolean {
  if (!lastRunAtIso) return true;
  const last = new Date(lastRunAtIso).getTime();
  if (!Number.isFinite(last)) return true;
  return nowMs - last >= intervalHours * 3600 * 1000;
}
