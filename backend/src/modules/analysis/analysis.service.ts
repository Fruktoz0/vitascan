import { PrismaClient } from '@prisma/client';
import { MAX_GENERATIONS_PER_DAY } from './analysis.schema';
import { generateNutritionAnalysis, type GeminiUserPayload } from './analysis.gemini';

function parseDay(dateStr?: string): { day: Date; dateKey: string; rangeStart: Date; rangeEnd: Date } {
  const dateKey = dateStr || (() => {
    const n = new Date();
    const y = n.getFullYear();
    const m = String(n.getMonth() + 1).padStart(2, '0');
    const d = String(n.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  })();

  // Prisma @db.Date: UTC midnight of the calendar day
  const day = new Date(dateKey + 'T00:00:00.000Z');

  // DailyLog query: same local-day window as /stats/day
  const rangeStart = dateStr ? new Date(dateStr) : new Date();
  rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(rangeStart);
  rangeEnd.setDate(rangeEnd.getDate() + 1);

  return { day, dateKey, rangeStart, rangeEnd };
}

export async function getDailyAnalysis(
  prisma: PrismaClient,
  userId: string,
  dateStr?: string,
) {
  const { day, dateKey } = parseDay(dateStr);
  const row = await prisma.dailyAnalysis.findUnique({
    where: { userId_loggedDate: { userId, loggedDate: day } },
  });
  const generationCount = row?.generationCount ?? 0;
  return {
    date: dateKey,
    content: row?.content ?? null,
    generationCount,
    remaining: Math.max(0, MAX_GENERATIONS_PER_DAY - generationCount),
    updatedAt: row?.updatedAt ?? null,
  };
}

export async function createOrRefreshDailyAnalysis(
  prisma: PrismaClient,
  userId: string,
  opts: { date?: string; locale?: 'hu' | 'en' },
) {
  const { day, dateKey, rangeStart, rangeEnd } = parseDay(opts.date);
  const locale = opts.locale ?? 'hu';

  const existing = await prisma.dailyAnalysis.findUnique({
    where: { userId_loggedDate: { userId, loggedDate: day } },
  });
  const generationCount = existing?.generationCount ?? 0;
  if (generationCount >= MAX_GENERATIONS_PER_DAY) {
    throw Object.assign(
      new Error('Ma már elértéd a 2 elemzés limitet.'),
      { statusCode: 429 },
    );
  }

  const [logs, profile] = await Promise.all([
    prisma.dailyLog.findMany({
      where: { userId, createdAt: { gte: rangeStart, lt: rangeEnd } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.userProfile.findUnique({ where: { userId } }),
  ]);

  if (logs.length === 0) {
    throw Object.assign(
      new Error('Nincs rögzített étel erre a napra.'),
      { statusCode: 400 },
    );
  }

  const totals = logs.reduce(
    (acc, l) => ({
      kcal: acc.kcal + l.kcal,
      protein: acc.protein + l.protein,
      carbs: acc.carbs + l.carbs,
      fat: acc.fat + l.fat,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );

  const meals: GeminiUserPayload['meals'] = {};
  for (const log of logs) {
    const key = log.mealType;
    if (!meals[key]) meals[key] = [];
    meals[key].push({
      foodName: log.foodName,
      amount: log.amount,
      kcal: log.kcal,
      protein: log.protein,
      carbs: log.carbs,
      fat: log.fat,
    });
  }

  const payload: GeminiUserPayload = {
    locale,
    date: dateKey,
    profile: {
      gender: profile?.gender,
      birthYear: profile?.birthYear,
      heightCm: profile?.heightCm,
      weightKg: profile?.weightKg,
      activityLevel: profile?.activityLevel,
      goal: profile?.goal,
      dailyKcalGoal: profile?.dailyKcalGoal,
    },
    totals,
    meals,
  };

  const content = await generateNutritionAnalysis(payload);
  const nextCount = generationCount + 1;

  const saved = await prisma.dailyAnalysis.upsert({
    where: { userId_loggedDate: { userId, loggedDate: day } },
    create: {
      userId,
      loggedDate: day,
      content,
      generationCount: nextCount,
    },
    update: {
      content,
      generationCount: nextCount,
    },
  });

  return {
    date: dateKey,
    content: saved.content,
    generationCount: saved.generationCount,
    remaining: Math.max(0, MAX_GENERATIONS_PER_DAY - saved.generationCount),
    updatedAt: saved.updatedAt,
  };
}

