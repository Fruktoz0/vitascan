import { FastifyPluginAsync } from 'fastify';
import { authenticate } from '../../middleware/authenticate';
import { dailyLogLimitGuard } from '../../middleware/tierGuard';
import {
  CopyLogsSchema,
  CreateLogSchema,
  CreateMealTemplateSchema,
  LogQuerySchema,
  MealHistoryQuerySchema,
  MealTemplateQuerySchema,
  UpdateLogSchema,
} from './log.schema';
import {
  getLogs,
  createLog,
  updateLog,
  deleteLog,
  deleteLogGroup,
  getMealHistory,
  copyLogs,
  listMealTemplates,
  createMealTemplate,
  deleteMealTemplate,
} from './log.service';

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

  // GET /logs/meal-history?before=YYYY-MM-DD
  fastify.get('/meal-history', { preHandler: authenticate }, async (request, reply) => {
    const parsed = MealHistoryQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    try {
      const result = await getMealHistory(fastify.prisma, request.user.userId, parsed.data);
      return reply.send(result);
    } catch (err: any) {
      const status = err.statusCode || 500;
      return reply.status(status).send({ error: err.message });
    }
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
    },
  );

  // POST /logs/copy — atomic copy with target-day FREE limit
  fastify.post('/copy', { preHandler: authenticate }, async (request, reply) => {
    const parsed = CopyLogsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    try {
      const result = await copyLogs(fastify.prisma, request.user.userId, parsed.data);
      return reply.status(201).send(result);
    } catch (err: any) {
      const status = err.statusCode || 422;
      return reply.status(status).send({
        error: err.message,
        ...(err.upgradeRequired
          ? {
              upgradeRequired: true,
              feature: err.feature,
              currentCount: err.currentCount,
              limit: err.limit,
              needed: err.needed,
            }
          : {}),
      });
    }
  });

  // GET /logs/templates
  fastify.get('/templates', { preHandler: authenticate }, async (request, reply) => {
    const parsed = MealTemplateQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    const result = await listMealTemplates(
      fastify.prisma,
      request.user.userId,
      parsed.data.mealType,
    );
    return reply.send(result);
  });

  // POST /logs/templates
  fastify.post('/templates', { preHandler: authenticate }, async (request, reply) => {
    const parsed = CreateMealTemplateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    try {
      const template = await createMealTemplate(fastify.prisma, request.user.userId, parsed.data);
      return reply.status(201).send(template);
    } catch (err: any) {
      const status = err.statusCode || 422;
      return reply.status(status).send({
        error: err.message,
        ...(err.limit != null ? { limit: err.limit, currentCount: err.currentCount } : {}),
      });
    }
  });

  // DELETE /logs/templates/:id
  fastify.delete('/templates/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const result = await deleteMealTemplate(fastify.prisma, request.user.userId, id);
      return reply.send(result);
    } catch (err: any) {
      const status = err.statusCode || 403;
      return reply.status(status).send({ error: err.message });
    }
  });

  // DELETE /logs/group/:logGroupId — csoportos törlés
  fastify.delete('/group/:logGroupId', { preHandler: authenticate }, async (request, reply) => {
    const { logGroupId } = request.params as { logGroupId: string };
    try {
      await deleteLogGroup(fastify.prisma, logGroupId, request.user.userId);
      return reply.send({ message: 'Csoport törölve.' });
    } catch (err: any) {
      const status = err.statusCode || 403;
      return reply.status(status).send({ error: err.message });
    }
  });

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

