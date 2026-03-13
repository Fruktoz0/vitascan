import { FastifyRequest, FastifyReply } from 'fastify';

// Checks daily log count for FREE tier (max 10/day)
export async function dailyLogLimitGuard(request: FastifyRequest, reply: FastifyReply) {
  const prisma = (request.server as any).prisma;
  const userId = request.user.userId;

  // Get user's tier from profile
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { tier: true },
  });

  // PREMIUM users: no limit
  if (profile?.tier === 'PREMIUM') return;

  // FREE users: max 10 logs per day
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const count = await prisma.dailyLog.count({
    where: {
      userId,
      createdAt: { gte: startOfDay },
    },
  });

  if (count >= 10) {
    return reply.status(403).send({
      error: 'Napi 10 naplóbejegyzés az ingyenes korlát. Válts Premiumra a korlátlan hozzáférésért!',
      upgradeRequired: true,
    });
  }
}

// Checks daily barcode scan count for FREE tier (max 5/day)
export async function scanLimitGuard(request: FastifyRequest, reply: FastifyReply) {
  const prisma = (request.server as any).prisma;
  const userId = request.user.userId;

  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { tier: true },
  });

  if (profile?.tier === 'PREMIUM') return;

  // For FREE users, scan count is tracked via DailyLog entries created through scanner
  // We use a separate check based on a scan flag — for now track via logs with source='SCAN'
  // Simplified: count logs from today as proxy (can be refined with a ScanLog model later)
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const count = await prisma.dailyLog.count({
    where: {
      userId,
      source: 'SCAN',
      createdAt: { gte: startOfDay },
    },
  });

  if (count >= 5) {
    return reply.status(403).send({
      error: 'Napi 5 vonalkód-szkennelés az ingyenes korlát. Válts Premiumra!',
      upgradeRequired: true,
    });
  }
}
