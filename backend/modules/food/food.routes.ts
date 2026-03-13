import { FastifyPluginAsync } from 'fastify';
import { authenticate, requireAdmin } from '../../middleware/authenticate';
import { CreateFoodSchema, UpdateFoodSchema, FoodQuerySchema, VoteSchema } from './food.schema';
import { searchFoods, getFoodByBarcode, createFood, updateFood, voteOnFood } from './food.service';

const foodRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /foods?q=...&status=...&limit=...&offset=...
  fastify.get('/', async (request, reply) => {
    const parsed = FoodQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }

    // Admin check (optional auth)
    let isAdmin = false;
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const { verifyAccessToken } = await import('../../plugins/jwt');
        const user = verifyAccessToken(authHeader.slice(7));
        isAdmin = user.role === 'ADMIN';
      } catch {}
    }

    const result = await searchFoods(fastify.prisma, parsed.data, isAdmin);
    return reply.send(result);
  });

  // GET /foods/barcode/:barcode
  fastify.get('/barcode/:barcode', async (request, reply) => {
    const { barcode } = request.params as { barcode: string };
    const food = await getFoodByBarcode(fastify.prisma, barcode);
    if (!food) return reply.status(404).send({ error: 'Étel nem található ezzel a vonalkóddal.' });
    return reply.send(food);
  });

  // POST /foods — authenticated
  fastify.post('/', { preHandler: authenticate }, async (request, reply) => {
    const parsed = CreateFoodSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    try {
      const food = await createFood(fastify.prisma, request.user.userId, parsed.data);
      return reply.status(201).send(food);
    } catch (err: any) {
      return reply.status(422).send({ error: err.message });
    }
  });

  // PATCH /foods/:id — authenticated, creator or admin
  fastify.patch('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = UpdateFoodSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    try {
      const food = await updateFood(
        fastify.prisma, id, request.user.userId, request.user.role, parsed.data
      );
      return reply.send(food);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }
  });

  // POST /foods/:id/vote — authenticated
  fastify.post('/:id/vote', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = VoteSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'value: 1 vagy -1 szükséges.' });
    }
    try {
      const result = await voteOnFood(fastify.prisma, id, request.user.userId, parsed.data.value);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(422).send({ error: err.message });
    }
  });
};

export default foodRoutes;
