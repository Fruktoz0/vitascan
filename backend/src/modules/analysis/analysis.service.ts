import { PrismaClient } from '@prisma/client';
import { MAX_GENERATIONS_PER_DAY } from './analysis.schema';
import {
  generateNutritionAnalysis,
  MEAL_ORDER,
  type GeminiUserPayload,
} from './analysis.gemini';

function parseDay(dateStr?: string): { day: Date; dateKey: string; rangeStart: Date; rangeEnd: Date } {
  const dateKey = dateStr || (() => {
    const n = new Date();
    const y = n.getFullYear();
    const m = String(n.getMonth() + 1).padStart(2, '0');
    const d = String(n.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  })();

  const day = new Date(dateKey + 'T00:00:00.000Z');

  const rangeStart = dateStr ? new Date(dateStr) : new Date();
  rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(rangeStart);
  rangeEnd.setDate(rangeEnd.getDate() + 1);

  return { day, dateKey, rangeStart, rangeEnd };
}

function resolveLocalClock(localTime?: string): { queryLocalTime: string; queryLocalHour: number; localDateKey: string } {
  const now = localTime ? new Date(localTime) : new Date();
  const valid = !Number.isNaN(now.getTime()) ? now : new Date();
  const queryLocalTime = localTime && !Number.isNaN(new Date(localTime).getTime())
    ? localTime
    : valid.toISOString();
  let queryLocalHour = valid.getHours();
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):/.exec(queryLocalTime);
  if (m) {
    queryLocalHour = Number(m[2]);
  }
  const localDateKey = m?.[1] ?? (() => {
    const y = valid.getFullYear();
    const mo = String(valid.getMonth() + 1).padStart(2, '0');
    const d = String(valid.getDate()).padStart(2, '0');
    return `${y}-${mo}-${d}`;
  })();
  return { queryLocalTime, queryLocalHour, localDateKey };
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
  opts: { date?: string; locale?: 'hu' | 'en'; localTime?: string },
) {
  const { day, dateKey, rangeStart, rangeEnd } = parseDay(opts.date);
  const locale = opts.locale ?? 'hu';
  const { queryLocalTime, queryLocalHour, localDateKey } = resolveLocalClock(opts.localTime);

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

  const meals: GeminiUserPayload['meals'] = {};
  const mealTotals: GeminiUserPayload['mealTotals'] = {};

  for (const meal of MEAL_ORDER) {
    mealTotals[meal] = { kcal: 0, protein: 0, carbs: 0, fat: 0, itemCount: 0 };
  }

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
    if (!mealTotals[key]) {
      mealTotals[key] = { kcal: 0, protein: 0, carbs: 0, fat: 0, itemCount: 0 };
    }
    mealTotals[key].kcal += log.kcal;
    mealTotals[key].protein += log.protein;
    mealTotals[key].carbs += log.carbs;
    mealTotals[key].fat += log.fat;
    mealTotals[key].itemCount += 1;
  }

  // Prefer sum of logged items (same as mealTotals rollup) for day totals
  const totals = MEAL_ORDER.reduce(
    (acc, m) => ({
      kcal: acc.kcal + (mealTotals[m]?.kcal ?? 0),
      protein: acc.protein + (mealTotals[m]?.protein ?? 0),
      carbs: acc.carbs + (mealTotals[m]?.carbs ?? 0),
      fat: acc.fat + (mealTotals[m]?.fat ?? 0),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );

  const filledMeals = MEAL_ORDER.filter((m) => (meals[m]?.length ?? 0) > 0);
  const emptyMeals = MEAL_ORDER.filter((m) => (meals[m]?.length ?? 0) === 0);
  const dayProgress: GeminiUserPayload['dayProgress'] =
    localDateKey > dateKey || (localDateKey === dateKey && queryLocalHour >= 21)
      ? 'complete_or_past'
      : localDateKey === dateKey
        ? 'ongoing'
        : 'complete_or_past';

  const payload: GeminiUserPayload = {
    locale,
    date: dateKey,
    queryLocalTime,
    queryLocalHour,
    dayProgress,
    expectedMeals: MEAL_ORDER,
    filledMeals: [...filledMeals],
    emptyMeals: [...emptyMeals],
    profile: {
      gender: profile?.gender,
      birthYear: profile?.birthYear,
      heightCm: profile?.heightCm,
      weightKg: profile?.weightKg,
      activityLevel: profile?.activityLevel,
      goal: profile?.goal,
    },
    goals: {
      dailyKcalGoal: profile?.dailyKcalGoal ?? 2000,
    },
    totals,
    mealTotals,
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
