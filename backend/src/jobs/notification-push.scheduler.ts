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
  BREAKFAST: { title: 'Reggeli ideje', body: 'Még nincs bejegyzésed a mai reggelire.' },
  LUNCH: { title: 'Ebéd ideje', body: 'Még nincs bejegyzésed a mai ebédre.' },
  DINNER: { title: 'Vacsora ideje', body: 'Még nincs bejegyzésed a mai vacsorára.' },
  SNACK: { title: 'Nassolás ideje', body: 'Még nincs nassolás bejegyezve mára.' },
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
            await sendPushToSubscriptions(fastify.prisma, subs, {
              title: 'Igyál vizet',
              body: `Még ${Math.max(0, goalMl - totalMl)} ml van hátra a mai célodig.`,
              url: '/home',
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
      await sendPushToSubscriptions(fastify.prisma, subs, {
        title: 'Napi összefoglaló',
        body: `Ma ${consumed} / ${goal} kcal.`,
        url: '/home',
      });
      await fastify.prisma.notificationPref.update({
        where: { id: pref.id },
        data: { lastDailyDate: ymd },
      });
      pref.lastDailyDate = ymd;
    }
  }
}
