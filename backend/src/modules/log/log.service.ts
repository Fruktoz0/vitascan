import { PrismaClient } from '@prisma/client';
import { CreateLogInput } from './log.schema';

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

  return { logs, summary };
}

export async function createLog(
  prisma: PrismaClient,
  userId: string,
  data: CreateLogInput
) {
  // If foodId provided, fetch base nutrition and scale by amount/100
  if (data.foodId) {
    const food = await prisma.food.findUnique({ where: { id: data.foodId } });
    if (food) {
      const ratio = data.amount / 100;
      return prisma.dailyLog.create({
        data: {
          userId,
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
        },
      });
    }
  }

  // Manual entry
  return prisma.dailyLog.create({
    data: {
      userId,
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
    },
  });
}

export async function deleteLog(prisma: PrismaClient, logId: string, userId: string) {
  const log = await prisma.dailyLog.findUnique({ where: { id: logId } });
  if (!log) throw new Error('Naplóbejegyzés nem található.');
  if (log.userId !== userId) throw new Error('Nincs jogosultsága törölni ezt a bejegyzést.');

  return prisma.dailyLog.delete({ where: { id: logId } });
}
