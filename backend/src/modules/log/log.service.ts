import { PrismaClient } from '@prisma/client';
import { CreateLogInput, UpdateLogInput } from './log.schema';

export async function getLogs(
  prisma: PrismaClient,
  userId: string,
  filters: { date?: string; from?: string; to?: string; mealType?: string }
) {
  const where: any = { userId };

  if (filters.date) {
    const start = new Date(filters.date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(filters.date);
    end.setHours(23, 59, 59, 999);
    where.createdAt = { gte: start, lte: end };
  } else if (filters.from || filters.to) {
    where.createdAt = {};
    if (filters.from) {
      const start = new Date(filters.from);
      start.setHours(0, 0, 0, 0);
      where.createdAt.gte = start;
    }
    if (filters.to) {
      const end = new Date(filters.to);
      end.setHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }

  if (filters.mealType) where.mealType = filters.mealType;

  const logs = await prisma.dailyLog.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    include: {
      food: { select: { brand: true, isPrepared: true, name: true, nameHu: true } },
      sourcePreparedFood: { select: { id: true, name: true, nameHu: true, nameEn: true } },
    },
  });

  // Daily summary
  const summary = logs.reduce(
    (acc, log) => ({
      kcal: acc.kcal + log.kcal,
      protein: acc.protein + log.protein,
      carbs: acc.carbs + log.carbs,
      fat: acc.fat + log.fat,
      fiber: acc.fiber + (log.fiber ?? 0),
      sugar: acc.sugar + (log.sugar ?? 0),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 }
  );

  const mapped = logs.map(({ food, sourcePreparedFood, ...log }) => ({
    ...log,
    brand: food?.brand ?? null,
    sourcePreparedFoodName:
      sourcePreparedFood?.nameHu ?? sourcePreparedFood?.nameEn ?? sourcePreparedFood?.name ?? null,
  }));

  return { logs: mapped, summary };
}

/** Local calendar day noon — stays inside the day window used by stats/logs filters. */
function createdAtForDate(date?: string): Date | undefined {
  if (!date) return undefined;
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export async function createLog(
  prisma: PrismaClient,
  userId: string,
  data: CreateLogInput
) {
  const createdAt = createdAtForDate(data.date);

  // If foodId provided, fetch base nutrition and scale by amount/100
  if (data.foodId) {
    const food = await prisma.food.findUnique({ where: { id: data.foodId } });
    if (food) {
      const ratio = data.amount / 100;
      return prisma.dailyLog.create({
        data: {
          userId,
          foodId: food.id,
          foodName: food.nameHu ?? food.nameEn ?? food.name,
          kcal: Math.round(food.kcal * ratio * 10) / 10,
          protein: Math.round(food.protein * ratio * 10) / 10,
          carbs: Math.round(food.carbs * ratio * 10) / 10,
          fat: Math.round(food.fat * ratio * 10) / 10,
          fiber: food.fiber ? Math.round(food.fiber * ratio * 10) / 10 : undefined,
          sugar: food.sugar ? Math.round(food.sugar * ratio * 10) / 10 : undefined,
          amount: data.amount,
          mealType: data.mealType,
          source: data.source,
          logGroupId: data.logGroupId ?? undefined,
          sourcePreparedFoodId: data.sourcePreparedFoodId ?? (food.isPrepared ? food.id : undefined),
          ...(createdAt ? { createdAt } : {}),
        },
      });
    }
  }

  // Manual entry
  return prisma.dailyLog.create({
    data: {
      userId,
      foodId: data.foodId,
      foodName: data.foodName,
      kcal: data.kcal,
      protein: data.protein,
      carbs: data.carbs,
      fat: data.fat,
      fiber: data.fiber,
      sugar: data.sugar,
      amount: data.amount,
      mealType: data.mealType,
      source: data.source,
      logGroupId: data.logGroupId ?? undefined,
      sourcePreparedFoodId: data.sourcePreparedFoodId ?? undefined,
      ...(createdAt ? { createdAt } : {}),
    },
  });
}

export async function updateLog(
  prisma: PrismaClient,
  logId: string,
  userId: string,
  data: UpdateLogInput
) {
  const log = await prisma.dailyLog.findUnique({ where: { id: logId } });
  if (!log) throw new Error('Naplóbejegyzés nem található.');
  if (log.userId !== userId) throw new Error('Nincs jogosultsága szerkeszteni ezt a bejegyzést.');

  const update: Record<string, unknown> = {};
  if (data.foodName !== undefined) update.foodName = data.foodName;
  if (data.mealType !== undefined) update.mealType = data.mealType;

  const hasExplicitMacros =
    data.kcal !== undefined ||
    data.protein !== undefined ||
    data.carbs !== undefined ||
    data.fat !== undefined;

  if (data.amount !== undefined && !hasExplicitMacros) {
    const ratio = data.amount / (log.amount || 1);
    const round1 = (n: number) => Math.round(n * 10) / 10;
    update.amount = data.amount;
    update.kcal = round1(log.kcal * ratio);
    update.protein = round1(log.protein * ratio);
    update.carbs = round1(log.carbs * ratio);
    update.fat = round1(log.fat * ratio);
    if (log.fiber != null) update.fiber = round1(log.fiber * ratio);
    if (log.sugar != null) update.sugar = round1(log.sugar * ratio);
  } else {
    if (data.amount !== undefined) update.amount = data.amount;
    if (data.kcal !== undefined) update.kcal = data.kcal;
    if (data.protein !== undefined) update.protein = data.protein;
    if (data.carbs !== undefined) update.carbs = data.carbs;
    if (data.fat !== undefined) update.fat = data.fat;
    if (data.fiber !== undefined) update.fiber = data.fiber;
    if (data.sugar !== undefined) update.sugar = data.sugar;
  }

  return prisma.dailyLog.update({ where: { id: logId }, data: update });
}

export async function deleteLog(prisma: PrismaClient, logId: string, userId: string) {
  const log = await prisma.dailyLog.findUnique({ where: { id: logId } });
  if (!log) throw new Error('Naplóbejegyzés nem található.');
  if (log.userId !== userId) throw new Error('Nincs jogosultsága törölni ezt a bejegyzést.');

  return prisma.dailyLog.delete({ where: { id: logId } });
}

export async function deleteLogGroup(prisma: PrismaClient, logGroupId: string, userId: string) {
  const result = await prisma.dailyLog.deleteMany({
    where: { userId, logGroupId },
  });
  if (result.count === 0) {
    throw Object.assign(new Error('Naplócsoport nem található.'), { statusCode: 404 });
  }
  return result;
}
