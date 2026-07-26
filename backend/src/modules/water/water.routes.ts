import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate';
import { calculateWaterGoal } from '../../utils/tdee';

/** deltaMl (előjelzett), legacy amountMl, vagy abszolút totalMl. */
const AdjustWaterSchema = z
  .object({
    deltaMl: z.number().int().min(-2000).max(2000).optional(),
    amountMl: z.number().int().min(50).max(2000).optional(),
    totalMl: z.number().int().min(0).max(20000).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .refine((b) => b.deltaMl != null || b.amountMl != null || b.totalMl != null, {
    message: 'deltaMl, amountMl vagy totalMl kötelező.',
  });

const UpdateWaterSchema = z
  .object({
    totalMl: z.number().int().min(0).max(20000).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .refine((d) => d.totalMl != null || d.date != null, {
    message: 'Legalább a mennyiséget vagy a dátumot meg kell adni.',
  });

function parseDay(date?: string) {
  const day = date ? new Date(date) : new Date();
  day.setHours(0, 0, 0, 0);
  return day;
}

function toDateStr(d: Date) {
  return d.toISOString().split('T')[0];
}

async function resolveGoalMl(fastify: any, userId: string) {
  const profile = await fastify.prisma.userProfile.findUnique({ where: { userId } });
  return (
    profile?.dailyWaterGoalMl ??
    (profile?.weightKg ? calculateWaterGoal(profile.weightKg) : 2000)
  );
}

async function buildWaterSummary(fastify: any, userId: string, day: Date) {
  const [log, goalMl] = await Promise.all([
    fastify.prisma.waterLog.findUnique({
      where: { userId_loggedDate: { userId, loggedDate: day } },
    }),
    resolveGoalMl(fastify, userId),
  ]);

  const totalMl = log?.totalMl ?? 0;

  const logs = log
    ? [
        {
          id: log.id,
          amountMl: log.totalMl,
          totalMl: log.totalMl,
          createdAt: log.updatedAt,
        },
      ]
    : [];

  return {
    log: log
      ? {
          id: log.id,
          totalMl: log.totalMl,
          loggedDate: toDateStr(log.loggedDate),
          updatedAt: log.updatedAt,
        }
      : null,
    logs,
    totalMl,
    goalMl,
  };
}

const waterRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /water?date=YYYY-MM-DD — napi összesítés
  fastify.get('/', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user.userId;
    const { date } = request.query as { date?: string };
    return reply.send(await buildWaterSummary(fastify, userId, parseDay(date)));
  });

  // GET /water/today
  fastify.get('/today', { preHandler: authenticate }, async (request, reply) => {
    return reply.send(await buildWaterSummary(fastify, request.user.userId, parseDay()));
  });

  // GET /water/history
  fastify.get('/history', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user.userId;
    const goalMl = await resolveGoalMl(fastify, userId);
    const rows = await fastify.prisma.waterLog.findMany({
      where: { userId },
      orderBy: [{ loggedDate: 'desc' }, { updatedAt: 'desc' }],
      take: 90,
    });

    const items = rows.map(
      (l: { id: string; totalMl: number; loggedDate: Date; updatedAt: Date }, idx: number) => {
        const prev = rows[idx + 1];
        const deltaMl = prev != null ? l.totalMl - prev.totalMl : null;
        return {
          id: l.id,
          totalMl: l.totalMl,
          loggedDate: toDateStr(l.loggedDate),
          updatedAt: l.updatedAt,
          deltaMl,
        };
      },
    );

    return reply.send({
      latest: items[0] ?? null,
      items,
      goalMl,
    });
  });

  // POST /water — napi total növelése / csökkentése / abszolút beállítás
  fastify.post('/', { preHandler: authenticate }, async (request, reply) => {
    const parsed = AdjustWaterSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }

    const userId = request.user.userId;
    const day = parseDay(parsed.data.date);

    const existing = await fastify.prisma.waterLog.findUnique({
      where: { userId_loggedDate: { userId, loggedDate: day } },
    });

    let nextTotal: number;
    if (parsed.data.totalMl != null) {
      nextTotal = Math.max(0, parsed.data.totalMl);
    } else {
      const delta =
        parsed.data.deltaMl != null ? parsed.data.deltaMl : (parsed.data.amountMl as number);
      nextTotal = Math.max(0, (existing?.totalMl ?? 0) + delta);
    }

    if (nextTotal === 0 && existing) {
      await fastify.prisma.waterLog.delete({ where: { id: existing.id } });
      return reply.send(await buildWaterSummary(fastify, userId, day));
    }

    if (nextTotal === 0) {
      return reply.send(await buildWaterSummary(fastify, userId, day));
    }

    await fastify.prisma.waterLog.upsert({
      where: { userId_loggedDate: { userId, loggedDate: day } },
      create: { userId, loggedDate: day, totalMl: nextTotal },
      update: { totalMl: nextTotal },
    });

    return reply.status(201).send(await buildWaterSummary(fastify, userId, day));
  });

  // PATCH /water/:id
  fastify.patch('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = UpdateWaterSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    const userId = request.user.userId;
    const existing = await fastify.prisma.waterLog.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return reply.status(404).send({ error: 'A bejegyzés nem található.' });
    }

    const nextDate = parsed.data.date ? parseDay(parsed.data.date) : existing.loggedDate;
    const nextTotal = parsed.data.totalMl ?? existing.totalMl;

    if (toDateStr(nextDate) !== toDateStr(existing.loggedDate)) {
      const clash = await fastify.prisma.waterLog.findFirst({
        where: {
          userId,
          loggedDate: nextDate,
          NOT: { id },
        },
      });
      if (clash) {
        return reply.status(409).send({
          error: 'Erre a napra már van vízfogyasztás bejegyzés.',
        });
      }
    }

    if (nextTotal === 0) {
      await fastify.prisma.waterLog.delete({ where: { id } });
      return reply.send({ ok: true, deleted: true });
    }

    const log = await fastify.prisma.waterLog.update({
      where: { id },
      data: {
        totalMl: nextTotal,
        loggedDate: nextDate,
      },
    });

    return reply.send({
      id: log.id,
      totalMl: log.totalMl,
      loggedDate: toDateStr(log.loggedDate),
      updatedAt: log.updatedAt,
    });
  });

  // DELETE /water/:id — teljes napi bejegyzés törlése
  fastify.delete('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const log = await fastify.prisma.waterLog.findUnique({ where: { id } });

    if (!log) return reply.status(404).send({ error: 'Nem található.' });
    if (log.userId !== request.user.userId) {
      return reply.status(403).send({ error: 'Nincs jogosultsága.' });
    }

    await fastify.prisma.waterLog.delete({ where: { id } });
    return reply.send({ message: 'Törölve.' });
  });
};

export default waterRoutes;
