import { FastifyPluginAsync } from 'fastify';
import { authenticate, requireAdmin } from '../../middleware/authenticate';
import { z } from 'zod';
import { registerAdminDatabaseRoutes } from './admin.database.routes';

const adminRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireAdmin);

  // ─── Dashboard ────────────────────────────────────────────────────────────

  fastify.get('/dashboard', async (_req, reply) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalUsers, newUsersToday, totalFoods,
      pendingFoods, bannedFoods, totalLogs,
      logsToday, premiumUsers,
    ] = await Promise.all([
      fastify.prisma.user.count({ where: { deletedAt: null } }),
      fastify.prisma.user.count({ where: { createdAt: { gte: today }, deletedAt: null } }),
      fastify.prisma.food.count({ where: { status: { not: 'BANNED' } } }),
      fastify.prisma.food.count({ where: { status: 'UNVERIFIED' } }),
      fastify.prisma.food.count({ where: { status: 'BANNED' } }),
      fastify.prisma.dailyLog.count(),
      fastify.prisma.dailyLog.count({ where: { createdAt: { gte: today } } }),
      fastify.prisma.userProfile.count({ where: { tier: 'PREMIUM' } }),
    ]);

    const topContributors = await fastify.prisma.user.findMany({
      where: { deletedAt: null, reputation: { gt: 0 } },
      orderBy: { reputation: 'desc' },
      take: 5,
      select: { id: true, username: true, reputation: true, role: true },
    });

    return reply.send({
      stats: { totalUsers, newUsersToday, totalFoods, pendingFoods, bannedFoods, totalLogs, logsToday, premiumUsers },
      topContributors,
    });
  });

  /** Részletes idősorok és eloszlások az admin grafikonokhoz (utolsó 30 nap). */
  fastify.get('/dashboard/analytics', async (_req, reply) => {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 30);
    since.setUTCHours(0, 0, 0, 0);

    const [
      usersByDay,
      foodsByDay,
      logsByDay,
      waterByDay,
      foodStatus,
      foodTier,
      foodSource,
      mealTypes,
      logSources,
      voteByValue,
      usersByRole,
      profilesByGoal,
      profilesByGender,
      activityLevels,
      verifiedFoods,
      totalFoodsAll,
      totalVotes,
      totalWaterLogs,
      totalWaterMlAgg,
      totalWeightLogs,
      softDeletedUsers,
      activeRefreshTokens,
    ] = await Promise.all([
      fastify.prisma.$queryRaw<Array<{ d: Date; c: bigint }>>`
        SELECT date_trunc('day', "createdAt")::date AS d, COUNT(*)::bigint AS c
        FROM "User"
        WHERE "deletedAt" IS NULL AND "createdAt" >= ${since}
        GROUP BY 1 ORDER BY 1
      `,
      fastify.prisma.$queryRaw<Array<{ d: Date; c: bigint }>>`
        SELECT date_trunc('day', "createdAt")::date AS d, COUNT(*)::bigint AS c
        FROM "Food"
        WHERE "createdAt" >= ${since}
        GROUP BY 1 ORDER BY 1
      `,
      fastify.prisma.$queryRaw<Array<{ d: Date; c: bigint }>>`
        SELECT date_trunc('day', "createdAt")::date AS d, COUNT(*)::bigint AS c
        FROM "DailyLog"
        WHERE "createdAt" >= ${since}
        GROUP BY 1 ORDER BY 1
      `,
      fastify.prisma.$queryRaw<Array<{ d: Date; c: bigint; ml: bigint }>>`
        SELECT date_trunc('day', "createdAt")::date AS d,
               COUNT(*)::bigint AS c,
               COALESCE(SUM("amountMl"), 0)::bigint AS ml
        FROM "WaterLog"
        WHERE "createdAt" >= ${since}
        GROUP BY 1 ORDER BY 1
      `,
      fastify.prisma.food.groupBy({ by: ['status'], _count: { _all: true } }),
      fastify.prisma.food.groupBy({ by: ['tier'], _count: { _all: true } }),
      fastify.prisma.food.groupBy({ by: ['source'], _count: { _all: true } }),
      fastify.prisma.dailyLog.groupBy({ by: ['mealType'], _count: { _all: true } }),
      fastify.prisma.dailyLog.groupBy({ by: ['source'], _count: { _all: true } }),
      fastify.prisma.vote.groupBy({ by: ['value'], _count: { _all: true } }),
      fastify.prisma.user.groupBy({
        by: ['role'],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      fastify.prisma.userProfile.groupBy({ by: ['goal'], _count: { _all: true } }),
      fastify.prisma.userProfile.groupBy({
        by: ['gender'],
        where: { gender: { not: null } },
        _count: { _all: true },
      }),
      fastify.prisma.userProfile.groupBy({ by: ['activityLevel'], _count: { _all: true } }),
      fastify.prisma.food.count({ where: { status: 'VERIFIED' } }),
      fastify.prisma.food.count(),
      fastify.prisma.vote.count(),
      fastify.prisma.waterLog.count(),
      fastify.prisma.waterLog.aggregate({ _sum: { amountMl: true } }),
      fastify.prisma.weightLog.count(),
      fastify.prisma.user.count({ where: { deletedAt: { not: null } } }),
      fastify.prisma.refreshToken.count({
        where: { revokedAt: null, expiresAt: { gt: new Date() } },
      }),
    ]);

    const toSeries = (rows: Array<{ d: Date; c: bigint }>) =>
      rows.map((r) => ({
        date: r.d.toISOString().slice(0, 10),
        count: Number(r.c),
      }));

    const waterSeries = waterByDay.map((r) => ({
      date: r.d.toISOString().slice(0, 10),
      count: Number(r.c),
      totalMl: Number(r.ml),
    }));

    return reply.send({
      since: since.toISOString(),
      days: 30,
      usersByDay: toSeries(usersByDay),
      foodsByDay: toSeries(foodsByDay),
      logsByDay: toSeries(logsByDay),
      waterByDay: waterSeries,
      foodStatus: foodStatus.map((x) => ({ key: x.status, count: x._count._all })),
      foodTier: foodTier.map((x) => ({ key: x.tier, count: x._count._all })),
      foodSource: foodSource.map((x) => ({ key: x.source, count: x._count._all })),
      mealTypes: mealTypes.map((x) => ({ key: x.mealType, count: x._count._all })),
      logSources: logSources.map((x) => ({ key: x.source, count: x._count._all })),
      votes: voteByValue.map((x) => ({ value: x.value, count: x._count._all })),
      usersByRole: usersByRole.map((x) => ({ key: x.role, count: x._count._all })),
      profilesByGoal: profilesByGoal.map((x) => ({ key: x.goal, count: x._count._all })),
      profilesByGender: profilesByGender.map((x) => ({ key: x.gender!, count: x._count._all })),
      activityLevels: activityLevels.map((x) => ({ key: x.activityLevel, count: x._count._all })),
      totals: {
        foodsAll: totalFoodsAll,
        foodsVerified: verifiedFoods,
        votes: totalVotes,
        waterLogs: totalWaterLogs,
        waterMlTotal: totalWaterMlAgg._sum.amountMl ?? 0,
        weightLogs: totalWeightLogs,
        softDeletedUsers,
        activeRefreshTokens,
      },
    });
  });

  // ─── Ételek ───────────────────────────────────────────────────────────────

  fastify.get('/foods', async (request, reply) => {
    const query = z.object({
      status: z.enum(['UNVERIFIED', 'VERIFIED', 'BANNED']).optional(),
      q: z.string().optional(),
      limit: z.coerce.number().min(1).max(100).default(50),
      offset: z.coerce.number().min(0).default(0),
    }).parse(request.query);

    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { nameHu: { contains: query.q, mode: 'insensitive' } },
        { nameEn: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    const [foods, total] = await fastify.prisma.$transaction([
      fastify.prisma.food.findMany({
        where,
        include: {
          creator: { select: { id: true, username: true, reputation: true } },
          _count: { select: { votes: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset,
      }),
      fastify.prisma.food.count({ where }),
    ]);

    const foodsWithScore = await Promise.all(foods.map(async (food) => {
      const agg = await fastify.prisma.vote.aggregate({
        where: { foodId: food.id },
        _sum: { value: true },
      });
      return {
        ...food,
        displayName: food.nameHu ?? food.nameEn ?? food.name,
        score: agg._sum.value ?? 0,
      };
    }));

    return reply.send({ foods: foodsWithScore, total });
  });

  fastify.post('/foods', async (request, reply) => {
    const body = z.object({
      name: z.string().min(1).max(200),
      nameHu: z.string().max(200).nullable().optional(),
      nameEn: z.string().max(200).nullable().optional(),
      brand: z.string().max(200).nullable().optional(),
      barcode: z.string().max(100).nullable().optional(),
      kcal: z.number().min(0),
      protein: z.number().min(0),
      carbs: z.number().min(0),
      fat: z.number().min(0),
      fiber: z.number().min(0).nullable().optional(),
      sugar: z.number().min(0).nullable().optional(),
      servingSize: z.number().min(0).nullable().optional(),
      servingUnit: z.string().max(50).nullable().optional(),
      status: z.enum(['UNVERIFIED', 'VERIFIED', 'BANNED']).default('VERIFIED'),
      tier: z.enum(['FREE', 'PREMIUM']).default('FREE'),
      source: z.enum(['INTERNAL', 'USER_SCAN', 'EXTERNAL_API']).default('INTERNAL'),
    }).parse(request.body);

    const existing = body.barcode
      ? await fastify.prisma.food.findUnique({ where: { barcode: body.barcode } })
      : null;
    if (existing) {
      return reply.status(409).send({ error: `Már létezik étel ezzel a vonalkóddal: ${body.barcode}` });
    }

    const food = await fastify.prisma.food.create({
      data: {
        ...body,
        creatorId: request.user.userId,
      },
      include: { creator: { select: { id: true, username: true, reputation: true } } },
    });
    return reply.status(201).send({ ...food, displayName: food.nameHu ?? food.nameEn ?? food.name });
  });

  fastify.get('/foods/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const food = await fastify.prisma.food.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, username: true, reputation: true } },
        _count: { select: { votes: true } },
      },
    });
    if (!food) return reply.status(404).send({ error: 'Étel nem található.' });
    const agg = await fastify.prisma.vote.aggregate({
      where: { foodId: food.id },
      _sum: { value: true },
    });
    return reply.send({ ...food, displayName: food.nameHu ?? food.nameEn ?? food.name, score: agg._sum.value ?? 0 });
  });

  fastify.put('/foods/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z.object({
      name: z.string().min(1).max(200).optional(),
      nameHu: z.string().max(200).nullable().optional(),
      nameEn: z.string().max(200).nullable().optional(),
      brand: z.string().max(200).nullable().optional(),
      barcode: z.string().max(100).nullable().optional(),
      kcal: z.number().min(0).optional(),
      protein: z.number().min(0).optional(),
      carbs: z.number().min(0).optional(),
      fat: z.number().min(0).optional(),
      fiber: z.number().min(0).nullable().optional(),
      sugar: z.number().min(0).nullable().optional(),
      servingSize: z.number().min(0).nullable().optional(),
      servingUnit: z.string().max(50).nullable().optional(),
      status: z.enum(['UNVERIFIED', 'VERIFIED', 'BANNED']).optional(),
    }).parse(request.body);
    try {
      const food = await fastify.prisma.food.update({ where: { id }, data: body });
      return reply.send({ ...food, displayName: food.nameHu ?? food.nameEn ?? food.name });
    } catch {
      return reply.status(404).send({ error: 'Étel nem található.' });
    }
  });

  fastify.post('/foods/bulk-status', async (request, reply) => {
    const { ids, status } = z.object({
      ids: z.array(z.string()).min(1).max(200),
      status: z.enum(['UNVERIFIED', 'VERIFIED', 'BANNED']),
    }).parse(request.body);
    const result = await fastify.prisma.food.updateMany({
      where: { id: { in: ids } },
      data: { status },
    });
    return reply.send({ updated: result.count });
  });

  fastify.delete('/foods/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await fastify.prisma.vote.deleteMany({ where: { foodId: id } });
      await fastify.prisma.food.delete({ where: { id } });
      return reply.send({ message: 'Étel véglegesen törölve.' });
    } catch {
      return reply.status(404).send({ error: 'Étel nem található.' });
    }
  });

  fastify.patch('/foods/:id/status', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status } = z.object({
      status: z.enum(['UNVERIFIED', 'VERIFIED', 'BANNED']),
    }).parse(request.body);
    const food = await fastify.prisma.food.update({ where: { id }, data: { status } });
    return reply.send(food);
  });

  // ─── Felhasználók ─────────────────────────────────────────────────────────

  fastify.get('/users', async (request, reply) => {
    const query = z.object({
      q: z.string().optional(),
      role: z.enum(['USER', 'ADMIN']).optional(),
      limit: z.coerce.number().min(1).max(100).default(50),
      offset: z.coerce.number().min(0).default(0),
    }).parse(request.query);

    const where: any = {};
    if (query.role) where.role = query.role;
    if (query.q) {
      where.OR = [
        { username: { contains: query.q, mode: 'insensitive' } },
        { email: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await fastify.prisma.$transaction([
      fastify.prisma.user.findMany({
        where,
        select: {
          id: true, username: true, email: true,
          role: true, reputation: true,
          deletedAt: true, createdAt: true,
          profile: { select: { tier: true, goal: true } },
          _count: { select: { logs: true, createdFoods: true, votes: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset,
      }),
      fastify.prisma.user.count({ where }),
    ]);

    return reply.send({ users, total });
  });

  fastify.patch('/users/:id/role', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { role } = z.object({ role: z.enum(['USER', 'ADMIN']) }).parse(request.body);
    const user = await fastify.prisma.user.update({
      where: { id }, data: { role },
      select: { id: true, username: true, role: true },
    });
    return reply.send(user);
  });

  fastify.patch('/users/:id/tier', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tier } = z.object({ tier: z.enum(['FREE', 'PREMIUM']) }).parse(request.body);
    const profile = await fastify.prisma.userProfile.upsert({
      where: { userId: id },
      update: { tier },
      create: { userId: id, tier, activityLevel: 'SEDENTARY', goal: 'MAINTAIN' },
      select: { userId: true, tier: true },
    });
    return reply.send(profile);
  });

  fastify.delete('/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await fastify.prisma.user.update({
      where: { id }, data: { deletedAt: new Date() },
    });
    return reply.send({ message: 'Soft-törölve (GDPR). 30 nap múlva véglegesedik.' });
  });

  // ─── Reputáció / Badge ────────────────────────────────────────────────────

  fastify.get('/badges', async (_req, reply) => {
    const EXPERT_THRESHOLD = 10;
    const experts = await fastify.prisma.user.findMany({
      where: { reputation: { gte: EXPERT_THRESHOLD }, deletedAt: null },
      orderBy: { reputation: 'desc' },
      select: {
        id: true, username: true, reputation: true, role: true, createdAt: true,
        _count: { select: { createdFoods: true, votes: true } },
      },
    });
    return reply.send({ experts, threshold: EXPERT_THRESHOLD, total: experts.length });
  });

  fastify.patch('/users/:id/reputation', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { delta, reason } = z.object({
      delta: z.number().int().min(-100).max(100),
      reason: z.string().max(200).optional(),
    }).parse(request.body);
    const user = await fastify.prisma.user.update({
      where: { id },
      data: { reputation: { increment: delta } },
      select: { id: true, username: true, reputation: true },
    });
    return reply.send({ ...user, delta, reason });
  });

  await registerAdminDatabaseRoutes(fastify);
};

export default adminRoutes;
