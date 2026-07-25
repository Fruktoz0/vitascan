import { FastifyPluginAsync } from 'fastify';
import { authenticate } from '../../middleware/authenticate';
import { dailyLogLimitGuard } from '../../middleware/tierGuard';
import { CreateLogSchema, LogQuerySchema, UpdateLogSchema } from './log.schema';
import { getLogs, createLog, updateLog, deleteLog } from './log.service';

const logRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /logs?date=2025-03-01 or ?from=...&to=...
  fastify.get('/', { preHandler: authenticate }, async (request, reply) => {
    const parsed = LogQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    const result = await getLogs(fastify.prisma, request.user.userId, parsed.data);
    return reply.send(result);
  });

  // POST /logs — tier guard for FREE limit
  fastify.post(
    '/',
    { preHandler: [authenticate, dailyLogLimitGuard] },
    async (request, reply) => {
      const parsed = CreateLogSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.errors[0].message });
      }
      try {
        const log = await createLog(fastify.prisma, request.user.userId, parsed.data);
        return reply.status(201).send(log);
      } catch (err: any) {
        return reply.status(422).send({ error: err.message });
      }
    }
  );

  // PATCH /logs/:id — mennyiség / étkezés / makrók szerkesztése
  fastify.patch('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = UpdateLogSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    try {
      const log = await updateLog(fastify.prisma, id, request.user.userId, parsed.data);
      return reply.send(log);
    } catch (err: any) {
      const status = err.message?.includes('nem található') ? 404 : 403;
      return reply.status(status).send({ error: err.message });
    }
  });

  // DELETE /logs/:id
  fastify.delete('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await deleteLog(fastify.prisma, id, request.user.userId);
      return reply.send({ message: 'Törölve.' });
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }
  });
};

export default logRoutes;
