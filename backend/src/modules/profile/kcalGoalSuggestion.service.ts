import { PrismaClient } from '@prisma/client';
import {
  isWeightTargetReached,
  localMacroGoals,
  type MacroGoalsResult,
} from './profile.gemini';

const MIN_LOGS = 3;
const TREND_DAYS = 7;
const KCAL_DELTA_MIN = 75;
const PROTEIN_DELTA_MIN = 8;

export type GoalSnapshot = MacroGoalsResult;

export type SuggestionReason =
  | 'disabled'
  | 'insufficient_logs'
  | 'below_threshold'
  | 'dismissed'
  | 'missing_profile';

export type KcalGoalSuggestion = {
  show: boolean;
  reason?: SuggestionReason;
  weekKey: string;
  trendWeightKg: number | null;
  startWeightKg: number | null;
  current: GoalSnapshot | null;
  suggested: GoalSnapshot | null;
  deltaKcal: number | null;
  deltaProtein: number | null;
  reachedTarget: boolean;
};

type ProfileRow = {
  kcalGoalFollowsWeight: boolean;
  kcalGoalSource: string;
  startWeightKg: number | null;
  goalStartedAt: Date | null;
  kcalGoalSuggestionDismissedWeek: string | null;
  weightKg: number | null;
  heightCm: number | null;
  birthYear: number | null;
  gender: string | null;
  activityLevel: string;
  goal: 'LOSE' | 'MAINTAIN' | 'GAIN';
  targetWeightKg: number | null;
  goalWeeks: number | null;
  dailyKcalGoal: number | null;
  dailyProteinGoal: number | null;
  dailyCarbsGoal: number | null;
  dailyFatGoal: number | null;
  dailyWaterGoalMl: number | null;
};

export function isoWeekKey(ref = new Date()): string {
  const d = new Date(Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function snapshotFromProfile(profile: ProfileRow): GoalSnapshot | null {
  if (
    profile.dailyKcalGoal == null ||
    profile.dailyProteinGoal == null ||
    profile.dailyCarbsGoal == null ||
    profile.dailyFatGoal == null ||
    profile.dailyWaterGoalMl == null
  ) {
    return null;
  }
  return {
    dailyKcalGoal: Math.round(profile.dailyKcalGoal),
    dailyProteinGoal: round1(profile.dailyProteinGoal),
    dailyCarbsGoal: round1(profile.dailyCarbsGoal),
    dailyFatGoal: round1(profile.dailyFatGoal),
    dailyWaterGoalMl: Math.round(profile.dailyWaterGoalMl),
  };
}

function hidden(partial: Partial<KcalGoalSuggestion> & { reason: SuggestionReason; weekKey: string }): KcalGoalSuggestion {
  return {
    show: false,
    trendWeightKg: null,
    startWeightKg: null,
    current: null,
    suggested: null,
    deltaKcal: null,
    deltaProtein: null,
    reachedTarget: false,
    ...partial,
  };
}

export async function latestWeightKg(prisma: PrismaClient, userId: string): Promise<number | null> {
  const latest = await prisma.weightLog.findFirst({
    where: { userId },
    orderBy: [{ loggedDate: 'desc' }, { updatedAt: 'desc' }],
    select: { weightKg: true },
  });
  return latest?.weightKg ?? null;
}

export async function trendWeightKg(prisma: PrismaClient, userId: string): Promise<{
  avg: number | null;
  count: number;
}> {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (TREND_DAYS - 1));

  const logs = await prisma.weightLog.findMany({
    where: { userId, loggedDate: { gte: start, lte: end } },
    select: { weightKg: true },
  });
  if (logs.length === 0) return { avg: null, count: 0 };
  const sum = logs.reduce((s, l) => s + l.weightKg, 0);
  return { avg: round1(sum / logs.length), count: logs.length };
}

export async function ensureStartWeight(
  prisma: PrismaClient,
  userId: string,
  profile: ProfileRow,
  trendKg: number | null,
): Promise<{ startWeightKg: number | null; goalStartedAt: Date | null }> {
  if (profile.startWeightKg != null && Number.isFinite(profile.startWeightKg)) {
    return { startWeightKg: profile.startWeightKg, goalStartedAt: profile.goalStartedAt };
  }
  const anchor = trendKg ?? (await latestWeightKg(prisma, userId)) ?? profile.weightKg ?? null;
  if (anchor == null) {
    return { startWeightKg: null, goalStartedAt: profile.goalStartedAt };
  }
  const now = new Date();
  await prisma.userProfile.update({
    where: { userId },
    data: { startWeightKg: anchor, goalStartedAt: now },
  });
  return { startWeightKg: anchor, goalStartedAt: now };
}

export function computeSuggestedGoals(opts: {
  trendKg: number;
  startWeightKg: number | null;
  heightCm: number;
  birthYear: number;
  gender: string;
  activityLevel: string;
  goal: 'LOSE' | 'MAINTAIN' | 'GAIN';
  targetWeightKg: number | null;
  goalWeeks: number | null;
}): { goals: GoalSnapshot; reachedTarget: boolean } {
  const reachedTarget = isWeightTargetReached({
    trendKg: opts.trendKg,
    targetKg: opts.targetWeightKg,
    goal: opts.goal,
  });
  const goal = reachedTarget ? 'MAINTAIN' : opts.goal;
  const goals = localMacroGoals({
    locale: 'hu',
    weightKg: opts.trendKg,
    heightCm: opts.heightCm,
    birthYear: opts.birthYear,
    gender: opts.gender,
    activityLevel: opts.activityLevel,
    goal,
    targetWeightKg: reachedTarget ? null : opts.targetWeightKg,
    goalWeeks: reachedTarget ? null : opts.goalWeeks,
    startWeightKg: reachedTarget ? null : opts.startWeightKg,
  });
  return { goals, reachedTarget };
}

function overThreshold(current: GoalSnapshot | null, suggested: GoalSnapshot): boolean {
  if (!current) return true;
  const dKcal = Math.abs(suggested.dailyKcalGoal - current.dailyKcalGoal);
  const dProt = Math.abs(suggested.dailyProteinGoal - current.dailyProteinGoal);
  return dKcal >= KCAL_DELTA_MIN || dProt >= PROTEIN_DELTA_MIN;
}

export async function getKcalGoalSuggestion(
  prisma: PrismaClient,
  userId: string,
): Promise<KcalGoalSuggestion> {
  const weekKey = isoWeekKey();
  const profile = (await prisma.userProfile.findUnique({ where: { userId } })) as ProfileRow | null;
  if (!profile) {
    return hidden({ reason: 'missing_profile', weekKey });
  }
  if (!profile.kcalGoalFollowsWeight) {
    return hidden({ reason: 'disabled', weekKey });
  }
  if (profile.heightCm == null || profile.birthYear == null || !profile.gender) {
    return hidden({ reason: 'missing_profile', weekKey });
  }

  const { avg: trendKg, count } = await trendWeightKg(prisma, userId);
  if (trendKg == null || count < MIN_LOGS) {
    return hidden({ reason: 'insufficient_logs', weekKey, trendWeightKg: trendKg });
  }

  const start = await ensureStartWeight(prisma, userId, profile, trendKg);

  if (profile.kcalGoalSuggestionDismissedWeek === weekKey) {
    return hidden({
      reason: 'dismissed',
      weekKey,
      trendWeightKg: trendKg,
      startWeightKg: start.startWeightKg,
    });
  }

  const { goals: suggested, reachedTarget } = computeSuggestedGoals({
    trendKg,
    startWeightKg: start.startWeightKg,
    heightCm: profile.heightCm,
    birthYear: profile.birthYear,
    gender: profile.gender,
    activityLevel: profile.activityLevel,
    goal: profile.goal,
    targetWeightKg: profile.targetWeightKg,
    goalWeeks: profile.goalWeeks,
  });

  const current = snapshotFromProfile(profile);
  if (!overThreshold(current, suggested)) {
    return {
      show: false,
      reason: 'below_threshold',
      weekKey,
      trendWeightKg: trendKg,
      startWeightKg: start.startWeightKg,
      current,
      suggested,
      deltaKcal: current ? Math.round(suggested.dailyKcalGoal - current.dailyKcalGoal) : null,
      deltaProtein: current ? round1(suggested.dailyProteinGoal - current.dailyProteinGoal) : null,
      reachedTarget,
    };
  }

  return {
    show: true,
    weekKey,
    trendWeightKg: trendKg,
    startWeightKg: start.startWeightKg,
    current,
    suggested,
    deltaKcal: current ? Math.round(suggested.dailyKcalGoal - current.dailyKcalGoal) : suggested.dailyKcalGoal,
    deltaProtein: current ? round1(suggested.dailyProteinGoal - current.dailyProteinGoal) : suggested.dailyProteinGoal,
    reachedTarget,
  };
}

export async function applyKcalGoalSuggestion(
  prisma: PrismaClient,
  userId: string,
): Promise<KcalGoalSuggestion> {
  const preview = await getKcalGoalSuggestion(prisma, userId);
  if (!preview.show || !preview.suggested) {
    return preview;
  }

  const profile = await prisma.userProfile.findUnique({ where: { userId } });
  if (!profile) return preview;

  await prisma.userProfile.update({
    where: { userId },
    data: {
      dailyKcalGoal: preview.suggested.dailyKcalGoal,
      dailyProteinGoal: preview.suggested.dailyProteinGoal,
      dailyCarbsGoal: preview.suggested.dailyCarbsGoal,
      dailyFatGoal: preview.suggested.dailyFatGoal,
      dailyWaterGoalMl: preview.suggested.dailyWaterGoalMl,
      kcalGoalSource: 'AUTO',
      kcalGoalSuggestionDismissedWeek: null,
      ...(preview.reachedTarget
        ? { goal: 'MAINTAIN' as const, goalWeeks: null }
        : {}),
    },
  });

  return { ...preview, show: false, current: preview.suggested, deltaKcal: 0, deltaProtein: 0 };
}

export async function dismissKcalGoalSuggestion(
  prisma: PrismaClient,
  userId: string,
): Promise<{ weekKey: string }> {
  const weekKey = isoWeekKey();
  await prisma.userProfile.update({
    where: { userId },
    data: { kcalGoalSuggestionDismissedWeek: weekKey },
  });
  return { weekKey };
}

export async function resolveGoalAnchor(
  prisma: PrismaClient,
  userId: string,
  fallbackWeightKg: number | null | undefined,
): Promise<{ startWeightKg: number; goalStartedAt: Date }> {
  const latest = await latestWeightKg(prisma, userId);
  const startWeightKg = latest ?? fallbackWeightKg;
  if (startWeightKg == null || !Number.isFinite(startWeightKg)) {
    throw Object.assign(new Error('Nincs testsúly a célhorgonyhoz.'), { statusCode: 400 });
  }
  return { startWeightKg, goalStartedAt: new Date() };
}

export function goalAnchorChanged(opts: {
  prev: { goal: string; targetWeightKg: number | null; goalWeeks: number | null };
  next: { goal?: string; targetWeightKg?: number | null; goalWeeks?: number | null };
}): boolean {
  if (opts.next.goal !== undefined && opts.next.goal !== opts.prev.goal) return true;
  if (opts.next.targetWeightKg !== undefined) {
    const a = opts.prev.targetWeightKg;
    const b = opts.next.targetWeightKg;
    if (a == null && b == null) {
      /* same */
    } else if (a == null || b == null || Math.abs(a - b) >= 0.05) {
      return true;
    }
  }
  if (opts.next.goalWeeks !== undefined && opts.next.goalWeeks !== opts.prev.goalWeeks) {
    return true;
  }
  return false;
}
