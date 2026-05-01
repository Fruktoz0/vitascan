import { FastifyPluginAsync } from 'fastify';
import { authenticate, requireAdmin } from '../../middleware/authenticate';
import { z } from 'zod';

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
};

export default adminRoutes;
