import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate';
import { getCurrent, listHistory, startFast, stopFast } from './fasting.service';

const DateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const StartSchema = z.object({
  protocol: z.enum(['16:8', '18:6', '20:4', 'OMAD', 'CUSTOM']).optional(),
  goalMinutes: z.number().int().min(60).max(1439).optional(),
  source: z.enum(['MANUAL', 'FROM_LAST_MEAL']).optional(),
});

const HistoryQuerySchema = z.object({
  from: DateKeySchema.optional(),
  to: DateKeySchema.optional(),
});

const fastingRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/current', { preHandler: authenticate }, async (request, reply) => {
    const data = await getCurrent(fastify.prisma, request.user.userId);
    return reply.send(data);
  });

  fastify.post('/start', { preHandler: authenticate }, async (request, reply) => {
    const parsed = StartSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    const session = await startFast(fastify.prisma, request.user.userId, parsed.data);
    return reply.send({ session });
  });

  fastify.post('/stop', { preHandler: authenticate }, async (request, reply) => {
    const result = await stopFast(fastify.prisma, request.user.userId);
    return reply.send(result);
  });

  fastify.get('/history', { preHandler: authenticate }, async (request, reply) => {
    const parsed = HistoryQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    const data = await listHistory(fastify.prisma, request.user.userId, parsed.data);
    return reply.send(data);
  });
};

export default fastingRoutes;
