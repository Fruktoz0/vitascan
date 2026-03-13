import { PrismaClient } from '@prisma/client';
import { CreateFoodInput, FoodQueryInput } from './food.schema';
import { assertNoProfanity } from '../../utils/profanity';

const VERIFY_THRESHOLD = 5;   // +5 score → VERIFIED
const BAN_THRESHOLD = -3;     // -3 score → BANNED

export async function searchFoods(
  prisma: PrismaClient,
  query: FoodQueryInput,
  isAdmin: boolean
) {
  const where: any = {};

  // Non-admins never see BANNED foods
  if (!isAdmin) {
    where.status = query.status && query.status !== 'BANNED' ? query.status : { not: 'BANNED' };
  } else if (query.status) {
    where.status = query.status;
  }

  if (query.tier) where.tier = query.tier;

  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: 'insensitive' } },
      { brand: { contains: query.q, mode: 'insensitive' } },
      { barcode: { equals: query.q } },
    ];
  }

  const [foods, total] = await prisma.$transaction([
    prisma.food.findMany({
      where,
      include: {
        creator: { select: { username: true, reputation: true } },
        _count: { select: { votes: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      skip: query.offset,
    }),
    prisma.food.count({ where }),
  ]);

  return { foods, total };
}

export async function getFoodByBarcode(prisma: PrismaClient, barcode: string) {
  const food = await prisma.food.findUnique({
    where: { barcode },
    include: { creator: { select: { username: true } } },
  });
  if (!food || food.status === 'BANNED') return null;
  return food;
}

export async function createFood(
  prisma: PrismaClient,
  userId: string,
  data: CreateFoodInput
) {
  assertNoProfanity(data.name, 'Étel neve');
  if (data.brand) assertNoProfanity(data.brand, 'Márka neve');

  if (data.barcode) {
    const exists = await prisma.food.findUnique({ where: { barcode: data.barcode } });
    if (exists) throw new Error('Ez a vonalkód már szerepel az adatbázisban.');
  }

  return prisma.food.create({
    data: { ...data, creatorId: userId },
  });
}

export async function updateFood(
  prisma: PrismaClient,
  foodId: string,
  userId: string,
  role: string,
  data: Partial<CreateFoodInput>
) {
  const food = await prisma.food.findUnique({ where: { id: foodId } });
  if (!food) throw new Error('Étel nem található.');

  // Only creator or admin can update
  if (food.creatorId !== userId && role !== 'ADMIN') {
    throw new Error('Nincs jogosultsága módosítani ezt az ételt.');
  }

  if (data.name) assertNoProfanity(data.name, 'Étel neve');

  return prisma.food.update({ where: { id: foodId }, data });
}

export async function voteOnFood(
  prisma: PrismaClient,
  foodId: string,
  userId: string,
  value: 1 | -1
) {
  const food = await prisma.food.findUnique({ where: { id: foodId } });
  if (!food) throw new Error('Étel nem található.');
  if (food.status === 'BANNED') throw new Error('Bannolt ételre nem lehet szavazni.');
  if (food.creatorId === userId) throw new Error('Saját ételjére nem szavazhat.');

  // Upsert vote
  const existing = await prisma.vote.findUnique({
    where: { userId_foodId: { userId, foodId } },
  });

  if (existing) {
    if (existing.value === value) {
      // Remove vote (toggle off)
      await prisma.vote.delete({ where: { id: existing.id } });
      await recalculateFoodStatus(prisma, foodId);
      return { action: 'removed' };
    }
    await prisma.vote.update({ where: { id: existing.id }, data: { value } });
  } else {
    await prisma.vote.create({ data: { userId, foodId, value } });
  }

  await recalculateFoodStatus(prisma, foodId);

  // Update creator reputation
  await updateCreatorReputation(prisma, food.creatorId);

  return { action: existing ? 'changed' : 'added' };
}

async function recalculateFoodStatus(prisma: PrismaClient, foodId: string) {
  const votes = await prisma.vote.findMany({ where: { foodId } });
  const score = votes.reduce((sum, v) => sum + v.value, 0);

  let status: 'UNVERIFIED' | 'VERIFIED' | 'BANNED' = 'UNVERIFIED';
  if (score >= VERIFY_THRESHOLD) status = 'VERIFIED';
  if (score <= BAN_THRESHOLD) status = 'BANNED';

  await prisma.food.update({ where: { id: foodId }, data: { status } });
}

async function updateCreatorReputation(prisma: PrismaClient, creatorId: string) {
  const foods = await prisma.food.findMany({
    where: { creatorId },
    include: { votes: true },
  });

  const totalReputation = foods.reduce((sum, food) => {
    return sum + food.votes.reduce((vSum, v) => vSum + v.value, 0);
  }, 0);

  await prisma.user.update({
    where: { id: creatorId },
    data: { reputation: totalReputation },
  });

  // Badge: Szakértő kitűző ha reputation >= 10
  // (a badge megjelenítése a frontend feladata, a reputation szám az adatbázisban van)
}
