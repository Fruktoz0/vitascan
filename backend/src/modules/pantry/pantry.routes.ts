import { FastifyPluginAsync } from 'fastify';
import { authenticate } from '../../middleware/authenticate';
import { PatchPantrySchema, PantryQuerySchema, UpsertPantrySchema } from './pantry.schema';
import { deletePantryItem, listPantry, patchPantryItem, upsertPantryItem } from './pantry.service';

function sendErr(reply: { status: (n: number) => { send: (b: unknown) => unknown } }, err: unknown) {
  const e = err as { statusCode?: number; message?: string };
  const status = e.statusCode && e.statusCode >= 400 ? e.statusCode : 500;
  return reply.status(status).send({ error: e.message || 'Váratlan hiba.' });
}

const pantryRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: authenticate }, async (request, reply) => {
    const parsed = PantryQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    try {
      const ownerId = parsed.data.ownerId || request.user.userId;
      const items = await listPantry(fastify.prisma, request.user.userId, ownerId);
      return reply.send({ items });
    } catch (err) {
      return sendErr(reply, err);
    }
  });

  fastify.post('/', { preHandler: authenticate }, async (request, reply) => {
    const parsed = UpsertPantrySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    try {
      const ownerId = parsed.data.ownerId || request.user.userId;
      const item = await upsertPantryItem(fastify.prisma, request.user.userId, ownerId, parsed.data);
      return reply.status(201).send({ item });
    } catch (err) {
      return sendErr(reply, err);
    }
  });

  fastify.patch('/:id', { preHandler: authenticate }, async (request, reply) => {
    const parsed = PatchPantrySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    const { id } = request.params as { id: string };
    if (!id) return reply.status(400).send({ error: 'Érvénytelen azonosító.' });
    try {
      const data = await patchPantryItem(fastify.prisma, request.user.userId, id, parsed.data);
      return reply.send(data);
    } catch (err) {
      return sendErr(reply, err);
    }
  });

  fastify.delete('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!id) return reply.status(400).send({ error: 'Érvénytelen azonosító.' });
    try {
      const data = await deletePantryItem(fastify.prisma, request.user.userId, id);
      return reply.send(data);
    } catch (err) {
      return sendErr(reply, err);
    }
  });
};

export default pantryRoutes;
