import { createHash, randomBytes } from 'crypto';
import { PrismaClient, FitnessSource } from '@prisma/client';
import type { WorkoutCreateInput, WorkoutIngestInput } from './fitness.schema';

export const FITNESS_TOKEN_PREFIX = 'vitafit_';

export function hashFitnessToken(plain: string): string {
  return createHash('sha256').update(plain).digest('hex');
}

export function generateFitnessTokenPlain(): string {
  return `${FITNESS_TOKEN_PREFIX}${randomBytes(32).toString('hex')}`;
}

export function parseDay(date?: string): Date {
  const day = date ? new Date(date) : new Date();
  day.setHours(0, 0, 0, 0);
  return day;
}

/** Date-only (@db.Date) — UTC midnight of YYYY-MM-DD, matches DailyAnalysis day keys. */
export function parseDateOnly(date?: string): Date {
  const key =
    date && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? date
      : toDateStr(new Date());
  return new Date(key + 'T00:00:00.000Z');
}

export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function serializeWorkout(w: {
  id: string;
  activityType: string;
  startedAt: Date;
  endedAt: Date | null;
  durationMin: number;
  activeEnergyKcal: number | null;
  distanceKm: number | null;
  source: FitnessSource;
  externalId: string | null;
  createdAt: Date;
}) {
  return {
    id: w.id,
    activityType: w.activityType,
    startedAt: w.startedAt.toISOString(),
    endedAt: w.endedAt?.toISOString() ?? null,
    durationMin: w.durationMin,
    activeEnergyKcal: w.activeEnergyKcal,
    distanceKm: w.distanceKm,
    source: w.source,
    externalId: w.externalId,
    createdAt: w.createdAt.toISOString(),
  };
}

export async function findUserIdByIngestToken(
  prisma: PrismaClient,
  authorizationHeader: string | undefined,
): Promise<string | null> {
  if (!authorizationHeader?.startsWith('Bearer ')) return null;
  const plain = authorizationHeader.slice(7).trim();
  if (!plain.startsWith(FITNESS_TOKEN_PREFIX)) return null;
  const hash = hashFitnessToken(plain);
  const profile = await prisma.userProfile.findFirst({
    where: { fitnessIngestTokenHash: hash },
    select: { userId: true },
  });
  return profile?.userId ?? null;
}

export async function createIngestToken(prisma: PrismaClient, userId: string) {
  const plain = generateFitnessTokenPlain();
  const hash = hashFitnessToken(plain);
  await prisma.userProfile.upsert({
    where: { userId },
    create: { userId, fitnessIngestTokenHash: hash },
    update: { fitnessIngestTokenHash: hash },
  });
  return { token: plain, hasToken: true };
}

export async function revokeIngestToken(prisma: PrismaClient, userId: string) {
  await prisma.userProfile.updateMany({
    where: { userId },
    data: { fitnessIngestTokenHash: null },
  });
  return { hasToken: false };
}

export async function getTokenStatus(prisma: PrismaClient, userId: string) {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { fitnessIngestTokenHash: true },
  });
  return { hasToken: !!profile?.fitnessIngestTokenHash };
}

export async function listWorkouts(prisma: PrismaClient, userId: string, dateStr?: string) {
  const day = parseDay(dateStr);
  const rangeStart = new Date(day);
  const rangeEnd = new Date(day);
  rangeEnd.setDate(rangeEnd.getDate() + 1);

  const rows = await prisma.workoutLog.findMany({
    where: {
      userId,
      startedAt: { gte: rangeStart, lt: rangeEnd },
    },
    orderBy: { startedAt: 'asc' },
  });

  return {
    date: toDateStr(day),
    workouts: rows.map(serializeWorkout),
  };
}

export async function ingestWorkout(
  prisma: PrismaClient,
  userId: string,
  data: WorkoutIngestInput,
) {
  const startedAt = new Date(data.startedAt);
  if (Number.isNaN(startedAt.getTime())) {
    throw Object.assign(new Error('Érvénytelen startedAt.'), { statusCode: 400 });
  }
  const endedAt = data.endedAt ? new Date(data.endedAt) : null;
  if (endedAt && Number.isNaN(endedAt.getTime())) {
    throw Object.assign(new Error('Érvénytelen endedAt.'), { statusCode: 400 });
  }

  const externalId = data.externalId?.trim() || null;

  if (externalId) {
    const row = await prisma.workoutLog.upsert({
      where: { userId_externalId: { userId, externalId } },
      create: {
        userId,
        externalId,
        activityType: data.activityType,
        startedAt,
        endedAt,
        durationMin: data.durationMin,
        activeEnergyKcal: data.activeEnergyKcal ?? null,
        distanceKm: data.distanceKm ?? null,
        source: 'SHORTCUTS',
      },
      update: {
        activityType: data.activityType,
        startedAt,
        endedAt,
        durationMin: data.durationMin,
        activeEnergyKcal: data.activeEnergyKcal ?? null,
        distanceKm: data.distanceKm ?? null,
        source: 'SHORTCUTS',
      },
    });
    return serializeWorkout(row);
  }

  const row = await prisma.workoutLog.create({
    data: {
      userId,
      activityType: data.activityType,
      startedAt,
      endedAt,
      durationMin: data.durationMin,
      activeEnergyKcal: data.activeEnergyKcal ?? null,
      distanceKm: data.distanceKm ?? null,
      source: 'SHORTCUTS',
    },
  });
  return serializeWorkout(row);
}

export async function createWorkout(
  prisma: PrismaClient,
  userId: string,
  data: WorkoutCreateInput,
) {
  const startedAt = new Date(data.startedAt);
  if (Number.isNaN(startedAt.getTime())) {
    throw Object.assign(new Error('Érvénytelen startedAt.'), { statusCode: 400 });
  }
  const endedAt = data.endedAt ? new Date(data.endedAt) : null;
  if (endedAt && Number.isNaN(endedAt.getTime())) {
    throw Object.assign(new Error('Érvénytelen endedAt.'), { statusCode: 400 });
  }

  const row = await prisma.workoutLog.create({
    data: {
      userId,
      activityType: data.activityType,
      startedAt,
      endedAt,
      durationMin: data.durationMin,
      activeEnergyKcal: data.activeEnergyKcal ?? null,
      distanceKm: data.distanceKm ?? null,
      source: 'MANUAL',
    },
  });
  return serializeWorkout(row);
}

export async function deleteWorkout(prisma: PrismaClient, userId: string, id: string) {
  const existing = await prisma.workoutLog.findFirst({ where: { id, userId } });
  if (!existing) {
    throw Object.assign(new Error('Az edzés nem található.'), { statusCode: 404 });
  }
  await prisma.workoutLog.delete({ where: { id } });
  return { ok: true };
}

export async function getSteps(prisma: PrismaClient, userId: string, dateStr?: string) {
  const day = parseDateOnly(dateStr);
  const row = await prisma.dailyStepLog.findUnique({
    where: { userId_loggedDate: { userId, loggedDate: day } },
  });
  return {
    date: dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : toDateStr(new Date()),
    steps: row?.steps ?? null,
    source: row?.source ?? null,
    updatedAt: row?.updatedAt?.toISOString() ?? null,
  };
}

export async function upsertSteps(
  prisma: PrismaClient,
  userId: string,
  dateStr: string,
  steps: number,
  source: FitnessSource,
) {
  const day = parseDateOnly(dateStr);
  const row = await prisma.dailyStepLog.upsert({
    where: { userId_loggedDate: { userId, loggedDate: day } },
    create: { userId, loggedDate: day, steps, source },
    update: { steps, source },
  });
  return {
    date: dateStr,
    steps: row.steps,
    source: row.source,
    updatedAt: row.updatedAt.toISOString(),
  };
}
