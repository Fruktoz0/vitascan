import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate';

const UpsertWeightSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weightKg: z.number().min(20).max(500),
});

function parseDay(date?: string) {
  const day = date ? new Date(date) : new Date();
  day.setHours(0, 0, 0, 0);
  return day;
}

async function buildWeightSummary(fastify: any, userId: string, day: Date) {
  const [profile, currentLog, latestLog, previousLog] = await Promise.all([
    fastify.prisma.userProfile.findUnique({ where: { userId } }),
    fastify.prisma.weightLog.findUnique({
      where: { userId_loggedDate: { userId, loggedDate: day } },
    }),
    fastify.prisma.weightLog.findFirst({
      where: { userId, loggedDate: { lte: day } },
      orderBy: { loggedDate: 'desc' },
    }),
    fastify.prisma.weightLog.findFirst({
      where: { userId, loggedDate: { lt: day } },
      orderBy: { loggedDate: 'desc' },
    }),
  ]);

  const effectiveLog = currentLog ?? latestLog;
  const weightKg = effectiveLog?.weightKg ?? profile?.weightKg ?? null;
  const deltaKg = weightKg != null && previousLog ? weightKg - previousLog.weightKg : 0;

  return {
    log: currentLog,
    weightKg,
    deltaKg,
    lastMeasuredAt: effectiveLog?.loggedDate ?? null,
  };
}

const weightRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /weight?date=YYYY-MM-DD — selected day's weight summary
  fastify.get('/', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user.userId;
    const { date } = request.query as { date?: string };
    const day = parseDay(date);

    return reply.send(await buildWeightSummary(fastify, userId, day));
  });

  // POST /weight — upsert a user's weight for one day
  fastify.post('/', { preHandler: authenticate }, async (request, reply) => {
    const parsed = UpsertWeightSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }

    const userId = request.user.userId;
    const day = parseDay(parsed.data.date);

    const log = await fastify.prisma.weightLog.upsert({
      where: { userId_loggedDate: { userId, loggedDate: day } },
      create: {
        userId,
        loggedDate: day,
        weightKg: parsed.data.weightKg,
      },
      update: {
        weightKg: parsed.data.weightKg,
      },
    });

    await fastify.prisma.userProfile.upsert({
      where: { userId },
      create: { userId, weightKg: parsed.data.weightKg },
      update: { weightKg: parsed.data.weightKg },
    });

    return reply.status(201).send(await buildWeightSummary(fastify, userId, day));
  });
};

export default weightRoutes;
