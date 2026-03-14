import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate';
import { calculateWaterGoal } from '../../utils/tdee';

const AddWaterSchema = z.object({
  amountMl: z.number().int().min(50).max(2000),
});

const waterRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /water/today — napi összesítés
  fastify.get('/today', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user.userId;
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const logs = await fastify.prisma.waterLog.findMany({
      where: { userId, createdAt: { gte: start } },
      orderBy: { createdAt: 'asc' },
    });

    const totalMl = logs.reduce((sum, l) => sum + l.amountMl, 0);

    // Get personalized goal from profile
    const profile = await fastify.prisma.userProfile.findUnique({ where: { userId } });
    const goalMl = profile?.dailyWaterGoalMl ?? 
      (profile?.weightKg ? calculateWaterGoal(profile.weightKg) : 2000);

    return reply.send({ logs, totalMl, goalMl });
  });

  // POST /water — +ml bejegyzés
  fastify.post('/', { preHandler: authenticate }, async (request, reply) => {
    const parsed = AddWaterSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }

    const log = await fastify.prisma.waterLog.create({
      data: { userId: request.user.userId, amountMl: parsed.data.amountMl },
    });

    return reply.status(201).send(log);
  });

  // DELETE /water/:id
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
