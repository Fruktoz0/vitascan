import { FastifyRequest, FastifyReply } from 'fastify';

// ─── Tier konstansok ─────────────────────────────────────────────────────────

export const TIER_LIMITS = {
  FREE: {
    dailyLogs: 10,
    dailyScans: 5,
    statsWeeksBack: 1,
    exportEnabled: false,
    monthlyStatsEnabled: false,
    premiumFoodsVisible: false,
    profileCustomization: false,
  },
  PREMIUM: {
    dailyLogs: Infinity,
    dailyScans: Infinity,
    statsWeeksBack: Infinity,
    exportEnabled: true,
    monthlyStatsEnabled: true,
    premiumFoodsVisible: true,
    profileCustomization: true,
  },
} as const;

// ─── Helper: user tier lekérése ───────────────────────────────────────────────

export async function getUserTier(prisma: any, userId: string): Promise<'FREE' | 'PREMIUM'> {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { tier: true },
  });
  return profile?.tier ?? 'FREE';
}

export async function getTierInfo(prisma: any, userId: string) {
  const tier = await getUserTier(prisma, userId);
  return { tier, limits: TIER_LIMITS[tier] };
}

// ─── Middleware: napi napló limit ─────────────────────────────────────────────

export async function dailyLogLimitGuard(req: FastifyRequest, reply: FastifyReply) {
  const prisma = (req.server as any).prisma;
  const userId = (req.user as any).id ?? (req.user as any).userId;
  const tier = await getUserTier(prisma, userId);
  if (tier === 'PREMIUM') return;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const count = await prisma.dailyLog.count({ where: { userId, createdAt: { gte: startOfDay } } });

  if (count >= TIER_LIMITS.FREE.dailyLogs) {
    return reply.status(403).send({
      error: `Napi ${TIER_LIMITS.FREE.dailyLogs} naplóbejegyzés az ingyenes korlát.`,
      upgradeRequired: true, feature: 'unlimited_logs',
      currentCount: count, limit: TIER_LIMITS.FREE.dailyLogs,
    });
  }
}

// ─── Middleware: napi szkennelés limit ────────────────────────────────────────

export async function scanLimitGuard(req: FastifyRequest, reply: FastifyReply) {
  const prisma = (req.server as any).prisma;
  const userId = (req.user as any).id ?? (req.user as any).userId;
  const tier = await getUserTier(prisma, userId);
  if (tier === 'PREMIUM') return;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const count = await prisma.dailyLog.count({
    where: { userId, source: 'SCAN', createdAt: { gte: startOfDay } },
  });

  if (count >= TIER_LIMITS.FREE.dailyScans) {
    return reply.status(403).send({
      error: `Napi ${TIER_LIMITS.FREE.dailyScans} vonalkód-szkennelés az ingyenes korlát.`,
      upgradeRequired: true, feature: 'unlimited_scans',
      currentCount: count, limit: TIER_LIMITS.FREE.dailyScans,
    });
  }
}

// ─── Middleware: Premium-only ─────────────────────────────────────────────────

export async function requirePremium(req: FastifyRequest, reply: FastifyReply) {
  const prisma = (req.server as any).prisma;
  const userId = (req.user as any).id ?? (req.user as any).userId;
  const tier = await getUserTier(prisma, userId);
  if (tier !== 'PREMIUM') {
    return reply.status(403).send({
      error: 'Ez a funkció csak Premium előfizetőknek érhető el.',
      upgradeRequired: true, feature: 'premium_required',
    });
  }
}

// ─── Middleware: heti stat múlt-korlát ────────────────────────────────────────

export async function weeklyStatsGuard(req: FastifyRequest, reply: FastifyReply) {
  const { weeksBack } = req.query as { weeksBack?: string };
  if (!weeksBack || parseInt(weeksBack) <= 1) return;
  const prisma = (req.server as any).prisma;
  const userId = (req.user as any).id ?? (req.user as any).userId;
  const tier = await getUserTier(prisma, userId);
  if (tier === 'PREMIUM') return;
  return reply.status(403).send({
    error: 'Régebbi statisztikák csak Premium előfizetőknek érhetők el.',
    upgradeRequired: true, feature: 'full_history',
  });
}
