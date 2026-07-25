import { FastifyPluginAsync } from 'fastify';
import { authenticate } from '../../middleware/authenticate';
import { weeklyStatsGuard } from '../../middleware/tierGuard';

const statsRoutes: FastifyPluginAsync = async (fastify) => {

  // GET /stats/today — mai összesítő + makrók + étkezéstípus bontás
  fastify.get('/today', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user.userId;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [logs, profile] = await Promise.all([
      fastify.prisma.dailyLog.findMany({
        where: { userId, createdAt: { gte: today, lt: tomorrow } },
        orderBy: { createdAt: 'asc' },
      }),
      fastify.prisma.userProfile.findUnique({ where: { userId } }),
    ]);

    const totals = logs.reduce(
      (acc, l) => ({
        kcal:    acc.kcal    + l.kcal,
        protein: acc.protein + l.protein,
        carbs:   acc.carbs   + l.carbs,
        fat:     acc.fat     + l.fat,
        fiber:   acc.fiber   + (l.fiber ?? 0),
        sugar:   acc.sugar   + (l.sugar ?? 0),
      }),
      { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 }
    );

    // Étkezéstípus bontás
    const byMealType: Record<string, typeof logs> = {};
    for (const log of logs) {
      if (!byMealType[log.mealType]) byMealType[log.mealType] = [];
      byMealType[log.mealType].push(log);
    }

    return reply.send({
      date: today.toISOString().split('T')[0],
      totals,
      byMealType,
      logs,
      goals: {
        dailyKcalGoal:    profile?.dailyKcalGoal ?? 2000,
        dailyWaterGoalMl: profile?.dailyWaterGoalMl ?? 2000,
      },
    });
  });

  // GET /stats/day?date=YYYY-MM-DD — adott nap összesítője (+ byMealType, goals)
  fastify.get('/day', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user.userId;
    const { date } = request.query as { date?: string };

    const day = date ? new Date(date) : new Date();
    day.setHours(0, 0, 0, 0);
    const nextDay = new Date(day);
    nextDay.setDate(nextDay.getDate() + 1);

    const [logs, profile] = await Promise.all([
      fastify.prisma.dailyLog.findMany({
        where: { userId, createdAt: { gte: day, lt: nextDay } },
        orderBy: { createdAt: 'asc' },
      }),
      fastify.prisma.userProfile.findUnique({ where: { userId } }),
    ]);

    const totals = logs.reduce(
      (acc, l) => ({
        kcal:    acc.kcal    + l.kcal,
        protein: acc.protein + l.protein,
        carbs:   acc.carbs   + l.carbs,
        fat:     acc.fat     + l.fat,
        fiber:   acc.fiber   + (l.fiber ?? 0),
        sugar:   acc.sugar   + (l.sugar ?? 0),
      }),
      { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 }
    );

    const byMealType: Record<string, typeof logs> = {};
    for (const log of logs) {
      if (!byMealType[log.mealType]) byMealType[log.mealType] = [];
      byMealType[log.mealType].push(log);
    }

    return reply.send({
      date: day.toISOString().split('T')[0],
      totals,
      byMealType,
      logs,
      goals: {
        dailyKcalGoal:    profile?.dailyKcalGoal ?? 2000,
        dailyWaterGoalMl: profile?.dailyWaterGoalMl ?? 2000,
      },
    });
  });

  // GET /stats/weekly — heti adatok (7 nap visszamenőleg)
  fastify.get('/weekly', { preHandler: [authenticate, weeklyStatsGuard] }, async (request, reply) => {
    const userId = request.user.userId;
    const { weeksBack = '0' } = request.query as { weeksBack?: string };

    const weeksBackNum = parseInt(weeksBack) || 0;

    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
    endDate.setDate(endDate.getDate() - weeksBackNum * 7);

    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 6);
    startDate.setHours(0, 0, 0, 0);

    const logs = await fastify.prisma.dailyLog.findMany({
      where: { userId, createdAt: { gte: startDate, lte: endDate } },
      orderBy: { createdAt: 'asc' },
    });

    // Napi bontás generálása (üres napok is legyenek benne)
    const days: { date: string; kcal: number; protein: number; carbs: number; fat: number; logCount: number }[] = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];

      const dayLogs = logs.filter(
        (l) => l.createdAt.toISOString().split('T')[0] === dateStr
      );

      days.push({
        date: dateStr,
        kcal:     Math.round(dayLogs.reduce((s, l) => s + l.kcal, 0) * 10) / 10,
        protein:  Math.round(dayLogs.reduce((s, l) => s + l.protein, 0) * 10) / 10,
        carbs:    Math.round(dayLogs.reduce((s, l) => s + l.carbs, 0) * 10) / 10,
        fat:      Math.round(dayLogs.reduce((s, l) => s + l.fat, 0) * 10) / 10,
        logCount: dayLogs.length,
      });
    }

    const avg = {
      kcal:    Math.round(days.reduce((s, d) => s + d.kcal, 0) / 7),
      protein: Math.round(days.reduce((s, d) => s + d.protein, 0) / 7 * 10) / 10,
      carbs:   Math.round(days.reduce((s, d) => s + d.carbs, 0) / 7 * 10) / 10,
      fat:     Math.round(days.reduce((s, d) => s + d.fat, 0) / 7 * 10) / 10,
    };

    return reply.send({ days, avg, from: startDate.toISOString().split('T')[0], to: endDate.toISOString().split('T')[0] });
  });

  // GET /stats/monthly?year=2025&month=3 — havi adatok (PREMIUM)
  fastify.get('/monthly', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user.userId;
    const { year, month } = request.query as { year?: string; month?: string };

    const profile = await fastify.prisma.userProfile.findUnique({ where: { userId } });
    if (profile?.tier !== 'PREMIUM') {
      return reply.status(403).send({
        error: 'A havi statisztika csak Premium előfizetőknek érhető el.',
        upgradeRequired: true,
        feature: 'monthly_stats',
      });
    }

    const y = parseInt(year ?? String(new Date().getFullYear()));
    const m = parseInt(month ?? String(new Date().getMonth() + 1));

    const startDate = new Date(y, m - 1, 1);
    const endDate = new Date(y, m, 0, 23, 59, 59, 999);

    const logs = await fastify.prisma.dailyLog.findMany({
      where: { userId, createdAt: { gte: startDate, lte: endDate } },
      orderBy: { createdAt: 'asc' },
    });

    // Napi bontás
    const daysInMonth = endDate.getDate();
    const days = [];

    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      const dayLogs = logs.filter((l) => l.createdAt.toISOString().split('T')[0] === dateStr);
      days.push({
        date: dateStr,
        kcal:    Math.round(dayLogs.reduce((s, l) => s + l.kcal, 0)),
        protein: Math.round(dayLogs.reduce((s, l) => s + l.protein, 0) * 10) / 10,
        carbs:   Math.round(dayLogs.reduce((s, l) => s + l.carbs, 0) * 10) / 10,
        fat:     Math.round(dayLogs.reduce((s, l) => s + l.fat, 0) * 10) / 10,
        logCount: dayLogs.length,
      });
    }

    const activeDays = days.filter((d) => d.logCount > 0).length;
    const totalKcal = days.reduce((s, d) => s + d.kcal, 0);

    return reply.send({
      year: y,
      month: m,
      days,
      summary: {
        activeDays,
        totalKcal: Math.round(totalKcal),
        avgKcalPerActiveDay: activeDays > 0 ? Math.round(totalKcal / activeDays) : 0,
        totalLogs: logs.length,
      },
    });
  });

  // GET /stats/streak — egymást követő aktív napok
  fastify.get('/streak', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user.userId;

    // Az utolsó 90 nap logjait nézzük
    const since = new Date();
    since.setDate(since.getDate() - 90);
    since.setHours(0, 0, 0, 0);

    const logs = await fastify.prisma.dailyLog.findMany({
      where: { userId, createdAt: { gte: since } },
      select: { createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    // Egyedi napok halmaza
    const activeDates = new Set(logs.map((l) => l.createdAt.toISOString().split('T')[0]));

    // Streak számolás: ma-tól visszafelé
    let streak = 0;
    const today = new Date();

    for (let i = 0; i < 90; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      if (activeDates.has(dateStr)) {
        streak++;
      } else {
        // Ha ma nincs bejegyzés, az még nem töri meg a sorozatot
        if (i === 0) continue;
        break;
      }
    }

    const messages = [
      streak === 0 ? 'Kezdd el a sorozatot ma!' :
      streak === 1 ? 'Nagyszerű kezdet! Folytasd holnap is!' :
      streak < 7   ? `${streak} napos sorozat! Csak így tovább!` :
      streak < 30  ? `🔥 ${streak} nap! Fantasztikus kitartás!` :
                     `🏆 ${streak} napos legendás sorozat!`,
    ];

    return reply.send({ streak, message: messages[0] });
  });
};

export default statsRoutes;
