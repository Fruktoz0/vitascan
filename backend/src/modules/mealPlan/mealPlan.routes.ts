import { FastifyPluginAsync } from 'fastify';
import { authenticate } from '../../middleware/authenticate';
import { dailyLogLimitGuard } from '../../middleware/tierGuard';
import {
  DeleteDayParamsSchema,
  DeleteDayQuerySchema,
  DeleteSlotQuerySchema,
  GeneratePlanSchema,
  GetPlanQuerySchema,
  LogSlotSchema,
  MissingCartSchema,
  UpsertSlotSchema,
} from './mealPlan.schema';
import { deleteDay, deleteSlot, getWeekPlan, logSlot, upsertSlot } from './mealPlan.service';
import { addMissingToCart, generateWeekPlan, missingIngredientsForWeek } from './mealPlan.generate';

function sendErr(reply: { status: (n: number) => { send: (b: unknown) => unknown } }, err: unknown) {
  const e = err as { statusCode?: number; message?: string; upgradeRequired?: boolean; feature?: string };
  const status = e.statusCode && e.statusCode >= 400 ? e.statusCode : 500;
  return reply.status(status).send({
    error: e.message || 'Váratlan hiba.',
    ...(e.upgradeRequired ? { upgradeRequired: true, feature: e.feature } : {}),
  });
}

const mealPlanRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: authenticate }, async (request, reply) => {
    const parsed = GetPlanQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    try {
      const data = await getWeekPlan(fastify.prisma, request.user.userId, parsed.data);
      return reply.send(data);
    } catch (err) {
      return sendErr(reply, err);
    }
  });

  fastify.put('/slots', { preHandler: authenticate }, async (request, reply) => {
    const parsed = UpsertSlotSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    try {
      const slot = await upsertSlot(fastify.prisma, request.user.userId, parsed.data);
      return reply.send({ slot });
    } catch (err) {
      return sendErr(reply, err);
    }
  });

  fastify.delete('/slots/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!id) return reply.status(400).send({ error: 'Érvénytelen azonosító.' });
    const parsed = DeleteSlotQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    try {
      const data = await deleteSlot(fastify.prisma, request.user.userId, id, parsed.data.alsoDiary);
      return reply.send(data);
    } catch (err) {
      return sendErr(reply, err);
    }
  });

  fastify.post(
    '/slots/:id/log',
    { preHandler: [authenticate, dailyLogLimitGuard] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!id) return reply.status(400).send({ error: 'Érvénytelen azonosító.' });
      const parsed = LogSlotSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.errors[0].message });
      }
      try {
        const data = await logSlot(fastify.prisma, request.user.userId, id, parsed.data);
        return reply.status(data.alreadyLogged ? 200 : 201).send(data);
      } catch (err) {
        return sendErr(reply, err);
      }
    },
  );

  fastify.delete('/days/:date', { preHandler: authenticate }, async (request, reply) => {
    const params = DeleteDayParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: params.error.errors[0].message });
    }
    const query = DeleteDayQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({ error: query.error.errors[0].message });
    }
    try {
      const data = await deleteDay(fastify.prisma, request.user.userId, params.data.date, {
        alsoDiary: query.data.alsoDiary,
        ownerId: query.data.ownerId,
      });
      return reply.send(data);
    } catch (err) {
      return sendErr(reply, err);
    }
  });

  fastify.post('/generate', { preHandler: authenticate }, async (request, reply) => {
    const parsed = GeneratePlanSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    try {
      const data = await generateWeekPlan(
        fastify.prisma,
        request.user.userId,
        request.user.role,
        parsed.data,
      );
      return reply.send(data);
    } catch (err) {
      return sendErr(reply, err);
    }
  });

  fastify.get('/missing', { preHandler: authenticate }, async (request, reply) => {
    const parsed = MissingCartSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    try {
      const data = await missingIngredientsForWeek(fastify.prisma, request.user.userId, parsed.data);
      return reply.send(data);
    } catch (err) {
      return sendErr(reply, err);
    }
  });

  fastify.post('/cart', { preHandler: authenticate }, async (request, reply) => {
    const parsed = MissingCartSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    try {
      const data = await addMissingToCart(fastify.prisma, request.user.userId, parsed.data);
      return reply.send(data);
    } catch (err) {
      return sendErr(reply, err);
    }
  });
};

export default mealPlanRoutes;
