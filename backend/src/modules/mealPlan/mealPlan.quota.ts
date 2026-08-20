import type { PrismaClient } from '@prisma/client';
import { getUserTier } from '../../middleware/tierGuard';
import {
  MAX_MEAL_PLAN_GENERATE_ADMIN,
  MAX_MEAL_PLAN_GENERATE_FREE,
  MAX_MEAL_PLAN_GENERATE_PREMIUM,
} from './mealPlan.schema';

export const GENERATE_KIND = 'mealPlanGenerate';

export async function generateLimitFor(prisma: PrismaClient, userId: string, role: string) {
  if (role === 'ADMIN') return MAX_MEAL_PLAN_GENERATE_ADMIN;
  const tier = await getUserTier(prisma, userId);
  return tier === 'PREMIUM' ? MAX_MEAL_PLAN_GENERATE_PREMIUM : MAX_MEAL_PLAN_GENERATE_FREE;
}

export async function getGenerateQuota(
  prisma: PrismaClient,
  actorId: string,
  weekStart: Date,
  role: string,
) {
  const limit = await generateLimitFor(prisma, actorId, role);
  const row = await prisma.dailyAnalysis.findUnique({
    where: {
      userId_loggedDate_kind: { userId: actorId, loggedDate: weekStart, kind: GENERATE_KIND },
    },
    select: { generationCount: true },
  });
  const used = row?.generationCount ?? 0;
  return { used, limit, remaining: Math.max(0, limit - used) };
}

export async function bumpGenerateQuota(prisma: PrismaClient, actorId: string, weekStart: Date) {
  const existing = await prisma.dailyAnalysis.findUnique({
    where: {
      userId_loggedDate_kind: { userId: actorId, loggedDate: weekStart, kind: GENERATE_KIND },
    },
    select: { generationCount: true },
  });
  const next = (existing?.generationCount ?? 0) + 1;
  await prisma.dailyAnalysis.upsert({
    where: {
      userId_loggedDate_kind: { userId: actorId, loggedDate: weekStart, kind: GENERATE_KIND },
    },
    create: {
      userId: actorId,
      loggedDate: weekStart,
      kind: GENERATE_KIND,
      content: '{}',
      generationCount: next,
    },
    update: { generationCount: next },
  });
  return next;
}
