import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate';
import { getDailySummary, getWeeklyStats, getMonthlyStats } from './stats.service';

const statsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /stats/today — Home képernyő fő adatok
  fastify.get('/today', { preHandler: authenticate }, async (request, reply) => {
    const summary = await getDailySummary(fastify.prisma, request.user.userId);
    return reply.send(summary);
  });

  // GET /stats/day?date=2025-03-01 — adott nap adatai
  fastify.get('/day', { preHandler: authenticate }, async (request, reply) => {
    const { date } = z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(request.query);

    const summary = await getDailySummary(fastify.prisma, request.user.userId, date);
    return reply.send(summary);
  });

  // GET /stats/weekly — utolsó 7 nap (FREE: csak a jelenlegi hét, PREMIUM: bármikor)
  fastify.get('/weekly', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user.userId;

    // Tier ellenőrzés
    const profile = await fastify.prisma.userProfile.findUnique({ where: { userId } });
    const isPremium = profile?.tier === 'PREMIUM';

    const stats = await getWeeklyStats(fastify.prisma, userId);

    // FREE usereknek csak az aktuális hét adatait küldjük
    if (!isPremium) {
      const today = new Date();
      const dayOfWeek = today.getDay(); // 0=vas, 1=hét...
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      startOfWeek.setHours(0, 0, 0, 0);

      stats.days = stats.days.filter((d) => new Date(d.date) >= startOfWeek);
      return reply.send({ ...stats, premiumRequired: false, tier: 'FREE' });
    }

    return reply.send({ ...stats, tier: 'PREMIUM' });
  });

  // GET /stats/monthly?year=2025&month=3 — PREMIUM only
  fastify.get('/monthly', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user.userId;
    const profile = await fastify.prisma.userProfile.findUnique({ where: { userId } });

    if (profile?.tier !== 'PREMIUM') {
      return reply.status(403).send({
        error: 'Havi statisztika csak Premium felhasználóknak elérhető.',
        upgradeRequired: true,
      });
    }

    const { year, month } = z.object({
      year: z.coerce.number().min(2020).max(2100),
      month: z.coerce.number().min(1).max(12),
    }).parse(request.query);

    const stats = await getMonthlyStats(fastify.prisma, userId, year, month);
    return reply.send(stats);
  });

  // GET /stats/streak — napi bejelentkezési sorozat (gamification)
  fastify.get('/streak', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user.userId;

    // Visszafelé számolva nézi hány egymást követő napra van log
    let streak = 0;
    let currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);

    for (let i = 0; i < 365; i++) {
      const start = new Date(currentDate);
      const end = new Date(currentDate);
      end.setHours(23, 59, 59, 999);

      const count = await fastify.prisma.dailyLog.count({
        where: { userId, createdAt: { gte: start, lte: end } },
      });

      if (count === 0) break;
      streak++;
      currentDate.setDate(currentDate.getDate() - 1);
    }

    return reply.send({ streak, message: streak > 0 ? `${streak} napos sorozat! 🔥` : 'Kezdj el naplózni ma!' });
  });
};

export default statsRoutes;
