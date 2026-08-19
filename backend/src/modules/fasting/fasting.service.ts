import { PrismaClient } from '@prisma/client';
import { zonedDayRange, zonedParts } from '../notifications/timezone';

export const FASTING_PROTOCOLS = ['16:8', '18:6', '20:4', 'OMAD', 'CUSTOM'] as const;
export type FastingProtocol = (typeof FASTING_PROTOCOLS)[number];

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

export function eatingWindowMinutes(goalMinutes: number): number {
  return Math.max(0, 24 * 60 - goalMinutes);
}

type SessionRow = {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
  goalMinutes: number;
  protocol: string;
  source: string;
};

export function serializeSession(row: SessionRow, now = new Date()) {
  const endMs = row.endedAt ? row.endedAt.getTime() : now.getTime();
  const elapsedMinutes = Math.max(0, Math.floor((endMs - row.startedAt.getTime()) / 60_000));
  return {
    id: row.id,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    goalMinutes: row.goalMinutes,
    protocol: row.protocol,
    source: row.source,
    elapsedMinutes,
    eatingWindowMinutes: eatingWindowMinutes(row.goalMinutes),
  };
}

async function ensureProfile(prisma: PrismaClient, userId: string) {
  return prisma.userProfile.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

async function resolveUserTimezone(prisma: PrismaClient, userId: string): Promise<string> {
  const pref = await prisma.notificationPref.findUnique({
    where: { userId },
    select: { timezone: true },
  });
  return pref?.timezone || 'Europe/Budapest';
}

async function findLastMealToday(prisma: PrismaClient, userId: string): Promise<Date | null> {
  const tz = await resolveUserTimezone(prisma, userId);
  const { ymd } = zonedParts(new Date(), tz);
  const range = zonedDayRange(ymd, tz);
  const log = await prisma.dailyLog.findFirst({
    where: { userId, createdAt: { gte: range.start, lt: range.end } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  return log?.createdAt ?? null;
}

export async function getCurrent(prisma: PrismaClient, userId: string) {
  const now = new Date();
  const [profile, active, lastMealAt] = await Promise.all([
    ensureProfile(prisma, userId),
    prisma.fastSession.findFirst({
      where: { userId, endedAt: null },
      orderBy: { startedAt: 'desc' },
    }),
    findLastMealToday(prisma, userId),
  ]);

  let eatingUntil: string | null = null;
  let lastEnded: ReturnType<typeof serializeSession> | null = null;

  if (!active) {
    const ended = await prisma.fastSession.findFirst({
      where: { userId, endedAt: { not: null } },
      orderBy: { endedAt: 'desc' },
    });
    if (ended?.endedAt) {
      const until = new Date(
        ended.endedAt.getTime() + eatingWindowMinutes(ended.goalMinutes) * 60_000,
      );
      if (until.getTime() > now.getTime()) {
        eatingUntil = until.toISOString();
        lastEnded = serializeSession(ended, now);
      }
    }
  }

  return {
    active: active ? serializeSession(active, now) : null,
    lastEnded,
    eatingUntil,
    lastMealAt: lastMealAt ? lastMealAt.toISOString() : null,
    protocol: profile.fastingProtocol,
    goalMinutes: profile.fastingGoalMinutes,
  };
}

export async function startFast(
  prisma: PrismaClient,
  userId: string,
  input: { protocol?: string; goalMinutes?: number; source?: 'MANUAL' | 'FROM_LAST_MEAL' },
) {
  const existing = await prisma.fastSession.findFirst({
    where: { userId, endedAt: null },
    select: { id: true },
  });
  if (existing) {
    throw Object.assign(new Error('Már van aktív böjtöd.'), { statusCode: 409 });
  }

  const profile = await ensureProfile(prisma, userId);
  const protocol = (input.protocol ?? profile.fastingProtocol ?? '16:8') as string;
  if (!FASTING_PROTOCOLS.includes(protocol as FastingProtocol)) {
    throw Object.assign(new Error('Érvénytelen böjt protokoll.'), { statusCode: 400 });
  }

  const goalMinutes = resolveGoalMinutes(
    protocol,
    input.goalMinutes ?? (protocol === 'CUSTOM' ? profile.fastingGoalMinutes : undefined),
  );
  const source = input.source === 'FROM_LAST_MEAL' ? 'FROM_LAST_MEAL' : 'MANUAL';

  let startedAt = new Date();
  if (source === 'FROM_LAST_MEAL') {
    const lastMeal = await findLastMealToday(prisma, userId);
    if (!lastMeal) {
      throw Object.assign(new Error('Ma még nincs étkezés a naplóban.'), { statusCode: 400 });
    }
    startedAt = lastMeal.getTime() > Date.now() ? new Date() : lastMeal;
  }

  const [session] = await prisma.$transaction([
    prisma.fastSession.create({
      data: { userId, startedAt, goalMinutes, protocol, source },
    }),
    prisma.userProfile.update({
      where: { userId },
      data: { fastingProtocol: protocol, fastingGoalMinutes: goalMinutes },
    }),
  ]);

  return serializeSession(session);
}

export async function stopFast(prisma: PrismaClient, userId: string) {
  const active = await prisma.fastSession.findFirst({
    where: { userId, endedAt: null },
    orderBy: { startedAt: 'desc' },
  });
  if (!active) {
    throw Object.assign(new Error('Nincs aktív böjt.'), { statusCode: 404 });
  }

  const now = new Date();
  const ended = await prisma.fastSession.update({
    where: { id: active.id },
    data: { endedAt: now },
  });

  const until = new Date(now.getTime() + eatingWindowMinutes(ended.goalMinutes) * 60_000);
  return {
    session: serializeSession(ended, now),
    eatingUntil: until.toISOString(),
  };
}

export async function listHistory(
  prisma: PrismaClient,
  userId: string,
  filters: { from?: string; to?: string },
) {
  const where: {
    userId: string;
    endedAt: { not: null; gte?: Date; lt?: Date };
  } = {
    userId,
    endedAt: { not: null },
  };
  if (filters.from) {
    const start = new Date(`${filters.from}T00:00:00.000Z`);
    if (!Number.isNaN(start.getTime())) where.endedAt.gte = start;
  }
  if (filters.to) {
    const end = new Date(`${filters.to}T00:00:00.000Z`);
    if (!Number.isNaN(end.getTime())) {
      end.setUTCDate(end.getUTCDate() + 1);
      where.endedAt.lt = end;
    }
  }

  const items = await prisma.fastSession.findMany({
    where,
    orderBy: { endedAt: 'desc' },
    take: 90,
  });

  return { items: items.map((row) => serializeSession(row, row.endedAt ?? new Date())) };
}
