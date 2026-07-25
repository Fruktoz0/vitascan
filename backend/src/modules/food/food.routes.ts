import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate';
import { scanLimitGuard } from '../../middleware/tierGuard';
import { fetchOFFByBarcode } from '../../services/openFoodFacts';
import { checkProfanity } from '../../utils/profanity';

// ─── Validation schemas ───────────────────────────────────────────────────────

const CreateFoodSchema = z.object({
  name: z.string().min(2).max(120),
  nameHu: z.string().min(2).max(120).optional(),
  nameEn: z.string().min(2).max(120).optional(),
  brand: z.string().max(80).optional(),
  barcode: z.string().max(30).optional(),
  kcal: z.number().min(0).max(10000),
  protein: z.number().min(0).max(1000),
  carbs: z.number().min(0).max(1000),
  fat: z.number().min(0).max(1000),
  fiber: z.number().min(0).max(1000).optional(),
  sugar: z.number().min(0).max(1000).optional(),
  servingSize: z.number().min(0).optional(),
  servingUnit: z.string().max(20).optional(),
  source: z.enum(['INTERNAL', 'USER_SCAN', 'EXTERNAL_API']).default('USER_SCAN'),
});

const VoteSchema = z.object({
  value: z.literal(1).or(z.literal(-1)),
});

// ─── Routes ──────────────────────────────────────────────────────────────────

export default async function foodRoutes(fastify: FastifyInstance) {

  // GET /foods — keresés (kétnyelvű + hitelességi rangsor)
  fastify.get('/', {
    preHandler: [authenticate],
  }, async (req, reply) => {
    const { q = '', status, limit = '20', offset = '0' } =
      req.query as any;

    const prisma = (fastify as any).prisma;

    const where: any = {
      status: status ?? { not: 'BANNED' },
    };
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { nameHu: { contains: q, mode: 'insensitive' } },
        { nameEn: { contains: q, mode: 'insensitive' } },
        { brand: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [foodsRaw, total] = await Promise.all([
      prisma.food.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          creator: { select: { username: true, reputation: true } },
          _count: { select: { votes: true } },
        },
      }),
      prisma.food.count({ where }),
    ]);

    const rankBySourceAndStatus = (food: any) => {
      if (food.source === 'INTERNAL') return 0;
      if (food.source === 'USER_SCAN' && food.status === 'VERIFIED') return 1;
      if (food.source === 'EXTERNAL_API') return 2;
      if (food.source === 'USER_SCAN' && food.status === 'UNVERIFIED') return 3;
      return 4;
    };

    const foods = foodsRaw
      .slice()
      .sort((a: any, b: any) => {
        const rankDiff = rankBySourceAndStatus(a) - rankBySourceAndStatus(b);
        if (rankDiff !== 0) return rankDiff;
        return b.createdAt.getTime() - a.createdAt.getTime();
      })
      .slice(parseInt(offset), parseInt(offset) + parseInt(limit))
      .map((food: any) => ({
        ...food,
        displayName: food.nameHu ?? food.nameEn ?? food.name,
      }));

    return reply.send({
      foods,
      total,
    });
  });

  // GET /barcode/:barcode — vonalkód keresés + OFF fallback
  fastify.get('/barcode/:barcode', {
    preHandler: [authenticate, scanLimitGuard],
  }, async (req, reply) => {
    const { barcode } = req.params as { barcode: string };
    const prisma = (fastify as any).prisma;

    // 1. Saját DB-ben keresünk
    const dbFood = await prisma.food.findUnique({
      where: { barcode },
      include: {
        creator: { select: { username: true, reputation: true } },
        _count: { select: { votes: true } },
      },
    });

    if (dbFood && dbFood.status !== 'BANNED') {
      const score = await getScore(prisma, dbFood.id);
      const user = (req as any).user;
      const userId = user.userId ?? user.id;
      const myVoteRow = await prisma.vote.findUnique({
        where: { userId_foodId: { userId, foodId: dbFood.id } },
        select: { value: true },
      });
      return reply.send({
        ...dbFood,
        score,
        myVote: myVoteRow?.value ?? null,
        source: 'DB',
      });
    }

    // 2. OFF API fallback
    const offFood = await fetchOFFByBarcode(barcode);

    if (!offFood) {
      return reply.status(404).send({ error: 'Étel nem található az adatbázisban vagy az Open Food Facts-ban.' });
    }

    // 3. Automatikus mentés a saját DB-be (UNVERIFIED) + létrehozó +1 szavazat
    try {
      const user = (req as any).user;
      const creatorId = user.userId ?? user.id;
      const saved = await prisma.food.create({
        data: {
          name: offFood.name,
          nameHu: offFood.name,
          nameEn: offFood.name,
          brand: offFood.brand,
          barcode: offFood.barcode,
          kcal: offFood.kcal,
          protein: offFood.protein,
          carbs: offFood.carbs,
          fat: offFood.fat,
          fiber: offFood.fiber,
          sugar: offFood.sugar,
          servingSize: offFood.servingSize ?? 100,
          servingUnit: offFood.servingUnit ?? 'g',
          status: 'UNVERIFIED',
          tier: 'FREE',
          source: 'EXTERNAL_API',
          creatorId,
        },
        include: {
          creator: { select: { username: true, reputation: true } },
          _count: { select: { votes: true } },
        },
      });
      await seedCreatorUpvote(prisma, saved.id, creatorId);
      const score = await getScore(prisma, saved.id);
      return reply.send({ ...saved, score, myVote: 1 as const, source: 'EXTERNAL_API' });
    } catch {
      // Ha barcode unique conflict → visszaadjuk az OFF adatot mentés nélkül
      return reply.send({
        ...offFood,
        id: `off_${barcode}`,
        servingSize: offFood.servingSize ?? 100,
        servingUnit: offFood.servingUnit ?? 'g',
        source: 'EXTERNAL_API',
        status: 'UNVERIFIED',
        tier: 'FREE',
      });
    }
  });

  // POST /foods — manuális étel beküldés
  fastify.post('/', {
    preHandler: [authenticate],
  }, async (req, reply) => {
    const user = (req as any).user;
    const body = CreateFoodSchema.parse(req.body);

    // Profanity szűrő
    if (checkProfanity(body.name) || (body.brand && checkProfanity(body.brand))) {
      return reply.status(400).send({ error: 'A megadott név nem megfelelő.' });
    }

    const prisma = (fastify as any).prisma;
    const creatorId = user.userId ?? user.id;

    const food = await prisma.food.create({
      data: {
        ...body,
        nameHu: body.nameHu ?? body.name,
        nameEn: body.nameEn ?? body.name,
        servingSize: body.servingSize ?? 100,
        servingUnit: body.servingUnit ?? 'g',
        status: 'UNVERIFIED',
        tier: 'FREE',
        source: body.source ?? 'USER_SCAN',
        creatorId,
      },
    });

    await seedCreatorUpvote(prisma, food.id, creatorId);
    const score = await getScore(prisma, food.id);

    return reply.status(201).send({ ...food, score, myVote: 1 });
  });

  // PATCH /foods/:id — saját étel szerkesztése
  fastify.patch('/:id', {
    preHandler: [authenticate],
  }, async (req, reply) => {
    const user = (req as any).user;
    const { id } = req.params as { id: string };
    const body = CreateFoodSchema.partial().parse(req.body);
    const prisma = (fastify as any).prisma;

    const food = await prisma.food.findUnique({ where: { id } });
    if (!food) return reply.status(404).send({ error: 'Nem található.' });
    const editorId = user.userId ?? user.id;
    if (food.creatorId !== editorId && user.role !== 'ADMIN') {
      return reply.status(403).send({ error: 'Nincs jogosultságod.' });
    }

    const updated = await prisma.food.update({ where: { id }, data: body });
    return reply.send(updated);
  });

  // POST /foods/:id/vote — szavazás (+1 / -1)
  fastify.post('/:id/vote', {
    preHandler: [authenticate],
  }, async (req, reply) => {
    const user = (req as any).user;
    const { id } = req.params as { id: string };
    const { value } = VoteSchema.parse(req.body);
    const prisma = (fastify as any).prisma;

    const food = await prisma.food.findUnique({ where: { id } });
    if (!food) return reply.status(404).send({ error: 'Étel nem található.' });
    if (food.status === 'BANNED') return reply.status(400).send({ error: 'Tiltott ételen nem szavazhatsz.' });

    const userId = user.userId ?? user.id;

    // Már szavazott-e erre?
    const existing = await prisma.vote.findUnique({
      where: { userId_foodId: { userId, foodId: id } },
    });

    if (existing) {
      if (existing.value === value) {
        // Visszavonja a szavazatát
        await prisma.vote.delete({ where: { id: existing.id } });
        const { score, status } = await recalcScore(prisma, id);
        return reply.send({ action: 'removed', score, status, myVote: null });
      } else {
        // Szavazatot vált
        await prisma.vote.update({ where: { id: existing.id }, data: { value } });
        const { score, status } = await recalcScore(prisma, id);
        return reply.send({ action: 'changed', score, status, myVote: value });
      }
    }

    // Új szavazat
    await prisma.vote.create({ data: { userId, foodId: id, value } });
    const { score, status } = await recalcScore(prisma, id);

    // Reputation frissítés az étel létrehozójának
    const reputationDelta = value === 1 ? 1 : -1;
    await prisma.user.update({
      where: { id: food.creatorId },
      data: { reputation: { increment: reputationDelta } },
    });

    // Badge küszöb ellenőrzés (reputation >= 10 → log, frontend mutatja)
    const creator = await prisma.user.findUnique({ where: { id: food.creatorId } });
    const earnedExpertBadge = (creator?.reputation ?? 0) >= 10;

    return reply.send({ action: 'added', score, status, myVote: value, earnedExpertBadge });
  });

  // GET /:id — részletek + szavazatok
  fastify.get('/:id', {
    preHandler: [authenticate],
  }, async (req, reply) => {
    const user = (req as any).user;
    const { id } = req.params as { id: string };
    const prisma = (fastify as any).prisma;

    const userId = user.userId ?? user.id;
    const food = await prisma.food.findUnique({
      where: { id },
      include: {
        creator: { select: { username: true, reputation: true } },
        _count: { select: { votes: true } },
        votes: { where: { userId }, select: { value: true } },
      },
    });

    if (!food) return reply.status(404).send({ error: 'Nem található.' });

    const score = await getScore(prisma, id);
    const myVote = food.votes[0]?.value ?? null;

    return reply.send({ ...food, score, myVote, votes: undefined });
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const VERIFY_THRESHOLD = 2;
const BAN_THRESHOLD = -3;

async function seedCreatorUpvote(prisma: any, foodId: string, creatorId: string) {
  const existing = await prisma.vote.findUnique({
    where: { userId_foodId: { userId: creatorId, foodId } },
  });
  if (existing) return;
  await prisma.vote.create({ data: { userId: creatorId, foodId, value: 1 } });
  await recalcScore(prisma, foodId);
}

async function getScore(prisma: any, foodId: string): Promise<number> {
  const agg = await prisma.vote.aggregate({
    where: { foodId },
    _sum: { value: true },
  });
  return agg._sum.value ?? 0;
}

async function recalcScore(
  prisma: any,
  foodId: string,
): Promise<{ score: number; status: string }> {
  const score = await getScore(prisma, foodId);

  let newStatus = 'UNVERIFIED';
  if (score >= VERIFY_THRESHOLD) newStatus = 'VERIFIED';
  else if (score <= BAN_THRESHOLD) newStatus = 'BANNED';

  await prisma.food.update({
    where: { id: foodId },
    data: { status: newStatus },
  });

  return { score, status: newStatus };
}
