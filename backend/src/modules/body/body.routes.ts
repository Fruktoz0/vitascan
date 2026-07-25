import { FastifyPluginAsync } from 'fastify';
import { authenticate } from '../../middleware/authenticate';
import {
  BODY_PARTS,
  GenerateBodyAnalysisSchema,
  HistoryQuerySchema,
  MAX_BODY_ANALYSES_PER_DAY,
  UpsertGoalsSchema,
  UpsertMeasurementSchema,
} from './body.schema';
import { generateBodyAnalysisWithGemini } from './body.gemini';

function parseDay(date?: string) {
  const day = date ? new Date(date) : new Date();
  day.setHours(0, 0, 0, 0);
  return day;
}

function toDateStr(d: Date) {
  return d.toISOString().split('T')[0];
}

const bodyRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /body/summary — latest per body part
  fastify.get('/summary', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user.userId;
    const parts = await Promise.all(
      BODY_PARTS.map(async (bodyPart) => {
        const latest = await fastify.prisma.bodyMeasurementLog.findFirst({
          where: { userId, bodyPart },
          orderBy: [{ loggedDate: 'desc' }, { updatedAt: 'desc' }],
        });
        return {
          bodyPart,
          valueCm: latest?.valueCm ?? null,
          loggedDate: latest ? toDateStr(latest.loggedDate) : null,
        };
      }),
    );
    const goals = await fastify.prisma.bodyMeasurementGoal.findMany({ where: { userId } });
    return reply.send({
      parts,
      goals: goals.map((g) => ({ bodyPart: g.bodyPart, goalCm: g.goalCm })),
    });
  });

  // POST /body — upsert measurement for a day
  fastify.post('/', { preHandler: authenticate }, async (request, reply) => {
    const parsed = UpsertMeasurementSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    const userId = request.user.userId;
    const day = parseDay(parsed.data.date);
    const log = await fastify.prisma.bodyMeasurementLog.upsert({
      where: {
        userId_bodyPart_loggedDate: {
          userId,
          bodyPart: parsed.data.bodyPart,
          loggedDate: day,
        },
      },
      create: {
        userId,
        bodyPart: parsed.data.bodyPart,
        valueCm: parsed.data.valueCm,
        loggedDate: day,
      },
      update: { valueCm: parsed.data.valueCm },
    });
    return reply.status(201).send({
      id: log.id,
      bodyPart: log.bodyPart,
      valueCm: log.valueCm,
      loggedDate: toDateStr(log.loggedDate),
      updatedAt: log.updatedAt,
    });
  });

  // GET /body/history?bodyPart=
  fastify.get('/history', { preHandler: authenticate }, async (request, reply) => {
    const parsed = HistoryQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    const userId = request.user.userId;
    const { bodyPart } = parsed.data;

    const logs = await fastify.prisma.bodyMeasurementLog.findMany({
      where: { userId, bodyPart },
      orderBy: [{ loggedDate: 'desc' }, { updatedAt: 'desc' }],
      take: 90,
    });

    const items = logs.map((l, idx) => {
      const prev = logs[idx + 1];
      const deltaCm =
        prev != null ? Math.round((l.valueCm - prev.valueCm) * 10) / 10 : null;
      return {
        id: l.id,
        valueCm: l.valueCm,
        loggedDate: toDateStr(l.loggedDate),
        updatedAt: l.updatedAt,
        deltaCm,
      };
    });

    const latest = items[0] ?? null;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    monthStart.setHours(0, 0, 0, 0);
    const monthLogs = logs
      .filter((l) => l.loggedDate >= monthStart)
      .sort((a, b) => a.loggedDate.getTime() - b.loggedDate.getTime());
    let monthlyChangeCm: number | null = null;
    if (monthLogs.length >= 2) {
      monthlyChangeCm =
        Math.round(
          (monthLogs[monthLogs.length - 1].valueCm - monthLogs[0].valueCm) * 10,
        ) / 10;
    } else if (monthLogs.length === 1 && logs.length >= 2) {
      const before = logs.find((l) => l.loggedDate < monthStart);
      if (before) {
        monthlyChangeCm = Math.round((monthLogs[0].valueCm - before.valueCm) * 10) / 10;
      }
    }

    const goal = await fastify.prisma.bodyMeasurementGoal.findUnique({
      where: { userId_bodyPart: { userId, bodyPart } },
    });

    return reply.send({
      bodyPart,
      latest,
      items,
      monthlyChangeCm,
      goalCm: goal?.goalCm ?? null,
    });
  });

  // GET /body/goals
  fastify.get('/goals', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user.userId;
    const goals = await fastify.prisma.bodyMeasurementGoal.findMany({ where: { userId } });
    return reply.send({
      goals: goals.map((g) => ({ bodyPart: g.bodyPart, goalCm: g.goalCm })),
    });
  });

  // PUT /body/goals
  fastify.put('/goals', { preHandler: authenticate }, async (request, reply) => {
    const parsed = UpsertGoalsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    const userId = request.user.userId;
    const updated = [];
    for (const g of parsed.data.goals) {
      const row = await fastify.prisma.bodyMeasurementGoal.upsert({
        where: { userId_bodyPart: { userId, bodyPart: g.bodyPart } },
        create: { userId, bodyPart: g.bodyPart, goalCm: g.goalCm },
        update: { goalCm: g.goalCm },
      });
      updated.push({ bodyPart: row.bodyPart, goalCm: row.goalCm });
    }
    return reply.send({ goals: updated });
  });

  // GET /body/analysis — today's analysis
  fastify.get('/analysis', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user.userId;
    const today = parseDay();
    const row = await fastify.prisma.aiBodyAnalysis.findUnique({
      where: { userId_loggedDate: { userId, loggedDate: today } },
    });
    const count = row?.generationCount ?? 0;
    return reply.send({
      content: row?.content ?? null,
      generationCount: count,
      remaining: Math.max(0, MAX_BODY_ANALYSES_PER_DAY - count),
      limit: MAX_BODY_ANALYSES_PER_DAY,
      updatedAt: row?.updatedAt ?? null,
    });
  });

  // POST /body/analysis — generate / overwrite, max 3/day
  fastify.post('/analysis', { preHandler: authenticate }, async (request, reply) => {
    const parsed = GenerateBodyAnalysisSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }

    const userId = request.user.userId;
    const today = parseDay();
    const existing = await fastify.prisma.aiBodyAnalysis.findUnique({
      where: { userId_loggedDate: { userId, loggedDate: today } },
    });
    const currentCount = existing?.generationCount ?? 0;
    if (currentCount >= MAX_BODY_ANALYSES_PER_DAY) {
      return reply.status(429).send({
        error: 'Elérted a napi AI testelemzési limitet (3). Próbáld holnap.',
        remaining: 0,
        limit: MAX_BODY_ANALYSES_PER_DAY,
      });
    }

    const [profile, goals, latestLogs] = await Promise.all([
      fastify.prisma.userProfile.findUnique({ where: { userId } }),
      fastify.prisma.bodyMeasurementGoal.findMany({ where: { userId } }),
      Promise.all(
        BODY_PARTS.map((bodyPart) =>
          fastify.prisma.bodyMeasurementLog.findFirst({
            where: { userId, bodyPart },
            orderBy: [{ loggedDate: 'desc' }, { updatedAt: 'desc' }],
          }),
        ),
      ),
    ]);

    const measurements = latestLogs
      .filter(Boolean)
      .map((l) => ({
        bodyPart: l!.bodyPart,
        valueCm: l!.valueCm,
        loggedDate: toDateStr(l!.loggedDate),
      }));

    if (measurements.length === 0) {
      return reply.status(400).send({
        error: 'Nincs elég testadat. Adj hozzá legalább egy mérést az elemzéshez.',
      });
    }

    try {
      const analysis = await generateBodyAnalysisWithGemini({
        locale: parsed.data.locale ?? 'hu',
        profile: {
          gender: profile?.gender,
          birthYear: profile?.birthYear,
          heightCm: profile?.heightCm,
          weightKg: profile?.weightKg,
          activityLevel: profile?.activityLevel,
          goal: profile?.goal,
        },
        measurements,
        goals: goals.map((g) => ({ bodyPart: g.bodyPart, goalCm: g.goalCm })),
      });

      const nextCount = currentCount + 1;
      const content = JSON.stringify(analysis);
      const row = await fastify.prisma.aiBodyAnalysis.upsert({
        where: { userId_loggedDate: { userId, loggedDate: today } },
        create: {
          userId,
          loggedDate: today,
          content,
          generationCount: nextCount,
        },
        update: {
          content,
          generationCount: nextCount,
        },
      });

      return reply.send({
        content: row.content,
        analysis,
        generationCount: row.generationCount,
        remaining: Math.max(0, MAX_BODY_ANALYSES_PER_DAY - row.generationCount),
        limit: MAX_BODY_ANALYSES_PER_DAY,
        updatedAt: row.updatedAt,
      });
    } catch (err: any) {
      const status = err?.statusCode && Number.isFinite(err.statusCode) ? err.statusCode : 502;
      return reply.status(status).send({
        error: err?.message || 'A testelemzés sikertelen.',
        remaining: Math.max(0, MAX_BODY_ANALYSES_PER_DAY - currentCount),
        limit: MAX_BODY_ANALYSES_PER_DAY,
      });
    }
  });
};

export default bodyRoutes;
