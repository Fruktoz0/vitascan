import { PrismaClient } from '@prisma/client';
import { getUserTier } from '../../middleware/tierGuard';
import {
  MAX_COACH_GENERATIONS_PER_DAY,
  MAX_GENERATIONS_PER_DAY,
  MAX_MEAL_SUGGEST_REFRESH_PREMIUM,
} from './analysis.schema';
import {
  generateCoachNudge,
  generateDailyAnalysis,
  generateMealSuggestions,
  MEAL_ORDER,
  type GeminiUserPayload,
  type MealSuggestSlot,
  type MealTypeKey,
} from './analysis.gemini';

const MEAL_KCAL_SHARE: Record<MealTypeKey, number> = {
  BREAKFAST: 0.25,
  TIZORAI: 0.1,
  LUNCH: 0.3,
  UZSONNA: 0.1,
  DINNER: 0.25,
  SNACK: 0.05,
};

const MAIN_MEALS: MealTypeKey[] = ['BREAKFAST', 'LUNCH', 'DINNER'];

function analysisQuotaCount(
  rows: Array<{ kind: string; generationCount: number }>,
): number {
  return rows
    .filter((r) => r.kind === 'nutrition' || r.kind === 'fitness')
    .reduce((s, r) => s + r.generationCount, 0);
}

function coachQuotaCount(
  rows: Array<{ kind: string; generationCount: number }>,
): number {
  return rows
    .filter((r) => r.kind === 'coach')
    .reduce((s, r) => s + r.generationCount, 0);
}

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

function parseMealSuggestContent(raw: string | null | undefined): {
  remaining: { kcal: number; protein: number; carbs: number; fat: number } | null;
  suggestions: MealSuggestSlot[];
  refreshByMeal: Partial<Record<MealTypeKey, number>>;
} {
  if (!raw) {
    return { remaining: null, suggestions: [], refreshByMeal: {} };
  }
  try {
    const parsed = JSON.parse(raw) as {
      remaining?: { kcal: number; protein: number; carbs: number; fat: number };
      suggestions?: MealSuggestSlot[];
      refreshByMeal?: Partial<Record<MealTypeKey, number>>;
    };
    return {
      remaining: parsed.remaining ?? null,
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      refreshByMeal: parsed.refreshByMeal && typeof parsed.refreshByMeal === 'object'
        ? parsed.refreshByMeal
        : {},
    };
  } catch {
    return { remaining: null, suggestions: [], refreshByMeal: {} };
  }
}

function mealSuggestRefreshCap(role: string, tier: 'FREE' | 'PREMIUM'): number | null {
  if (role === 'ADMIN') return null; // unlimited
  if (tier === 'PREMIUM') return MAX_MEAL_SUGGEST_REFRESH_PREMIUM;
  return 0;
}

/** Pick empty slots to suggest (max 4). Past meal windows are excluded. */
function pickSuggestSlots(
  emptyMeals: MealTypeKey[],
  localHour: number,
  remainingKcal: number,
): MealTypeKey[] {
  if (emptyMeals.length === 0) return [];

  /** After this hour the meal is past and must not be suggested. */
  const untilHour: Record<MealTypeKey, number> = {
    BREAKFAST: 10,
    TIZORAI: 11,
    LUNCH: 15,
    UZSONNA: 17,
    DINNER: 22,
    SNACK: 24,
  };

  const upcoming = emptyMeals.filter((m) => localHour < (untilHour[m] ?? 24));
  if (upcoming.length === 0) return [];

  const orderHint: MealTypeKey[] =
    localHour < 10
      ? ['BREAKFAST', 'TIZORAI', 'LUNCH', 'UZSONNA', 'DINNER', 'SNACK']
      : localHour < 14
        ? ['LUNCH', 'UZSONNA', 'DINNER', 'SNACK']
        : localHour < 18
          ? ['UZSONNA', 'DINNER', 'SNACK']
          : ['DINNER', 'SNACK'];

  const ranked = [...upcoming].sort((a, b) => {
    const ia = orderHint.indexOf(a);
    const ib = orderHint.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  const preferred = ranked.filter(
    (m) => MAIN_MEALS.includes(m) || m === 'TIZORAI' || m === 'UZSONNA' || m === 'SNACK',
  );
  const withSnack =
    remainingKcal > 80
      ? preferred
      : preferred.filter((m) => m !== 'SNACK' || preferred.length === 1);

  return withSnack.slice(0, 4);
}

function buildSlotBudgets(
  slots: MealTypeKey[],
  remaining: { kcal: number; protein: number; carbs: number; fat: number },
) {
  const shareSum = slots.reduce((s, m) => s + (MEAL_KCAL_SHARE[m] || 0.1), 0) || 1;
  const round1 = (n: number) => Math.round(Math.max(0, n) * 10) / 10;
  return slots.map((mealType) => {
    const w = (MEAL_KCAL_SHARE[mealType] || 0.1) / shareSum;
    return {
      mealType,
      kcal: Math.round(Math.max(0, remaining.kcal) * w),
      protein: round1(Math.max(0, remaining.protein) * w),
      carbs: round1(Math.max(0, remaining.carbs) * w),
      fat: round1(Math.max(0, remaining.fat) * w),
    };
  });
}

export async function getDailyAnalysis(
  prisma: PrismaClient,
  userId: string,
  dateStr?: string,
  kind: 'nutrition' | 'fitness' | 'coach' | 'mealSuggest' = 'nutrition',
  role = 'USER',
) {
  const { day, dateKey } = parseDay(dateStr);
  const row = await prisma.dailyAnalysis.findUnique({
    where: { userId_loggedDate_kind: { userId, loggedDate: day, kind } },
  });
  const dayRows = await prisma.dailyAnalysis.findMany({
    where: { userId, loggedDate: day },
    select: { kind: true, generationCount: true },
  });

  if (kind === 'coach') {
    const coachCount = coachQuotaCount(dayRows);
    return {
      date: dateKey,
      content: row?.content ?? null,
      generationCount: coachCount,
      remaining: Math.max(0, MAX_COACH_GENERATIONS_PER_DAY - coachCount),
      updatedAt: row?.updatedAt ?? null,
    };
  }

  if (kind === 'mealSuggest') {
    const tier = await getUserTier(prisma, userId);
    const parsed = parseMealSuggestContent(row?.content);
    return {
      date: dateKey,
      content: row?.content ?? null,
      generationCount: row?.generationCount ?? 0,
      remaining: row ? 0 : 1,
      updatedAt: row?.updatedAt ?? null,
      refreshByMeal: parsed.refreshByMeal,
      refreshLimits: {
        maxPerMeal: mealSuggestRefreshCap(role, tier),
        tier,
        isAdmin: role === 'ADMIN',
      },
    };
  }

  const generationCount = analysisQuotaCount(dayRows);
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
    kind?: 'nutrition' | 'fitness' | 'coach' | 'mealSuggest';
    mealType?: MealTypeKey;
    role?: string;
    force?: boolean;
  },
) {
  const kind = opts.kind ?? 'nutrition';
  const { day, dateKey, rangeStart, rangeEnd } = parseDay(opts.date);
  const locale = opts.locale ?? 'hu';
  const { queryLocalTime, queryLocalHour, localDateKey } = resolveLocalClock(opts.localTime);
  const role = opts.role ?? 'USER';

  const dayRows = await prisma.dailyAnalysis.findMany({
    where: { userId, loggedDate: day },
  });

  if (kind === 'coach') {
    return createOrRefreshCoachNudge(prisma, userId, {
      day,
      dateKey,
      rangeStart,
      rangeEnd,
      locale,
      dayRows,
    });
  }

  if (kind === 'mealSuggest') {
    return createOrRefreshMealSuggest(prisma, userId, {
      day,
      dateKey,
      rangeStart,
      rangeEnd,
      locale,
      queryLocalHour,
      dayRows,
      mealType: opts.mealType,
      role,
      force: opts.force === true,
    });
  }

  const generationCount = analysisQuotaCount(dayRows);
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

async function createOrRefreshCoachNudge(
  prisma: PrismaClient,
  userId: string,
  opts: {
    day: Date;
    dateKey: string;
    rangeStart: Date;
    rangeEnd: Date;
    locale: 'hu' | 'en';
    dayRows: Array<{ kind: string; generationCount: number; content: string }>;
  },
) {
  const { day, dateKey, rangeStart, rangeEnd, locale, dayRows } = opts;
  const coachCount = coachQuotaCount(dayRows);
  if (coachCount >= MAX_COACH_GENERATIONS_PER_DAY) {
    throw Object.assign(
      new Error(`Ma már elértéd a ${MAX_COACH_GENERATIONS_PER_DAY} coach tipp limitet.`),
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
    throw Object.assign(new Error('Nincs rögzített étel erre a napra.'), {
      statusCode: 400,
      code: 'NO_FOOD',
    });
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

  const filled = new Set(logs.map((l) => l.mealType as string));
  const mains = ['BREAKFAST', 'LUNCH', 'DINNER'];
  const filledMeals = MEAL_ORDER.filter((m) => filled.has(m));
  const emptyMainMeals = mains.filter((m) => !filled.has(m));
  const dailyKcalGoal = profile?.dailyKcalGoal ?? 2000;

  const content = await generateCoachNudge({
    locale,
    date: dateKey,
    totals,
    goals: {
      dailyKcalGoal,
      dailyProteinGoal: profile?.dailyProteinGoal ?? null,
      dailyCarbsGoal: profile?.dailyCarbsGoal ?? null,
      dailyFatGoal: profile?.dailyFatGoal ?? null,
    },
    deltas: { kcal: Math.round((totals.kcal - dailyKcalGoal) * 10) / 10 },
    filledMeals: [...filledMeals],
    emptyMainMeals,
  });

  const existing = dayRows.find((r) => r.kind === 'coach');
  const nextKindCount = (existing?.generationCount ?? 0) + 1;
  const nextTotal = coachCount + 1;

  const saved = await prisma.dailyAnalysis.upsert({
    where: { userId_loggedDate_kind: { userId, loggedDate: day, kind: 'coach' } },
    create: {
      userId,
      loggedDate: day,
      kind: 'coach',
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
    remaining: Math.max(0, MAX_COACH_GENERATIONS_PER_DAY - nextTotal),
    updatedAt: saved.updatedAt,
  };
}

async function createOrRefreshMealSuggest(
  prisma: PrismaClient,
  userId: string,
  opts: {
    day: Date;
    dateKey: string;
    rangeStart: Date;
    rangeEnd: Date;
    locale: 'hu' | 'en';
    queryLocalHour: number;
    dayRows: Array<{ kind: string; generationCount: number; content: string }>;
    mealType?: MealTypeKey;
    role: string;
    force?: boolean;
  },
) {
  const {
    day,
    dateKey,
    rangeStart,
    rangeEnd,
    locale,
    queryLocalHour,
    dayRows,
    mealType,
    role,
    force,
  } = opts;
  const tier = await getUserTier(prisma, userId);
  const refreshCap = mealSuggestRefreshCap(role, tier);
  const existing = dayRows.find((r) => r.kind === 'mealSuggest');
  const cached = parseMealSuggestContent(existing?.content);

  // Initial batch: return cache if present (unless force)
  if (!mealType && existing?.content && !force) {
    return {
      date: dateKey,
      content: existing.content,
      generationCount: existing.generationCount,
      remaining: 0,
      updatedAt: null,
      refreshByMeal: cached.refreshByMeal,
      refreshLimits: {
        maxPerMeal: refreshCap,
        tier,
        isAdmin: role === 'ADMIN',
      },
    };
  }

  // Per-slot refresh limits
  if (mealType) {
    if (refreshCap === 0) {
      throw Object.assign(
        new Error(
          locale === 'en'
            ? 'Refreshing meal suggestions requires Premium.'
            : 'Az ételjavaslat frissítése Premium funkció.',
        ),
        {
          statusCode: 403,
          upgradeRequired: true,
          feature: 'meal_suggest_refresh',
        },
      );
    }
    const used = cached.refreshByMeal[mealType] ?? 0;
    if (refreshCap != null && used >= refreshCap) {
      throw Object.assign(
        new Error(
          locale === 'en'
            ? 'Refresh limit reached for this meal today.'
            : 'Erre az étkezésre ma már felhasználtad a frissítést.',
        ),
        { statusCode: 429, code: 'MEAL_SUGGEST_REFRESH_LIMIT' },
      );
    }
  }

  const [logs, profile] = await Promise.all([
    prisma.dailyLog.findMany({
      where: { userId, createdAt: { gte: rangeStart, lt: rangeEnd } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.userProfile.findUnique({ where: { userId } }),
  ]);

  const totals = logs.reduce(
    (acc, l) => ({
      kcal: acc.kcal + l.kcal,
      protein: acc.protein + l.protein,
      carbs: acc.carbs + l.carbs,
      fat: acc.fat + l.fat,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );

  const filled = new Set(logs.map((l) => l.mealType as MealTypeKey));
  const filledMeals = MEAL_ORDER.filter((m) => filled.has(m));
  const emptyMeals = MEAL_ORDER.filter((m) => !filled.has(m));

  const dailyKcalGoal = profile?.dailyKcalGoal ?? 2000;
  const dailyProteinGoal = profile?.dailyProteinGoal ?? null;
  const dailyCarbsGoal = profile?.dailyCarbsGoal ?? null;
  const dailyFatGoal = profile?.dailyFatGoal ?? null;

  const round1 = (n: number) => Math.round(n * 10) / 10;
  const remaining = {
    kcal: round1(dailyKcalGoal - totals.kcal),
    protein: round1((dailyProteinGoal ?? 0) - totals.protein),
    carbs: round1((dailyCarbsGoal ?? 0) - totals.carbs),
    fat: round1((dailyFatGoal ?? 0) - totals.fat),
  };

  let slots: MealTypeKey[];
  if (mealType) {
    if (!emptyMeals.includes(mealType)) {
      throw Object.assign(
        new Error(
          locale === 'en'
            ? 'This meal already has food logged.'
            : 'Ehhez az étkezéshez már van bejegyzés.',
        ),
        { statusCode: 400, code: 'MEAL_ALREADY_FILLED' },
      );
    }
    const relevant = pickSuggestSlots([mealType], queryLocalHour, remaining.kcal);
    if (relevant.length === 0) {
      throw Object.assign(
        new Error(
          locale === 'en'
            ? 'This meal is past for today.'
            : 'Ez az étkezés mára már elmúlt.',
        ),
        { statusCode: 400, code: 'MEAL_PAST' },
      );
    }
    slots = [mealType];
  } else {
    slots = pickSuggestSlots(emptyMeals, queryLocalHour, remaining.kcal);
  }

  if (slots.length === 0) {
    throw Object.assign(
      new Error(
        locale === 'en'
          ? 'No empty meals left to suggest.'
          : 'Nincs üres étkezés, amire javaslatot adhatnánk.',
      ),
      { statusCode: 400, code: 'NO_EMPTY_MEALS' },
    );
  }

  // Over goal: still allow light tips if empty slots remain
  const slotBudgets = buildSlotBudgets(
    slots,
    remaining.kcal > 0
      ? remaining
      : { kcal: 200, protein: 15, carbs: 20, fat: 8 },
  );

  const newSlots = await generateMealSuggestions({
    locale,
    date: dateKey,
    queryLocalHour,
    remaining,
    goals: { dailyKcalGoal, dailyProteinGoal, dailyCarbsGoal, dailyFatGoal },
    totals,
    emptyMeals,
    filledMeals: [...filledMeals],
    slotBudgets,
    targetMeal: mealType,
  });

  let suggestions: MealSuggestSlot[];
  let refreshByMeal = { ...cached.refreshByMeal };

  if (mealType) {
    const map = new Map(cached.suggestions.map((s) => [s.mealType, s]));
    for (const s of newSlots) map.set(s.mealType, s);
    suggestions = [...map.values()]
      .filter(
        (s) =>
          (emptyMeals.includes(s.mealType) || s.mealType === mealType) &&
          pickSuggestSlots([s.mealType], queryLocalHour, remaining.kcal).length > 0,
      )
      .sort((a, b) => MEAL_ORDER.indexOf(a.mealType) - MEAL_ORDER.indexOf(b.mealType));
    refreshByMeal[mealType] = (refreshByMeal[mealType] ?? 0) + 1;
  } else {
    suggestions = newSlots.sort(
      (a, b) => MEAL_ORDER.indexOf(a.mealType) - MEAL_ORDER.indexOf(b.mealType),
    );
    refreshByMeal = force ? { ...cached.refreshByMeal } : {};
  }

  const content = JSON.stringify({ remaining, suggestions, refreshByMeal });
  const nextKindCount = (existing?.generationCount ?? 0) + 1;

  const saved = await prisma.dailyAnalysis.upsert({
    where: { userId_loggedDate_kind: { userId, loggedDate: day, kind: 'mealSuggest' } },
    create: {
      userId,
      loggedDate: day,
      kind: 'mealSuggest',
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
    generationCount: nextKindCount,
    remaining: 0,
    updatedAt: saved.updatedAt,
    refreshByMeal,
    refreshLimits: {
      maxPerMeal: refreshCap,
      tier,
      isAdmin: role === 'ADMIN',
    },
  };
}
