import type { FastifyInstance } from 'fastify';
import { MealType } from '@prisma/client';
import { calculateWaterGoal } from '../utils/tdee';
import { sendPushToSubscriptions } from '../modules/notifications/push.service';
import {
  dateOnlyUtc,
  isInQuietHours,
  resolveTimezone,
  zonedDayRange,
  zonedParts,
} from '../modules/notifications/timezone';

const TICK_MS = 60_000;

const MEAL_COPY: Record<
  'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK',
  { title: string; body: string }
> = {
  BREAKFAST: {
    title: 'Ideje a reggelinek',
    body: 'A mai reggeli még üres. Egy gyors naplóbejegyzés, és a nap jó irányba indul.',
  },
  LUNCH: {
    title: 'Ebédszünet',
    body: 'Még nincs ebéd a naplóban. Rögzítsd, amit ettél — később hálás leszel érte.',
  },
  DINNER: {
    title: 'Vacsoraidő',
    body: 'A vacsora még hiányzik a mai naplóból. Pár másodperc, és megvan.',
  },
  SNACK: {
    title: 'Nassolás?',
    body: 'Ha ettél valami rágcsálnivalót, most érdemes beírni, amíg emlékszel rá.',
  },
};

type MealSlot = {
  enabledKey: 'mealBreakfast' | 'mealLunch' | 'mealDinner' | 'mealSnack';
  timeKey: 'mealBreakfastAt' | 'mealLunchAt' | 'mealDinnerAt' | 'mealSnackAt';
  mealType: MealType;
};

const MEAL_SLOTS: MealSlot[] = [
  { enabledKey: 'mealBreakfast', timeKey: 'mealBreakfastAt', mealType: MealType.BREAKFAST },
  { enabledKey: 'mealLunch', timeKey: 'mealLunchAt', mealType: MealType.LUNCH },
  { enabledKey: 'mealDinner', timeKey: 'mealDinnerAt', mealType: MealType.DINNER },
  { enabledKey: 'mealSnack', timeKey: 'mealSnackAt', mealType: MealType.SNACK },
];

export function startNotificationPushScheduler(fastify: FastifyInstance) {
  const run = async () => {
    try {
      await tick(fastify);
    } catch (err) {
      fastify.log.warn({ err }, 'notification_push_tick_failed');
    }
  };

  const id = setInterval(run, TICK_MS);
  run().catch(() => {});

  fastify.addHook('onClose', async () => {
    clearInterval(id);
  });
}

async function tick(fastify: FastifyInstance) {
  const now = new Date();
  const prefs = await fastify.prisma.notificationPref.findMany({
    where: {
      user: { deletedAt: null, pushSubscriptions: { some: {} } },
      OR: [{ mealEnabled: true }, { waterEnabled: true }, { dailySummaryEnabled: true }],
    },
    include: {
      user: {
        select: {
          id: true,
          pushSubscriptions: { select: { endpoint: true, p256dh: true, auth: true } },
          profile: { select: { dailyKcalGoal: true, dailyWaterGoalMl: true, weightKg: true } },
        },
      },
    },
  });

  for (const pref of prefs) {
    const subs = pref.user.pushSubscriptions;
    if (subs.length === 0) continue;
    const tz = resolveTimezone(pref.timezone);
    const { ymd, hm } = zonedParts(now, tz);
    const range = zonedDayRange(ymd, tz);

    if (pref.mealEnabled) {
      for (const slot of MEAL_SLOTS) {
        if (!pref[slot.enabledKey]) continue;
        if (pref[slot.timeKey] !== hm) continue;
        const dedupe = `${ymd}:${slot.mealType}`;
        if (pref.lastMealSlot === dedupe) continue;

        const existing = await fastify.prisma.dailyLog.findFirst({
          where: {
            userId: pref.userId,
            mealType: slot.mealType,
            createdAt: { gte: range.start, lt: range.end },
          },
          select: { id: true },
        });
        if (existing) {
          await fastify.prisma.notificationPref.update({
            where: { id: pref.id },
            data: { lastMealSlot: dedupe },
          });
          pref.lastMealSlot = dedupe;
          continue;
        }

        const copy = MEAL_COPY[slot.mealType as keyof typeof MEAL_COPY];
        await sendPushToSubscriptions(fastify.prisma, subs, {
          title: copy.title,
          body: copy.body,
          url: '/home',
          kind: 'meal',
          tag: `vitascan-meal-${slot.mealType}`,
        });
        await fastify.prisma.notificationPref.update({
          where: { id: pref.id },
          data: { lastMealSlot: dedupe },
        });
        pref.lastMealSlot = dedupe;
      }
    }

    if (pref.waterEnabled) {
      if (!pref.lastWaterPushAt) {
        await fastify.prisma.notificationPref.update({
          where: { id: pref.id },
          data: { lastWaterPushAt: now },
        });
        pref.lastWaterPushAt = now;
      } else if (!isInQuietHours(hm, pref.waterQuietStart, pref.waterQuietEnd)) {
        const intervalMs = Math.max(1, pref.waterEveryHours) * 60 * 60 * 1000;
        if (now.getTime() - pref.lastWaterPushAt.getTime() >= intervalMs) {
          const goalMl =
            pref.user.profile?.dailyWaterGoalMl ??
            (pref.user.profile?.weightKg ? calculateWaterGoal(pref.user.profile.weightKg) : 2000);
          const water = await fastify.prisma.waterLog.findUnique({
            where: { userId_loggedDate: { userId: pref.userId, loggedDate: dateOnlyUtc(ymd) } },
            select: { totalMl: true },
          });
          const totalMl = water?.totalMl ?? 0;
          if (totalMl < goalMl) {
            const leftMl = Math.max(0, goalMl - totalMl);
            await sendPushToSubscriptions(fastify.prisma, subs, {
              title: 'Igyál egy kortyot',
              body:
                leftMl >= 1000
                  ? `Még ${(leftMl / 1000).toFixed(1)} l van hátra a mai célodig. Egy pohár most sokat számít.`
                  : `Még ${leftMl} ml van hátra a mai célodig. Egy pohár most sokat számít.`,
              url: '/water',
              kind: 'water',
              tag: 'vitascan-water',
            });
          }
          await fastify.prisma.notificationPref.update({
            where: { id: pref.id },
            data: { lastWaterPushAt: now },
          });
          pref.lastWaterPushAt = now;
        }
      }
    }

    if (pref.dailySummaryEnabled && pref.dailySummaryAt === hm && pref.lastDailyDate !== ymd) {
      const logs = await fastify.prisma.dailyLog.findMany({
        where: { userId: pref.userId, createdAt: { gte: range.start, lt: range.end } },
        select: { kcal: true },
      });
      const consumed = Math.round(logs.reduce((sum, row) => sum + row.kcal, 0));
      const goal = Math.round(pref.user.profile?.dailyKcalGoal ?? 2000);
      const over = consumed > goal;
      const remaining = Math.abs(goal - consumed);
      const dailyBody = over
        ? `Ma ${consumed} / ${goal} kcal (${remaining} kcal a cél felett). Holnap könnyen vissza lehet zárni.`
        : remaining === 0
          ? `Ma ${consumed} / ${goal} kcal — pont a célon. Szép nap volt.`
          : `Ma ${consumed} / ${goal} kcal. Még ${remaining} kcal a célodig.`;
      await sendPushToSubscriptions(fastify.prisma, subs, {
        title: over ? 'Mai mérleg — cél felett' : 'Mai mérleg',
        body: dailyBody,
        url: '/home',
        kind: 'daily',
        tag: `vitascan-daily-${ymd}`,
      });
      await fastify.prisma.notificationPref.update({
        where: { id: pref.id },
        data: { lastDailyDate: ymd },
      });
      pref.lastDailyDate = ymd;
    }
  }

  await tickFastingGoals(fastify, now);
}

async function tickFastingGoals(fastify: FastifyInstance, now: Date) {
  const sessions = await fastify.prisma.fastSession.findMany({
    where: {
      endedAt: null,
      user: { deletedAt: null, pushSubscriptions: { some: {} } },
    },
    include: {
      user: {
        select: {
          notificationPref: {
            select: { id: true, fastingGoalEnabled: true, lastFastingGoalPushAt: true },
          },
          pushSubscriptions: { select: { endpoint: true, p256dh: true, auth: true } },
        },
      },
    },
  });

  for (const session of sessions) {
    const pref = session.user.notificationPref;
    if (pref && pref.fastingGoalEnabled === false) continue;
    const goalAt = session.startedAt.getTime() + session.goalMinutes * 60_000;
    if (now.getTime() < goalAt) continue;
    if (pref?.lastFastingGoalPushAt && pref.lastFastingGoalPushAt.getTime() >= session.startedAt.getTime()) {
      continue;
    }

    const hours = Math.round(session.goalMinutes / 60);
    const subs = session.user.pushSubscriptions;
    if (subs.length === 0) continue;

    await sendPushToSubscriptions(fastify.prisma, subs, {
      title: 'Böjt cél elérve',
      body: `${hours} órás böjt kész. Szép munka — ha szeretnéd, folytathatod, vagy lezárhatod.`,
      url: '/fasting',
      kind: 'fasting',
      tag: `vitascan-fasting-${session.id}`,
    });

    if (pref) {
      await fastify.prisma.notificationPref.update({
        where: { id: pref.id },
        data: { lastFastingGoalPushAt: now },
      });
    } else {
      await fastify.prisma.notificationPref.upsert({
        where: { userId: session.userId },
        create: { userId: session.userId, lastFastingGoalPushAt: now },
        update: { lastFastingGoalPushAt: now },
      });
    }
  }
}
