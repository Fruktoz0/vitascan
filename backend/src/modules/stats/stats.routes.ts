import { FastifyPluginAsync } from 'fastify';
import { authenticate } from '../../middleware/authenticate';
import { weeklyStatsGuard } from '../../middleware/tierGuard';

type LogWithFoodBrand = {
  food: {
    brand: string | null;
    servingSize?: number | null;
    servingUnit?: string | null;
  } | null;
  sourcePreparedFood?: { id: string; name: string; nameHu: string | null; nameEn: string | null } | null;
  [key: string]: unknown;
};

function flattenLogsWithBrand<T extends LogWithFoodBrand>(logs: T[]) {
  return logs.map(({ food, sourcePreparedFood, ...log }) => ({
    ...log,
    brand: food?.brand ?? null,
    servingSize: food?.servingSize ?? null,
    servingUnit: food?.servingUnit ?? null,
    sourcePreparedFoodName:
      sourcePreparedFood?.nameHu ?? sourcePreparedFood?.nameEn ?? sourcePreparedFood?.name ?? null,
  }));
}

const statsRoutes: FastifyPluginAsync = async (fastify) => {

  // GET /stats/today — mai összesítő + makrók + étkezéstípus bontás
  fastify.get('/today', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user.userId;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [rawLogs, profile] = await Promise.all([
      fastify.prisma.dailyLog.findMany({
        where: { userId, createdAt: { gte: today, lt: tomorrow } },
        include: {
          food: { select: { brand: true, servingSize: true, servingUnit: true } },
          sourcePreparedFood: { select: { id: true, name: true, nameHu: true, nameEn: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      fastify.prisma.userProfile.findUnique({ where: { userId } }),
    ]);

    const logs = flattenLogsWithBrand(rawLogs);

    const totals = logs.reduce(
      (acc, l) => ({
        kcal:    acc.kcal    + (l.kcal as number),
        protein: acc.protein + (l.protein as number),
        carbs:   acc.carbs   + (l.carbs as number),
        fat:     acc.fat     + (l.fat as number),
        fiber:   acc.fiber   + ((l.fiber as number | null) ?? 0),
        sugar:   acc.sugar   + ((l.sugar as number | null) ?? 0),
      }),
      { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 }
    );

    // Étkezéstípus bontás
    const byMealType: Record<string, typeof logs> = {};
    for (const log of logs) {
      const mealType = log.mealType as string;
      if (!byMealType[mealType]) byMealType[mealType] = [];
      byMealType[mealType].push(log);
    }

    return reply.send({
      date: today.toISOString().split('T')[0],
      totals,
      byMealType,
      logs,
      goals: {
        dailyKcalGoal:    profile?.dailyKcalGoal ?? 2000,
        dailyWaterGoalMl: profile?.dailyWaterGoalMl ?? 2000,
        dailyProteinGoal: profile?.dailyProteinGoal ?? 140,
        dailyCarbsGoal:   profile?.dailyCarbsGoal ?? 250,
        dailyFatGoal:     profile?.dailyFatGoal ?? 65,
      },
    });
  });

  // GET /stats/day?date=YYYY-MM-DD — adott nap összesítője (+ byMealType, goals)
  fastify.get('/day', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user.userId;
    const { date } = request.query as { date?: string };

    const day = date ? new Date(date) : new Date();
    day.setHours(0, 0, 0, 0);
    const nextDay = new Date(day);
    nextDay.setDate(nextDay.getDate() + 1);

    const [rawLogs, profile] = await Promise.all([
      fastify.prisma.dailyLog.findMany({
        where: { userId, createdAt: { gte: day, lt: nextDay } },
        include: {
          food: { select: { brand: true, servingSize: true, servingUnit: true } },
          sourcePreparedFood: { select: { id: true, name: true, nameHu: true, nameEn: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      fastify.prisma.userProfile.findUnique({ where: { userId } }),
    ]);

    const logs = flattenLogsWithBrand(rawLogs);

    const totals = logs.reduce(
      (acc, l) => ({
        kcal:    acc.kcal    + (l.kcal as number),
        protein: acc.protein + (l.protein as number),
        carbs:   acc.carbs   + (l.carbs as number),
        fat:     acc.fat     + (l.fat as number),
        fiber:   acc.fiber   + ((l.fiber as number | null) ?? 0),
        sugar:   acc.sugar   + ((l.sugar as number | null) ?? 0),
      }),
      { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 }
    );

    const byMealType: Record<string, typeof logs> = {};
    for (const log of logs) {
      const mealType = log.mealType as string;
      if (!byMealType[mealType]) byMealType[mealType] = [];
      byMealType[mealType].push(log);
    }

    return reply.send({
      date: day.toISOString().split('T')[0],
      totals,
      byMealType,
      logs,
      goals: {
        dailyKcalGoal:    profile?.dailyKcalGoal ?? 2000,
        dailyWaterGoalMl: profile?.dailyWaterGoalMl ?? 2000,
        dailyProteinGoal: profile?.dailyProteinGoal ?? 140,
        dailyCarbsGoal:   profile?.dailyCarbsGoal ?? 250,
        dailyFatGoal:     profile?.dailyFatGoal ?? 65,
      },
    });
  });

  // GET /stats/weekly — heti adatok (7 nap visszamenőleg)
  fastify.get('/weekly', { preHandler: [authenticate, weeklyStatsGuard] }, async (request, reply) => {
    const userId = request.user.userId;
    const { weeksBack = '0' } = request.query as { weeksBack?: string };

    const weeksBackNum = parseInt(weeksBack) || 0;

    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
    endDate.setDate(endDate.getDate() - weeksBackNum * 7);

    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 6);
    startDate.setHours(0, 0, 0, 0);

    const [logs, profile, weightLogs, bodyLogs, prevLogs] = await Promise.all([
      fastify.prisma.dailyLog.findMany({
        where: { userId, createdAt: { gte: startDate, lte: endDate } },
        orderBy: { createdAt: 'asc' },
      }),
      fastify.prisma.userProfile.findUnique({ where: { userId } }),
      fastify.prisma.weightLog.findMany({
        where: { userId, loggedDate: { gte: startDate, lte: endDate } },
        orderBy: { loggedDate: 'asc' },
      }),
      fastify.prisma.bodyMeasurementLog.findMany({
        where: { userId, loggedDate: { gte: startDate, lte: endDate } },
        orderBy: { loggedDate: 'asc' },
      }),
      fastify.prisma.dailyLog.findMany({
        where: {
          userId,
          createdAt: {
            gte: (() => {
              const s = new Date(startDate);
              s.setDate(s.getDate() - 7);
              return s;
            })(),
            lt: startDate,
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // Napi bontás generálása (üres napok is legyenek benne)
    const days: { date: string; kcal: number; protein: number; carbs: number; fat: number; logCount: number }[] = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];

      const dayLogs = logs.filter(
        (l) => l.createdAt.toISOString().split('T')[0] === dateStr
      );

      days.push({
        date: dateStr,
        kcal:     Math.round(dayLogs.reduce((s, l) => s + l.kcal, 0) * 10) / 10,
        protein:  Math.round(dayLogs.reduce((s, l) => s + l.protein, 0) * 10) / 10,
        carbs:    Math.round(dayLogs.reduce((s, l) => s + l.carbs, 0) * 10) / 10,
        fat:      Math.round(dayLogs.reduce((s, l) => s + l.fat, 0) * 10) / 10,
        logCount: dayLogs.length,
      });
    }

    const avg = {
      kcal:    Math.round(days.reduce((s, d) => s + d.kcal, 0) / 7),
      protein: Math.round(days.reduce((s, d) => s + d.protein, 0) / 7 * 10) / 10,
      carbs:   Math.round(days.reduce((s, d) => s + d.carbs, 0) / 7 * 10) / 10,
      fat:     Math.round(days.reduce((s, d) => s + d.fat, 0) / 7 * 10) / 10,
    };

    const dailyKcalGoal = profile?.dailyKcalGoal ?? 2000;
    const dailyProteinGoal = profile?.dailyProteinGoal ?? 140;
    const dailyCarbsGoal = profile?.dailyCarbsGoal ?? 250;
    const dailyFatGoal = profile?.dailyFatGoal ?? 65;

    const loggedDaysList = days.filter((d) => d.logCount > 0);
    const loggedDays = loggedDaysList.length;
    const emptyDays = 7 - loggedDays;
    const totalKcal = Math.round(days.reduce((s, d) => s + d.kcal, 0));
    const onTargetBand = dailyKcalGoal * 0.1;
    const daysOnTarget = loggedDaysList.filter(
      (d) => Math.abs(d.kcal - dailyKcalGoal) <= onTargetBand,
    ).length;
    const avgDeltaVsGoal = Math.round(avg.kcal - dailyKcalGoal);

    let highestDay: { date: string; kcal: number } | null = null;
    let lowestDay: { date: string; kcal: number } | null = null;
    let mostLoggedDay: { date: string; logCount: number } | null = null;
    let kcalRange: number | null = null;
    let bestDayVsGoal: { date: string; kcal: number; delta: number } | null = null;
    let worstDayVsGoal: { date: string; kcal: number; delta: number } | null = null;

    if (loggedDaysList.length > 0) {
      highestDay = loggedDaysList.reduce(
        (best, d) => (d.kcal > best.kcal ? { date: d.date, kcal: Math.round(d.kcal) } : best),
        { date: loggedDaysList[0].date, kcal: Math.round(loggedDaysList[0].kcal) },
      );
      lowestDay = loggedDaysList.reduce(
        (best, d) => (d.kcal < best.kcal ? { date: d.date, kcal: Math.round(d.kcal) } : best),
        { date: loggedDaysList[0].date, kcal: Math.round(loggedDaysList[0].kcal) },
      );
      mostLoggedDay = loggedDaysList.reduce(
        (best, d) =>
          d.logCount > best.logCount ? { date: d.date, logCount: d.logCount } : best,
        { date: loggedDaysList[0].date, logCount: loggedDaysList[0].logCount },
      );
      if (loggedDaysList.length >= 2 && highestDay && lowestDay) {
        kcalRange = Math.round(highestDay.kcal - lowestDay.kcal);
      }

      const withDelta = loggedDaysList.map((d) => ({
        date: d.date,
        kcal: Math.round(d.kcal),
        delta: Math.round(d.kcal - dailyKcalGoal),
        abs: Math.abs(d.kcal - dailyKcalGoal),
      }));
      bestDayVsGoal = withDelta.reduce((best, d) => (d.abs < best.abs ? d : best));
      worstDayVsGoal = withDelta.reduce((worst, d) => (d.abs > worst.abs ? d : worst));
      bestDayVsGoal = {
        date: bestDayVsGoal.date,
        kcal: bestDayVsGoal.kcal,
        delta: bestDayVsGoal.delta,
      };
      worstDayVsGoal = {
        date: worstDayVsGoal.date,
        kcal: worstDayVsGoal.kcal,
        delta: worstDayVsGoal.delta,
      };
    }

    const macroAdherence = {
      protein:
        dailyProteinGoal > 0 ? Math.round((avg.protein / dailyProteinGoal) * 100) : null,
      carbs: dailyCarbsGoal > 0 ? Math.round((avg.carbs / dailyCarbsGoal) * 100) : null,
      fat: dailyFatGoal > 0 ? Math.round((avg.fat / dailyFatGoal) * 100) : null,
    };

    // Étkezéstípus átlag: csak azokra a napokra, ahol volt log az adott étkezésnél
    type MealAgg = { kcal: number; protein: number; carbs: number; fat: number; daysWithMeal: number };
    const mealDaySets: Record<string, Map<string, { kcal: number; protein: number; carbs: number; fat: number }>> = {};

    for (const l of logs) {
      const mealType = l.mealType as string;
      const dateStr = l.createdAt.toISOString().split('T')[0];
      if (!mealDaySets[mealType]) mealDaySets[mealType] = new Map();
      const dayMap = mealDaySets[mealType];
      const prev = dayMap.get(dateStr) ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 };
      dayMap.set(dateStr, {
        kcal: prev.kcal + l.kcal,
        protein: prev.protein + l.protein,
        carbs: prev.carbs + l.carbs,
        fat: prev.fat + l.fat,
      });
    }

    const mealAvg: Record<string, MealAgg> = {};
    for (const [mealType, dayMap] of Object.entries(mealDaySets)) {
      const dayValues = [...dayMap.values()];
      const n = dayValues.length;
      if (n === 0) continue;
      mealAvg[mealType] = {
        kcal: Math.round(dayValues.reduce((s, d) => s + d.kcal, 0) / n),
        protein: Math.round((dayValues.reduce((s, d) => s + d.protein, 0) / n) * 10) / 10,
        carbs: Math.round((dayValues.reduce((s, d) => s + d.carbs, 0) / n) * 10) / 10,
        fat: Math.round((dayValues.reduce((s, d) => s + d.fat, 0) / n) * 10) / 10,
        daysWithMeal: n,
      };
    }

    let dominantMeal: { mealType: string; avgKcal: number; sharePct: number } | null = null;
    const mealEntries = Object.entries(mealAvg);
    if (mealEntries.length > 0) {
      const sumAvg = mealEntries.reduce((s, [, m]) => s + m.kcal, 0);
      const top = mealEntries.reduce((best, cur) => (cur[1].kcal > best[1].kcal ? cur : best));
      dominantMeal = {
        mealType: top[0],
        avgKcal: top[1].kcal,
        sharePct: sumAvg > 0 ? Math.round((top[1].kcal / sumAvg) * 100) : 0,
      };
    }

    const mealDaily: Record<
      string,
      Array<{ date: string; kcal: number; protein: number; carbs: number; fat: number }>
    > = {};
    const allMealTypes = new Set([
      ...Object.keys(mealDaySets),
      'BREAKFAST',
      'TIZORAI',
      'LUNCH',
      'UZSONNA',
      'DINNER',
      'SNACK',
    ]);
    for (const mealType of allMealTypes) {
      const dayMap = mealDaySets[mealType];
      if (!dayMap || dayMap.size === 0) continue;
      mealDaily[mealType] = days.map((d) => {
        const row = dayMap.get(d.date);
        return {
          date: d.date,
          kcal: Math.round(row?.kcal ?? 0),
          protein: Math.round((row?.protein ?? 0) * 10) / 10,
          carbs: Math.round((row?.carbs ?? 0) * 10) / 10,
          fat: Math.round((row?.fat ?? 0) * 10) / 10,
        };
      });
    }

    // Previous week (rolling 7 days before current window)
    const prevDays: typeof days = [];
    const prevStart = new Date(startDate);
    prevStart.setDate(prevStart.getDate() - 7);
    for (let i = 0; i < 7; i++) {
      const d = new Date(prevStart);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const dayLogs = prevLogs.filter(
        (l) => l.createdAt.toISOString().split('T')[0] === dateStr,
      );
      prevDays.push({
        date: dateStr,
        kcal: Math.round(dayLogs.reduce((s, l) => s + l.kcal, 0) * 10) / 10,
        protein: Math.round(dayLogs.reduce((s, l) => s + l.protein, 0) * 10) / 10,
        carbs: Math.round(dayLogs.reduce((s, l) => s + l.carbs, 0) * 10) / 10,
        fat: Math.round(dayLogs.reduce((s, l) => s + l.fat, 0) * 10) / 10,
        logCount: dayLogs.length,
      });
    }
    const prevAvgKcal = Math.round(prevDays.reduce((s, d) => s + d.kcal, 0) / 7);
    const prevAvgProtein = Math.round((prevDays.reduce((s, d) => s + d.protein, 0) / 7) * 10) / 10;
    const prevAvgCarbs = Math.round((prevDays.reduce((s, d) => s + d.carbs, 0) / 7) * 10) / 10;
    const prevAvgFat = Math.round((prevDays.reduce((s, d) => s + d.fat, 0) / 7) * 10) / 10;
    const prevLoggedDays = prevDays.filter((d) => d.logCount > 0).length;
    const prevAvgDeltaVsGoal = Math.round(prevAvgKcal - dailyKcalGoal);
    const prevWeek = {
      avgKcal: prevAvgKcal,
      loggedDays: prevLoggedDays,
      avgDeltaVsGoal: prevAvgDeltaVsGoal,
      avgProtein: prevAvgProtein,
      avgCarbs: prevAvgCarbs,
      avgFat: prevAvgFat,
      deltaAvgKcal: Math.round(avg.kcal - prevAvgKcal),
    };

    let body: {
      weightDeltaKg: number | null;
      firstWeightKg: number | null;
      lastWeightKg: number | null;
      firstWeightDate: string | null;
      lastWeightDate: string | null;
      measurements: Array<{
        bodyPart: string;
        firstCm: number;
        lastCm: number;
        deltaCm: number;
        firstDate: string | null;
        lastDate: string | null;
      }>;
    } | null = null;

    const weightDeltaKg =
      weightLogs.length >= 2
        ? Math.round((weightLogs[weightLogs.length - 1].weightKg - weightLogs[0].weightKg) * 10) / 10
        : null;
    const measurementsByPart = new Map<
      string,
      { firstCm: number; lastCm: number; firstDate: Date; lastDate: Date }
    >();
    for (const row of bodyLogs) {
      const prev = measurementsByPart.get(row.bodyPart);
      if (!prev) {
        measurementsByPart.set(row.bodyPart, {
          firstCm: row.valueCm,
          lastCm: row.valueCm,
          firstDate: row.loggedDate,
          lastDate: row.loggedDate,
        });
      } else {
        prev.lastCm = row.valueCm;
        prev.lastDate = row.loggedDate;
      }
    }
    const measurements = [...measurementsByPart.entries()].map(([bodyPart, v]) => ({
      bodyPart,
      firstCm: v.firstCm,
      lastCm: v.lastCm,
      deltaCm: Math.round((v.lastCm - v.firstCm) * 10) / 10,
      firstDate: v.firstDate.toISOString().split('T')[0],
      lastDate: v.lastDate.toISOString().split('T')[0],
    }));

    if (weightLogs.length > 0 || measurements.length > 0) {
      body = {
        weightDeltaKg,
        firstWeightKg: weightLogs[0]?.weightKg ?? null,
        lastWeightKg: weightLogs[weightLogs.length - 1]?.weightKg ?? null,
        firstWeightDate: weightLogs[0]
          ? weightLogs[0].loggedDate.toISOString().split('T')[0]
          : null,
        lastWeightDate: weightLogs[weightLogs.length - 1]
          ? weightLogs[weightLogs.length - 1].loggedDate.toISOString().split('T')[0]
          : null,
        measurements,
      };
    }

    const weightByDate = new Map<string, number>();
    for (const w of weightLogs) {
      const dateStr = w.loggedDate.toISOString().split('T')[0];
      weightByDate.set(dateStr, w.weightKg);
    }
    const weightDaily = days.map((d) => ({
      date: d.date,
      weightKg: weightByDate.has(d.date)
        ? Math.round((weightByDate.get(d.date) as number) * 10) / 10
        : null,
    }));

    return reply.send({
      days,
      avg,
      mealAvg,
      mealDaily,
      weightDaily,
      from: startDate.toISOString().split('T')[0],
      to: endDate.toISOString().split('T')[0],
      goals: {
        dailyKcalGoal,
        dailyProteinGoal,
        dailyCarbsGoal,
        dailyFatGoal,
        goal: profile?.goal ?? null,
      },
      summary: {
        avgKcal: avg.kcal,
        avgProtein: avg.protein,
        avgCarbs: avg.carbs,
        avgFat: avg.fat,
        totalKcal,
        loggedDays,
        emptyDays,
        daysOnTarget,
        avgDeltaVsGoal,
        highestDay,
        lowestDay,
        kcalRange,
        mostLoggedDay,
        bestDayVsGoal,
        worstDayVsGoal,
        macroAdherence,
        dominantMeal,
        prevWeek,
        body,
      },
    });
  });

  // GET /stats/monthly?year=2025&month=3 — havi adatok (PREMIUM)
  fastify.get('/monthly', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user.userId;
    const { year, month } = request.query as { year?: string; month?: string };

    const profile = await fastify.prisma.userProfile.findUnique({ where: { userId } });
    if (profile?.tier !== 'PREMIUM') {
      return reply.status(403).send({
        error: 'A havi statisztika csak Premium előfizetőknek érhető el.',
        upgradeRequired: true,
        feature: 'monthly_stats',
      });
    }

    const y = parseInt(year ?? String(new Date().getFullYear()));
    const m = parseInt(month ?? String(new Date().getMonth() + 1));

    const startDate = new Date(y, m - 1, 1);
    const endDate = new Date(y, m, 0, 23, 59, 59, 999);

    const logs = await fastify.prisma.dailyLog.findMany({
      where: { userId, createdAt: { gte: startDate, lte: endDate } },
      orderBy: { createdAt: 'asc' },
    });

    // Napi bontás
    const daysInMonth = endDate.getDate();
    const days = [];

    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      const dayLogs = logs.filter((l) => l.createdAt.toISOString().split('T')[0] === dateStr);
      days.push({
        date: dateStr,
        kcal:    Math.round(dayLogs.reduce((s, l) => s + l.kcal, 0)),
        protein: Math.round(dayLogs.reduce((s, l) => s + l.protein, 0) * 10) / 10,
        carbs:   Math.round(dayLogs.reduce((s, l) => s + l.carbs, 0) * 10) / 10,
        fat:     Math.round(dayLogs.reduce((s, l) => s + l.fat, 0) * 10) / 10,
        logCount: dayLogs.length,
      });
    }

    const activeDays = days.filter((d) => d.logCount > 0).length;
    const totalKcal = days.reduce((s, d) => s + d.kcal, 0);

    return reply.send({
      year: y,
      month: m,
      days,
      summary: {
        activeDays,
        totalKcal: Math.round(totalKcal),
        avgKcalPerActiveDay: activeDays > 0 ? Math.round(totalKcal / activeDays) : 0,
        totalLogs: logs.length,
      },
    });
  });

  // GET /stats/streak — egymást követő aktív napok
  fastify.get('/streak', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user.userId;

    // Az utolsó 90 nap logjait nézzük
    const since = new Date();
    since.setDate(since.getDate() - 90);
    since.setHours(0, 0, 0, 0);

    const logs = await fastify.prisma.dailyLog.findMany({
      where: { userId, createdAt: { gte: since } },
      select: { createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    // Egyedi napok halmaza
    const activeDates = new Set(logs.map((l) => l.createdAt.toISOString().split('T')[0]));

    // Streak számolás: ma-tól visszafelé
    let streak = 0;
    const today = new Date();

    for (let i = 0; i < 90; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      if (activeDates.has(dateStr)) {
        streak++;
      } else {
        // Ha ma nincs bejegyzés, az még nem töri meg a sorozatot
        if (i === 0) continue;
        break;
      }
    }

    const messages = [
      streak === 0 ? 'Kezdd el a sorozatot ma!' :
      streak === 1 ? 'Nagyszerű kezdet! Folytasd holnap is!' :
      streak < 7   ? `${streak} napos sorozat! Csak így tovább!` :
      streak < 30  ? `🔥 ${streak} nap! Fantasztikus kitartás!` :
                     `🏆 ${streak} napos legendás sorozat!`,
    ];

    return reply.send({ streak, message: messages[0] });
  });
};

export default statsRoutes;
