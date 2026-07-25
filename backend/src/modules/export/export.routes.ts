import { FastifyPluginAsync } from 'fastify';
import { authenticate } from '../../middleware/authenticate';
import { requirePremium } from '../../middleware/tierGuard';
import { generateExport } from '../../services/exportService';

const exportRoutes: FastifyPluginAsync = async (fastify) => {

  // GET /export/preview — export előnézet (dátum, sorok száma stb.)
  fastify.get('/preview', { preHandler: [authenticate, requirePremium] }, async (request, reply) => {
    const userId = request.user.userId;
    const { from, to } = request.query as { from?: string; to?: string };

    const fromDate = from ? new Date(from) : (() => { const d = new Date(); d.setDate(d.getDate() - 30); d.setHours(0,0,0,0); return d; })();
    const toDate   = to   ? new Date(to)   : new Date();
    fromDate.setHours(0, 0, 0, 0);
    toDate.setHours(23, 59, 59, 999);

    const [logCount, waterCount] = await Promise.all([
      fastify.prisma.dailyLog.count({
        where: { userId, createdAt: { gte: fromDate, lte: toDate } },
      }),
      fastify.prisma.waterLog.count({
        where: { userId, loggedDate: { gte: fromDate, lte: toDate } },
      }),
    ]);

    const days = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));

    return reply.send({
      from: fromDate.toISOString().split('T')[0],
      to:   toDate.toISOString().split('T')[0],
      days,
      logCount,
      waterCount,
      sheets: ['📝 Napló', '📊 Napi összesítők', '💧 Vízfogyasztás', '👤 Profil'],
    });
  });

  // GET /export — XLSX fájl letöltése
  fastify.get('/', { preHandler: [authenticate, requirePremium] }, async (request, reply) => {
    const userId = request.user.userId;
    const { from, to } = request.query as { from?: string; to?: string };

    const fromDate = from ? new Date(from) : (() => { const d = new Date(); d.setDate(d.getDate() - 30); d.setHours(0,0,0,0); return d; })();
    const toDate   = to   ? new Date(to)   : new Date();
    fromDate.setHours(0, 0, 0, 0);
    toDate.setHours(23, 59, 59, 999);

    // Adatok lekérése
    const [logs, waterLogs, user] = await Promise.all([
      fastify.prisma.dailyLog.findMany({
        where: { userId, createdAt: { gte: fromDate, lte: toDate } },
        orderBy: { createdAt: 'asc' },
      }),
      fastify.prisma.waterLog.findMany({
        where: { userId, loggedDate: { gte: fromDate, lte: toDate } },
        orderBy: { loggedDate: 'asc' },
      }),
      fastify.prisma.user.findUnique({
        where: { id: userId },
        include: { profile: true },
      }),
    ]);

    if (!user) return reply.status(404).send({ error: 'Felhasználó nem található.' });

    // Excel generálása az exportService segítségével
    const buffer = await generateExport({
      logs,
      waterLogs,
      user: {
        username:         user.username,
        email:            user.email,
        tier:             user.profile?.tier ?? 'FREE',
        weightKg:         user.profile?.weightKg ?? null,
        heightCm:         user.profile?.heightCm ?? null,
        dailyKcalGoal:    user.profile?.dailyKcalGoal ?? null,
        dailyWaterGoalMl: user.profile?.dailyWaterGoalMl ?? null,
        goal:             user.profile?.goal ?? null,
        activityLevel:    user.profile?.activityLevel ?? null,
      },
      from: fromDate,
      to:   toDate,
    });

    const filename = `vitascan_export_${fromDate.toISOString().split('T')[0]}_${toDate.toISOString().split('T')[0]}.xlsx`;

    reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .header('Content-Length', buffer.length);

    return reply.send(buffer);
  });
};

export default exportRoutes;
