import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate';

const UpsertWeightSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weightKg: z.number().min(20).max(500),
});

const UpdateWeightSchema = z
  .object({
    weightKg: z.number().min(20).max(500).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .refine((d) => d.weightKg != null || d.date != null, {
    message: 'Legalább a súlyt vagy a dátumot meg kell adni.',
  });

const DateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const HistoryQuerySchema = z.object({
  from: DateKeySchema.optional(),
  to: DateKeySchema.optional(),
});

function parseDay(date?: string) {
  const day = date ? new Date(date) : new Date();
  day.setHours(0, 0, 0, 0);
  return day;
}

function toDateStr(d: Date) {
  return d.toISOString().split('T')[0];
}

async function syncProfileToLatestWeight(fastify: any, userId: string) {
  const latest = await fastify.prisma.weightLog.findFirst({
    where: { userId },
    orderBy: [{ loggedDate: 'desc' }, { updatedAt: 'desc' }],
  });
  if (!latest) return;
  await fastify.prisma.userProfile.upsert({
    where: { userId },
    create: { userId, weightKg: latest.weightKg },
    update: { weightKg: latest.weightKg },
  });
}

async function buildWeightSummary(fastify: any, userId: string, day: Date) {
  const [profile, currentLog, previousLog, latestAny] = await Promise.all([
    fastify.prisma.userProfile.findUnique({ where: { userId } }),
    fastify.prisma.weightLog.findUnique({
      where: { userId_loggedDate: { userId, loggedDate: day } },
    }),
    fastify.prisma.weightLog.findFirst({
      where: { userId, loggedDate: { lt: day } },
      orderBy: { loggedDate: 'desc' },
    }),
    fastify.prisma.weightLog.findFirst({
      where: { userId },
      orderBy: [{ loggedDate: 'desc' }, { updatedAt: 'desc' }],
    }),
  ]);

  const weightKg = currentLog?.weightKg ?? null;
  const suggestedWeightKg =
    currentLog?.weightKg ?? latestAny?.weightKg ?? profile?.weightKg ?? null;
  const deltaKg =
    weightKg != null && previousLog != null
      ? Math.round((weightKg - previousLog.weightKg) * 10) / 10
      : null;

  return {
    log: currentLog
      ? {
          id: currentLog.id,
          weightKg: currentLog.weightKg,
          loggedDate: toDateStr(currentLog.loggedDate),
          updatedAt: currentLog.updatedAt,
        }
      : null,
    weightKg,
    suggestedWeightKg,
    deltaKg,
    lastMeasuredAt: currentLog ? toDateStr(currentLog.loggedDate) : null,
  };
}

const weightRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /weight?date=YYYY-MM-DD — that day's logged weight only (no carry-forward)
  fastify.get('/', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user.userId;
    const { date } = request.query as { date?: string };
    const day = parseDay(date);
    return reply.send(await buildWeightSummary(fastify, userId, day));
  });

  // GET /weight/history?from=&to=
  fastify.get('/history', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user.userId;
    const parsed = HistoryQuerySchema.safeParse(request.query);
    const from = parsed.success ? parsed.data.from : undefined;
    const to = parsed.success ? parsed.data.to : undefined;
    const hasRange = Boolean(from || to);

    const dateFilter: { gte?: Date; lt?: Date } = {};
    if (from) dateFilter.gte = parseDay(from);
    if (to) {
      const endExclusive = parseDay(to);
      endExclusive.setDate(endExclusive.getDate() + 1);
      dateFilter.lt = endExclusive;
    }

    const logs = await fastify.prisma.weightLog.findMany({
      where: {
        userId,
        ...(hasRange ? { loggedDate: dateFilter } : {}),
      },
      orderBy: [{ loggedDate: 'desc' }, { updatedAt: 'desc' }],
      take: hasRange ? 500 : 90,
    });

    const summaryLogs = hasRange
      ? await fastify.prisma.weightLog.findMany({
          where: { userId },
          orderBy: [{ loggedDate: 'desc' }, { updatedAt: 'desc' }],
          take: 90,
        })
      : logs;

    const items = logs.map((l: { id: string; weightKg: number; loggedDate: Date; updatedAt: Date }, idx: number) => {
      const prev = logs[idx + 1];
      const deltaKg =
        prev != null ? Math.round((l.weightKg - prev.weightKg) * 10) / 10 : null;
      return {
        id: l.id,
        weightKg: l.weightKg,
        loggedDate: toDateStr(l.loggedDate),
        updatedAt: l.updatedAt,
        deltaKg,
      };
    });

    const summaryItems = summaryLogs.map(
      (l: { id: string; weightKg: number; loggedDate: Date; updatedAt: Date }, idx: number) => {
        const prev = summaryLogs[idx + 1];
        const deltaKg =
          prev != null ? Math.round((l.weightKg - prev.weightKg) * 10) / 10 : null;
        return {
          id: l.id,
          weightKg: l.weightKg,
          loggedDate: toDateStr(l.loggedDate),
          updatedAt: l.updatedAt,
          deltaKg,
        };
      },
    );

    const latest = summaryItems[0] ?? null;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    monthStart.setHours(0, 0, 0, 0);
    const monthLogs = summaryLogs.filter((l: { loggedDate: Date }) => l.loggedDate >= monthStart);
    let monthlyChangeKg: number | null = null;
    if (monthLogs.length >= 2) {
      const newest = monthLogs[0];
      const oldest = monthLogs[monthLogs.length - 1];
      monthlyChangeKg = Math.round((newest.weightKg - oldest.weightKg) * 10) / 10;
    } else if (monthLogs.length === 1 && summaryLogs.length >= 2) {
      const before = summaryLogs.find((l: { loggedDate: Date }) => l.loggedDate < monthStart);
      if (before) {
        monthlyChangeKg = Math.round((monthLogs[0].weightKg - before.weightKg) * 10) / 10;
      }
    }

    return reply.send({
      latest,
      items,
      monthlyChangeKg,
    });
  });

  // POST /weight — upsert a user's weight for one day; profile = latest log
  fastify.post('/', { preHandler: authenticate }, async (request, reply) => {
    const parsed = UpsertWeightSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }

    const userId = request.user.userId;
    const day = parseDay(parsed.data.date);

    await fastify.prisma.weightLog.upsert({
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

    await syncProfileToLatestWeight(fastify, userId);

    return reply.status(201).send(await buildWeightSummary(fastify, userId, day));
  });

  // PATCH /weight/:id
  fastify.patch('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = UpdateWeightSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    const userId = request.user.userId;
    const existing = await fastify.prisma.weightLog.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return reply.status(404).send({ error: 'A mérés nem található.' });
    }

    const nextDate = parsed.data.date ? parseDay(parsed.data.date) : existing.loggedDate;
    const nextWeight = parsed.data.weightKg ?? existing.weightKg;

    if (toDateStr(nextDate) !== toDateStr(existing.loggedDate)) {
      const clash = await fastify.prisma.weightLog.findFirst({
        where: {
          userId,
          loggedDate: nextDate,
          NOT: { id },
        },
      });
      if (clash) {
        return reply.status(409).send({
          error: 'Erre a napra már van súlymérés.',
        });
      }
    }

    const log = await fastify.prisma.weightLog.update({
      where: { id },
      data: {
        weightKg: nextWeight,
        loggedDate: nextDate,
      },
    });

    await syncProfileToLatestWeight(fastify, userId);

    return reply.send({
      id: log.id,
      weightKg: log.weightKg,
      loggedDate: toDateStr(log.loggedDate),
      updatedAt: log.updatedAt,
    });
  });

  // DELETE /weight/:id
  fastify.delete('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.userId;
    const existing = await fastify.prisma.weightLog.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return reply.status(404).send({ error: 'A mérés nem található.' });
    }
    await fastify.prisma.weightLog.delete({ where: { id } });
    await syncProfileToLatestWeight(fastify, userId);
    return reply.send({ ok: true });
  });
};

export default weightRoutes;
