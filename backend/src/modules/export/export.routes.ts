import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate';
import { requirePremium } from '../../middleware/tierGuard';
import { generateExport } from '../../services/exportService';

const ExportQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formátum: YYYY-MM-DD').optional(),
  to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formátum: YYYY-MM-DD').optional(),
});

export default async function exportRoutes(fastify: FastifyInstance) {

  // GET /export — XLSX generálás és stream
  fastify.get('/', {
    preHandler: [authenticate, requirePremium],
  }, async (req, reply) => {
    const parsed = ExportQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }

    const prisma = (fastify as any).prisma;
    const userId = (req.user as any).id ?? (req.user as any).userId;

    // Időszak meghatározása
    const to   = parsed.data.to   ? new Date(parsed.data.to   + 'T23:59:59') : new Date();
    const from = parsed.data.from ? new Date(parsed.data.from + 'T00:00:00') : (() => {
      const d = new Date(to);
      d.setDate(d.getDate() - 30); // alapértelmezett: 30 nap
      return d;
    })();

    if (from > to) {
      return reply.status(400).send({ error: 'A "from" dátum nem lehet "to" után.' });
    }

    // Max 1 év korlátozás
    const diffDays = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > 366) {
      return reply.status(400).send({ error: 'Maximum 1 éves időszakot lehet exportálni.' });
    }

    // Adatok lekérése
    const [logs, waterLogs, profile, user] = await Promise.all([
      prisma.dailyLog.findMany({
        where: { userId, createdAt: { gte: from, lte: to } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.waterLog.findMany({
        where: { userId, createdAt: { gte: from, lte: to } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.userProfile.findUnique({ where: { userId } }),
      prisma.user.findUnique({ where: { id: userId }, select: { username: true, email: true, reputation: true } }),
    ]);

    // XLSX generálás
    const buffer = await generateExport({
      from,
      to,
      logs,
      waterLogs,
      user: {
        username: user?.username ?? 'Felhasználó',
        email: user?.email ?? '',
        weightKg: profile?.weightKg,
        heightCm: profile?.heightCm,
        dailyKcalGoal: profile?.dailyKcalGoal,
        dailyWaterGoalMl: profile?.dailyWaterGoalMl,
        goal: profile?.goal,
        activityLevel: profile?.activityLevel,
        tier: profile?.tier ?? 'FREE',
      },
    });

    // Fájlnév: vitascan_kovacs_peter_2025-01-01_2025-01-31.xlsx
    const safeName = (user?.username ?? 'user').replace(/[^a-z0-9_]/gi, '_').toLowerCase();
    const fromStr  = from.toISOString().split('T')[0];
    const toStr    = to.toISOString().split('T')[0];
    const filename = `vitascan_${safeName}_${fromStr}_${toStr}.xlsx`;

    reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .header('Content-Length', buffer.length);

    return reply.send(buffer);
  });

  // GET /export/preview — export előnézet (dátum-tartomány statisztika, nem generál fájlt)
  fastify.get('/preview', {
    preHandler: [authenticate, requirePremium],
  }, async (req, reply) => {
    const parsed = ExportQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }

    const prisma = (fastify as any).prisma;
    const userId = (req.user as any).id ?? (req.user as any).userId;

    const to   = parsed.data.to   ? new Date(parsed.data.to   + 'T23:59:59') : new Date();
    const from = parsed.data.from ? new Date(parsed.data.from + 'T00:00:00') : (() => {
      const d = new Date(to);
      d.setDate(d.getDate() - 30);
      return d;
    })();

    const [logCount, waterCount] = await Promise.all([
      prisma.dailyLog.count({ where: { userId, createdAt: { gte: from, lte: to } } }),
      prisma.waterLog.count({ where: { userId, createdAt: { gte: from, lte: to } } }),
    ]);

    const diffDays = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));

    return reply.send({
      from: from.toISOString().split('T')[0],
      to:   to.toISOString().split('T')[0],
      days: diffDays,
      logCount,
      waterCount,
      sheets: ['📝 Napló', '📊 Napi összesítők', '💧 Vízfogyasztás', '👤 Profil'],
    });
  });
}
