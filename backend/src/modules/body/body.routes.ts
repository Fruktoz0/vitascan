import { FastifyPluginAsync } from 'fastify';
import { authenticate } from '../../middleware/authenticate';
import {
  BODY_PARTS,
  FatHistoryQuerySchema,
  GenerateBodyAnalysisSchema,
  HistoryQuerySchema,
  MAX_BODY_ANALYSES_PER_DAY,
  UpdateFatSchema,
  UpdateMeasurementSchema,
  UpsertFatGoalSchema,
  UpsertFatSchema,
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
    const latestFat = await fastify.prisma.bodyFatLog.findFirst({
      where: { userId },
      orderBy: [{ loggedDate: 'desc' }, { updatedAt: 'desc' }],
    });
    return reply.send({
      parts,
      goals: goals.map((g) => ({ bodyPart: g.bodyPart, goalCm: g.goalCm })),
      fat: latestFat
        ? { fatPercent: latestFat.fatPercent, loggedDate: toDateStr(latestFat.loggedDate) }
        : null,
    });
  });

  // GET /body/fat/history?from=&to=
  fastify.get('/fat/history', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user.userId;
    const parsed = FatHistoryQuerySchema.safeParse(request.query);
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

    const logs = await fastify.prisma.bodyFatLog.findMany({
      where: { userId, ...(hasRange ? { loggedDate: dateFilter } : {}) },
      orderBy: [{ loggedDate: 'desc' }, { updatedAt: 'desc' }],
      take: hasRange ? 500 : 90,
    });

    const summaryLogs = hasRange
      ? await fastify.prisma.bodyFatLog.findMany({
          where: { userId },
          orderBy: [{ loggedDate: 'desc' }, { updatedAt: 'desc' }],
          take: 90,
        })
      : logs;

    const toItem = (
      l: { id: string; fatPercent: number; loggedDate: Date; updatedAt: Date },
      prev?: { fatPercent: number },
    ) => ({
      id: l.id,
      fatPercent: l.fatPercent,
      loggedDate: toDateStr(l.loggedDate),
      updatedAt: l.updatedAt,
      deltaPercent: prev != null ? Math.round((l.fatPercent - prev.fatPercent) * 10) / 10 : null,
    });

    const items = logs.map((l, idx) => toItem(l, logs[idx + 1]));
    const latest = (hasRange ? summaryLogs : logs).map((l, idx) =>
      toItem(l, (hasRange ? summaryLogs : logs)[idx + 1]),
    )[0] ?? null;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    monthStart.setHours(0, 0, 0, 0);
    const monthLogs = summaryLogs
      .filter((l) => l.loggedDate >= monthStart)
      .sort((a, b) => a.loggedDate.getTime() - b.loggedDate.getTime());
    let monthlyChangePercent: number | null = null;
    if (monthLogs.length >= 2) {
      monthlyChangePercent =
        Math.round((monthLogs[monthLogs.length - 1].fatPercent - monthLogs[0].fatPercent) * 10) / 10;
    } else if (monthLogs.length === 1 && summaryLogs.length >= 2) {
      const before = summaryLogs.find((l) => l.loggedDate < monthStart);
      if (before) {
        monthlyChangePercent = Math.round((monthLogs[0].fatPercent - before.fatPercent) * 10) / 10;
      }
    }

    const goal = await fastify.prisma.bodyFatGoal.findUnique({ where: { userId } });

    return reply.send({
      latest,
      items,
      monthlyChangePercent,
      goalPercent: goal?.goalPercent ?? null,
    });
  });

  // POST /body/fat
  fastify.post('/fat', { preHandler: authenticate }, async (request, reply) => {
    const parsed = UpsertFatSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    const userId = request.user.userId;
    const day = parseDay(parsed.data.date);
    const log = await fastify.prisma.bodyFatLog.upsert({
      where: { userId_loggedDate: { userId, loggedDate: day } },
      create: { userId, loggedDate: day, fatPercent: parsed.data.fatPercent },
      update: { fatPercent: parsed.data.fatPercent },
    });
    return reply.status(201).send({
      id: log.id,
      fatPercent: log.fatPercent,
      loggedDate: toDateStr(log.loggedDate),
      updatedAt: log.updatedAt,
    });
  });

  // PUT /body/fat/goal
  fastify.put('/fat/goal', { preHandler: authenticate }, async (request, reply) => {
    const parsed = UpsertFatGoalSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    const userId = request.user.userId;
    const goal = await fastify.prisma.bodyFatGoal.upsert({
      where: { userId },
      create: { userId, goalPercent: parsed.data.goalPercent },
      update: { goalPercent: parsed.data.goalPercent },
    });
    return reply.send({ goalPercent: goal.goalPercent });
  });

  // PATCH /body/fat/:id
  fastify.patch('/fat/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = UpdateFatSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    const userId = request.user.userId;
    const existing = await fastify.prisma.bodyFatLog.findFirst({ where: { id, userId } });
    if (!existing) {
      return reply.status(404).send({ error: 'A mérés nem található.' });
    }
    const nextDate = parsed.data.date ? parseDay(parsed.data.date) : existing.loggedDate;
    const nextValue = parsed.data.fatPercent ?? existing.fatPercent;
    if (toDateStr(nextDate) !== toDateStr(existing.loggedDate)) {
      const clash = await fastify.prisma.bodyFatLog.findFirst({
        where: { userId, loggedDate: nextDate, NOT: { id } },
      });
      if (clash) {
        return reply.status(409).send({ error: 'Erre a napra már van testzsír mérés.' });
      }
    }
    const log = await fastify.prisma.bodyFatLog.update({
      where: { id },
      data: { fatPercent: nextValue, loggedDate: nextDate },
    });
    return reply.send({
      id: log.id,
      fatPercent: log.fatPercent,
      loggedDate: toDateStr(log.loggedDate),
      updatedAt: log.updatedAt,
    });
  });

  // DELETE /body/fat/:id
  fastify.delete('/fat/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.userId;
    const existing = await fastify.prisma.bodyFatLog.findFirst({ where: { id, userId } });
    if (!existing) {
      return reply.status(404).send({ error: 'A mérés nem található.' });
    }
    await fastify.prisma.bodyFatLog.delete({ where: { id } });
    return reply.send({ ok: true });
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

  // PATCH /body/:id — update value and/or date
  fastify.patch('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = UpdateMeasurementSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    const userId = request.user.userId;
    const existing = await fastify.prisma.bodyMeasurementLog.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return reply.status(404).send({ error: 'A mérés nem található.' });
    }

    const nextDate = parsed.data.date ? parseDay(parsed.data.date) : existing.loggedDate;
    const nextValue = parsed.data.valueCm ?? existing.valueCm;

    if (toDateStr(nextDate) !== toDateStr(existing.loggedDate)) {
      const clash = await fastify.prisma.bodyMeasurementLog.findFirst({
        where: {
          userId,
          bodyPart: existing.bodyPart,
          loggedDate: nextDate,
          NOT: { id },
        },
      });
      if (clash) {
        return reply.status(409).send({
          error: 'Erre a napra már van mérés ennél a testrésznél.',
        });
      }
    }

    const log = await fastify.prisma.bodyMeasurementLog.update({
      where: { id },
      data: {
        valueCm: nextValue,
        loggedDate: nextDate,
      },
    });

    return reply.send({
      id: log.id,
      bodyPart: log.bodyPart,
      valueCm: log.valueCm,
      loggedDate: toDateStr(log.loggedDate),
      updatedAt: log.updatedAt,
    });
  });

  // DELETE /body/:id
  fastify.delete('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.userId;
    const existing = await fastify.prisma.bodyMeasurementLog.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return reply.status(404).send({ error: 'A mérés nem található.' });
    }
    await fastify.prisma.bodyMeasurementLog.delete({ where: { id } });
    return reply.send({ ok: true });
  });

  // GET /body/history?bodyPart=&from=&to=
  fastify.get('/history', { preHandler: authenticate }, async (request, reply) => {
    const parsed = HistoryQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    const userId = request.user.userId;
    const { bodyPart, from, to } = parsed.data;
    const hasRange = Boolean(from || to);

    const dateFilter: { gte?: Date; lt?: Date } = {};
    if (from) dateFilter.gte = parseDay(from);
    if (to) {
      const endExclusive = parseDay(to);
      endExclusive.setDate(endExclusive.getDate() + 1);
      dateFilter.lt = endExclusive;
    }

    const logs = await fastify.prisma.bodyMeasurementLog.findMany({
      where: {
        userId,
        bodyPart,
        ...(hasRange ? { loggedDate: dateFilter } : {}),
      },
      orderBy: [{ loggedDate: 'desc' }, { updatedAt: 'desc' }],
      take: hasRange ? 500 : 90,
    });

    const summaryLogs = hasRange
      ? await fastify.prisma.bodyMeasurementLog.findMany({
          where: { userId, bodyPart },
          orderBy: [{ loggedDate: 'desc' }, { updatedAt: 'desc' }],
          take: 90,
        })
      : logs;

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

    const summaryItems = summaryLogs.map((l, idx) => {
      const prev = summaryLogs[idx + 1];
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

    const latest = summaryItems[0] ?? null;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    monthStart.setHours(0, 0, 0, 0);
    const monthLogs = summaryLogs
      .filter((l) => l.loggedDate >= monthStart)
      .sort((a, b) => a.loggedDate.getTime() - b.loggedDate.getTime());
    let monthlyChangeCm: number | null = null;
    if (monthLogs.length >= 2) {
      monthlyChangeCm =
        Math.round(
          (monthLogs[monthLogs.length - 1].valueCm - monthLogs[0].valueCm) * 10,
        ) / 10;
    } else if (monthLogs.length === 1 && summaryLogs.length >= 2) {
      const before = summaryLogs.find((l) => l.loggedDate < monthStart);
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
