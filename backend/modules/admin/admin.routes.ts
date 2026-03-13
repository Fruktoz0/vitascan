import { FastifyPluginAsync } from 'fastify';
import { authenticate, requireAdmin } from '../../middleware/authenticate';
import { z } from 'zod';

const adminRoutes: FastifyPluginAsync = async (fastify) => {
  // Apply auth + admin check to all routes in this plugin
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireAdmin);

  // GET /admin/foods?status=BANNED
  fastify.get('/foods', async (request, reply) => {
    const query = z.object({
      status: z.enum(['UNVERIFIED', 'VERIFIED', 'BANNED']).optional(),
      limit: z.coerce.number().min(1).max(100).default(50),
      offset: z.coerce.number().min(0).default(0),
    }).parse(request.query);

    const where: any = {};
    if (query.status) where.status = query.status;

    const [foods, total] = await fastify.prisma.$transaction([
      fastify.prisma.food.findMany({
        where,
        include: { creator: { select: { username: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset,
      }),
      fastify.prisma.food.count({ where }),
    ]);

    return reply.send({ foods, total });
  });

  // DELETE /admin/foods/:id — permanent delete
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

  // PATCH /admin/foods/:id/status — manual status override
  fastify.patch('/foods/:id/status', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status } = z.object({
      status: z.enum(['UNVERIFIED', 'VERIFIED', 'BANNED']),
    }).parse(request.body);

    const food = await fastify.prisma.food.update({
      where: { id },
      data: { status },
    });
    return reply.send(food);
  });

  // GET /admin/users
  fastify.get('/users', async (request, reply) => {
    const query = z.object({
      limit: z.coerce.number().min(1).max(100).default(50),
      offset: z.coerce.number().min(0).default(0),
    }).parse(request.query);

    const [users, total] = await fastify.prisma.$transaction([
      fastify.prisma.user.findMany({
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          reputation: true,
          deletedAt: true,
          createdAt: true,
          _count: { select: { logs: true, createdFoods: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset,
      }),
      fastify.prisma.user.count(),
    ]);

    return reply.send({ users, total });
  });

  // PATCH /admin/users/:id/role
  fastify.patch('/users/:id/role', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { role } = z.object({
      role: z.enum(['USER', 'ADMIN']),
    }).parse(request.body);

    const user = await fastify.prisma.user.update({
      where: { id },
      data: { role },
      select: { id: true, username: true, role: true },
    });
    return reply.send(user);
  });
};

export default adminRoutes;
