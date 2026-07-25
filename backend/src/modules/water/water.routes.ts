import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate';
import { calculateWaterGoal } from '../../utils/tdee';

/** deltaMl (előjelzett) vagy legacy amountMl (mindig hozzáadás). */
const AdjustWaterSchema = z
  .object({
    deltaMl: z.number().int().min(-2000).max(2000).optional(),
    amountMl: z.number().int().min(50).max(2000).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .refine((b) => b.deltaMl != null || b.amountMl != null, {
    message: 'deltaMl vagy amountMl kötelező.',
  });

function parseDay(date?: string) {
  const day = date ? new Date(date) : new Date();
  day.setHours(0, 0, 0, 0);
  return day;
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

  // Kompatibilitás: a kliensek még `logs` tömböt várhatnak
  const logs = log
    ? [{ id: log.id, amountMl: log.totalMl, totalMl: log.totalMl, createdAt: log.updatedAt }]
    : [];

  return { log, logs, totalMl, goalMl };
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

  // POST /water — napi total növelése / csökkentése (upsert)
  fastify.post('/', { preHandler: authenticate }, async (request, reply) => {
    const parsed = AdjustWaterSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }

    const userId = request.user.userId;
    const day = parseDay(parsed.data.date);
    const delta =
      parsed.data.deltaMl != null ? parsed.data.deltaMl : (parsed.data.amountMl as number);

    const existing = await fastify.prisma.waterLog.findUnique({
      where: { userId_loggedDate: { userId, loggedDate: day } },
    });

    const nextTotal = Math.max(0, (existing?.totalMl ?? 0) + delta);

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
