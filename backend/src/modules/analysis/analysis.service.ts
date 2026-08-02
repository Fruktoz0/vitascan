import { PrismaClient } from '@prisma/client';
import { MAX_GENERATIONS_PER_DAY } from './analysis.schema';
import {
  generateDailyAnalysis,
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

function resolveLocalClock(localTime?: string): {
  queryLocalTime: string;
  queryLocalHour: number;
  localDateKey: string;
} {
  const now = localTime ? new Date(localTime) : new Date();
  const valid = !Number.isNaN(now.getTime()) ? now : new Date();
  const queryLocalTime =
    localTime && !Number.isNaN(new Date(localTime).getTime())
      ? localTime
      : valid.toISOString();
  let queryLocalHour = valid.getHours();
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):/.exec(queryLocalTime);
  if (m) {
    queryLocalHour = Number(m[2]);
  }
  const localDateKey =
    m?.[1] ??
    (() => {
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
  kind: 'nutrition' | 'fitness' = 'nutrition',
) {
  const { day, dateKey } = parseDay(dateStr);
  const row = await prisma.dailyAnalysis.findUnique({
    where: { userId_loggedDate_kind: { userId, loggedDate: day, kind } },
  });
  const dayRows = await prisma.dailyAnalysis.findMany({
    where: { userId, loggedDate: day },
    select: { generationCount: true },
  });
  const generationCount = dayRows.reduce((s, r) => s + r.generationCount, 0);
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
  opts: {
    date?: string;
    locale?: 'hu' | 'en';
    localTime?: string;
    kind?: 'nutrition' | 'fitness';
  },
) {
  const kind = opts.kind ?? 'nutrition';
  const { day, dateKey, rangeStart, rangeEnd } = parseDay(opts.date);
  const locale = opts.locale ?? 'hu';
  const { queryLocalTime, queryLocalHour, localDateKey } = resolveLocalClock(opts.localTime);

  const dayRows = await prisma.dailyAnalysis.findMany({
    where: { userId, loggedDate: day },
  });
  const generationCount = dayRows.reduce((s, r) => s + r.generationCount, 0);
  if (generationCount >= MAX_GENERATIONS_PER_DAY) {
    throw Object.assign(
      new Error(`Ma már elértéd a ${MAX_GENERATIONS_PER_DAY} elemzés limitet.`),
      { statusCode: 429 },
    );
  }

  const existing = dayRows.find((r) => r.kind === kind) ?? null;

  const [logs, profile, workouts, stepLog, latestWeight, bodyLatest] = await Promise.all([
    prisma.dailyLog.findMany({
      where: { userId, createdAt: { gte: rangeStart, lt: rangeEnd } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.userProfile.findUnique({ where: { userId } }),
    prisma.workoutLog.findMany({
      where: { userId, startedAt: { gte: rangeStart, lt: rangeEnd } },
      orderBy: { startedAt: 'asc' },
    }),
    prisma.dailyStepLog.findUnique({
      where: { userId_loggedDate: { userId, loggedDate: day } },
    }),
    prisma.weightLog.findFirst({
      where: { userId },
      orderBy: { loggedDate: 'desc' },
    }),
    prisma.bodyMeasurementLog.findMany({
      where: { userId },
      orderBy: { loggedDate: 'desc' },
      take: 40,
    }),
  ]);

  if (logs.length === 0) {
    throw Object.assign(new Error('Nincs rögzített étel erre a napra.'), {
      statusCode: 400,
    });
  }

  const meals: GeminiUserPayload['meals'] = {};
  const mealTotals: GeminiUserPayload['mealTotals'] = {};

  for (const meal of MEAL_ORDER) {
    mealTotals[meal] = { kcal: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, fiber: 0, itemCount: 0 };
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
      sugar: log.sugar ?? null,
      fiber: log.fiber ?? null,
    });
    if (!mealTotals[key]) {
      mealTotals[key] = { kcal: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, fiber: 0, itemCount: 0 };
    }
    mealTotals[key].kcal += log.kcal;
    mealTotals[key].protein += log.protein;
    mealTotals[key].carbs += log.carbs;
    mealTotals[key].fat += log.fat;
    mealTotals[key].sugar += log.sugar ?? 0;
    mealTotals[key].fiber += log.fiber ?? 0;
    mealTotals[key].itemCount += 1;
  }

  const filledMeals = MEAL_ORDER.filter((m) => (meals[m]?.length ?? 0) > 0);
  const emptyMeals = MEAL_ORDER.filter((m) => (meals[m]?.length ?? 0) === 0);

  const filledMealTotals: GeminiUserPayload['mealTotals'] = {};
  for (const m of filledMeals) {
    filledMealTotals[m] = mealTotals[m];
  }

  const totals = filledMeals.reduce(
    (acc, m) => ({
      kcal: acc.kcal + (mealTotals[m]?.kcal ?? 0),
      protein: acc.protein + (mealTotals[m]?.protein ?? 0),
      carbs: acc.carbs + (mealTotals[m]?.carbs ?? 0),
      fat: acc.fat + (mealTotals[m]?.fat ?? 0),
      sugar: acc.sugar + (mealTotals[m]?.sugar ?? 0),
      fiber: acc.fiber + (mealTotals[m]?.fiber ?? 0),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, fiber: 0 },
  );

  const dayProgress: GeminiUserPayload['dayProgress'] =
    localDateKey > dateKey || (localDateKey === dateKey && queryLocalHour >= 21)
      ? 'complete_or_past'
      : localDateKey === dateKey
        ? 'ongoing'
        : 'complete_or_past';

  const filledMealsMap: GeminiUserPayload['meals'] = {};
  for (const m of filledMeals) {
    filledMealsMap[m] = meals[m];
  }

  const dailyKcalGoal = profile?.dailyKcalGoal ?? 2000;
  const dailyProteinGoal = profile?.dailyProteinGoal ?? null;
  const dailyCarbsGoal = profile?.dailyCarbsGoal ?? null;
  const dailyFatGoal = profile?.dailyFatGoal ?? null;

  const round1 = (n: number) => Math.round(n * 10) / 10;
  const deltas = {
    kcal: round1(totals.kcal - dailyKcalGoal),
    protein: dailyProteinGoal != null ? round1(totals.protein - dailyProteinGoal) : null,
    carbs: dailyCarbsGoal != null ? round1(totals.carbs - dailyCarbsGoal) : null,
    fat: dailyFatGoal != null ? round1(totals.fat - dailyFatGoal) : null,
  };

  const workoutEnergyKcal = workouts.reduce(
    (sum, w) => sum + (w.activeEnergyKcal ?? 0),
    0,
  );

  const bodyByPart = new Map<string, { bodyPart: string; valueCm: number; loggedDate: string }>();
  for (const row of bodyLatest) {
    if (bodyByPart.has(row.bodyPart)) continue;
    bodyByPart.set(row.bodyPart, {
      bodyPart: row.bodyPart,
      valueCm: row.valueCm,
      loggedDate: row.loggedDate.toISOString().slice(0, 10),
    });
  }

  const payload: GeminiUserPayload = {
    locale,
    analysisKind: kind,
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
      weightKg: latestWeight?.weightKg ?? profile?.weightKg,
      activityLevel: profile?.activityLevel,
      goal: profile?.goal,
    },
    body: {
      weightKg: latestWeight?.weightKg ?? profile?.weightKg ?? null,
      weightLoggedDate: latestWeight
        ? latestWeight.loggedDate.toISOString().slice(0, 10)
        : null,
      measurements: [...bodyByPart.values()],
    },
    goals: {
      dailyKcalGoal,
      dailyProteinGoal,
      dailyCarbsGoal,
      dailyFatGoal,
    },
    deltas,
    fitness: {
      steps: stepLog?.steps ?? null,
      workoutEnergyKcal: round1(workoutEnergyKcal),
      workouts: workouts.map((w) => ({
        activityType: w.activityType,
        title: w.title,
        durationMin: w.durationMin,
        activeEnergyKcal: w.activeEnergyKcal,
        distanceKm: w.distanceKm,
        avgHeartrate: w.avgHeartrate,
        maxHeartrate: w.maxHeartrate,
        minHeartrate: w.minHeartrate,
      })),
    },
    totals,
    mealTotals: filledMealTotals,
    meals: filledMealsMap,
  };

  const content = await generateDailyAnalysis(payload);
  const nextKindCount = (existing?.generationCount ?? 0) + 1;
  const nextTotal = generationCount + 1;

  const saved = await prisma.dailyAnalysis.upsert({
    where: { userId_loggedDate_kind: { userId, loggedDate: day, kind } },
    create: {
      userId,
      loggedDate: day,
      kind,
      content,
      generationCount: nextKindCount,
    },
    update: {
      content,
      generationCount: nextKindCount,
    },
  });

  return {
    date: dateKey,
    content: saved.content,
    generationCount: nextTotal,
    remaining: Math.max(0, MAX_GENERATIONS_PER_DAY - nextTotal),
    updatedAt: saved.updatedAt,
  };
}
