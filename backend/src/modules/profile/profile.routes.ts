import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate';
import { calculateTDEE, calculateWaterGoal } from '../../utils/tdee';
import { calculateMacroGoalsWithGemini } from './profile.gemini';
import {
  applyKcalGoalSuggestion,
  dismissKcalGoalSuggestion,
  getKcalGoalSuggestion,
  goalAnchorChanged,
  resolveGoalAnchor,
} from './kcalGoalSuggestion.service';

const UpsertProfileSchema = z.object({
  birthYear: z.number().int().min(1920).max(new Date().getFullYear() - 10).optional(),
  heightCm: z.number().min(50).max(300).optional(),
  weightKg: z.number().min(20).max(500).optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  activityLevel: z.enum(['SEDENTARY', 'LIGHT', 'MODERATE', 'ACTIVE', 'VERY_ACTIVE']).optional(),
  goal: z.enum(['LOSE', 'MAINTAIN', 'GAIN']).optional(),
  targetWeightKg: z.number().min(20).max(500).nullable().optional(),
  goalWeeks: z.number().int().min(1).max(52).nullable().optional(),
  dailyKcalGoal: z.number().min(500).max(10000).optional(),
  dailyWaterGoalMl: z.number().min(500).max(5000).optional(),
  dailyProteinGoal: z.number().min(20).max(400).optional(),
  dailyCarbsGoal: z.number().min(20).max(800).optional(),
  dailyFatGoal: z.number().min(10).max(300).optional(),
  avatarKey: z.string().min(1).max(64).optional(),
  tier: z.enum(['FREE', 'PREMIUM']).optional(),
  showHomeWaterCard: z.boolean().optional(),
  showHomeStreakCard: z.boolean().optional(),
  showHomeFastingCard: z.boolean().optional(),
  showHomeMealPlanCard: z.boolean().optional(),
  kcalGoalFollowsWeight: z.boolean().optional(),
  fastingProtocol: z.enum(['16:8', '18:6', '20:4', 'OMAD', 'CUSTOM']).optional(),
  fastingGoalMinutes: z.number().int().min(60).max(1439).optional(),
});

const profileRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /profile/me
  fastify.get('/me', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user.userId;
    const user = await fastify.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        reputation: true,
        createdAt: true,
        profile: true,
      },
    });

    if (!user) return reply.status(404).send({ error: 'Felhasználó nem található.' });

    const badges = user.reputation >= 10 ? ['EXPERT'] : [];

    return reply.send({ ...user, badges });
  });

  // PUT /profile — upsert
  fastify.put('/', { preHandler: authenticate }, async (request, reply) => {
    const parsed = UpsertProfileSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }

    const userId = request.user.userId;
    const data = parsed.data;

    let calculatedKcalGoal: number | undefined;
    if (data.weightKg && data.heightCm && data.birthYear && data.gender && data.activityLevel && data.goal) {
      calculatedKcalGoal = calculateTDEE({
        weightKg: data.weightKg,
        heightCm: data.heightCm,
        birthYear: data.birthYear,
        gender: data.gender,
        activityLevel: data.activityLevel,
        goal: data.goal,
      });
    }

    const existing = await fastify.prisma.userProfile.findUnique({ where: { userId } });

    let kcalGoalSource: string | undefined;
    if (
      data.dailyKcalGoal !== undefined &&
      existing?.dailyKcalGoal != null &&
      Math.abs(data.dailyKcalGoal - existing.dailyKcalGoal) >= 1
    ) {
      kcalGoalSource = 'MANUAL';
    }

    let anchor: { startWeightKg: number; goalStartedAt: Date } | undefined;
    if (
      existing &&
      goalAnchorChanged({
        prev: {
          goal: existing.goal,
          targetWeightKg: existing.targetWeightKg,
          goalWeeks: existing.goalWeeks,
        },
        next: {
          goal: data.goal,
          targetWeightKg: data.targetWeightKg,
          goalWeeks: data.goalWeeks,
        },
      })
    ) {
      try {
        anchor = await resolveGoalAnchor(
          fastify.prisma,
          userId,
          data.weightKg ?? existing.weightKg,
        );
      } catch {
        /* nincs súly — horgony később backfill */
      }
    } else if (!existing && data.weightKg != null) {
      anchor = { startWeightKg: data.weightKg, goalStartedAt: new Date() };
    }

    const profile = await fastify.prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        ...data,
        dailyKcalGoal: data.dailyKcalGoal ?? calculatedKcalGoal,
        dailyWaterGoalMl: data.dailyWaterGoalMl ?? (data.weightKg ? calculateWaterGoal(data.weightKg) : undefined),
        ...(anchor ?? {}),
        ...(kcalGoalSource ? { kcalGoalSource } : {}),
      },
      update: {
        ...data,
        ...(data.dailyKcalGoal !== undefined
          ? { dailyKcalGoal: data.dailyKcalGoal }
          : calculatedKcalGoal !== undefined
            ? { dailyKcalGoal: calculatedKcalGoal }
            : {}),
        ...(data.dailyWaterGoalMl !== undefined
          ? { dailyWaterGoalMl: data.dailyWaterGoalMl }
          : data.weightKg
            ? { dailyWaterGoalMl: calculateWaterGoal(data.weightKg) }
            : {}),
        ...(kcalGoalSource ? { kcalGoalSource } : {}),
        ...(anchor ?? {}),
      },
    });

    // Keep WeightLog in sync when profile weight changes (Home prefers WeightLog).
    if (data.weightKg != null) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      await fastify.prisma.weightLog.upsert({
        where: { userId_loggedDate: { userId, loggedDate: today } },
        create: { userId, loggedDate: today, weightKg: data.weightKg },
        update: { weightKg: data.weightKg },
      });
    }

    return reply.send({ profile, calculatedKcalGoal });
  });

  // POST /profile/calculate-tdee — számítás mentés nélkül
  fastify.post('/calculate-tdee', async (request, reply) => {
    const schema = z.object({
      weightKg: z.number().min(20).max(500),
      heightCm: z.number().min(50).max(300),
      birthYear: z.number().int().min(1920).max(new Date().getFullYear() - 10),
      gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
      activityLevel: z.enum(['SEDENTARY', 'LIGHT', 'MODERATE', 'ACTIVE', 'VERY_ACTIVE']),
      goal: z.enum(['LOSE', 'MAINTAIN', 'GAIN']),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }

    const dailyGoal = calculateTDEE(parsed.data);
    const waterGoal = calculateWaterGoal(parsed.data.weightKg);

    return reply.send({ dailyKcalGoal: dailyGoal, dailyWaterGoalMl: waterGoal });
  });

  // POST /profile/ai-calculate-goals — Gemini (vagy fallback) + mentés
  fastify.post('/ai-calculate-goals', { preHandler: authenticate }, async (request, reply) => {
    const bodySchema = z.object({
      locale: z.enum(['hu', 'en']).optional(),
      goal: z.enum(['LOSE', 'MAINTAIN', 'GAIN']).optional(),
      targetWeightKg: z.number().min(20).max(500).nullable().optional(),
      goalWeeks: z.number().int().min(1).max(52).nullable().optional(),
    });
    const parsed = bodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }

    const userId = request.user.userId;
    const profile = await fastify.prisma.userProfile.findUnique({ where: { userId } });
    if (!profile) {
      return reply.status(400).send({ error: 'Előbb töltsd ki a személyes adatokat.' });
    }

    const weightKg = profile.weightKg;
    const heightCm = profile.heightCm;
    const birthYear = profile.birthYear;
    const gender = profile.gender;
    const activityLevel = profile.activityLevel;

    if (weightKg == null || heightCm == null || birthYear == null || !gender) {
      return reply.status(400).send({
        error: 'A számításhoz szükséges: testsúly, magasság, születési év, nem. Töltsd ki a személyes adatokat.',
      });
    }

    const goal = parsed.data.goal ?? profile.goal ?? 'MAINTAIN';
    const targetWeightKg =
      parsed.data.targetWeightKg !== undefined
        ? parsed.data.targetWeightKg
        : profile.targetWeightKg;
    const goalWeeks =
      parsed.data.goalWeeks !== undefined ? parsed.data.goalWeeks : profile.goalWeeks;

    const resetAnchor = goalAnchorChanged({
      prev: {
        goal: profile.goal,
        targetWeightKg: profile.targetWeightKg,
        goalWeeks: profile.goalWeeks,
      },
      next: { goal, targetWeightKg, goalWeeks },
    });

    let startWeightKg = profile.startWeightKg;
    let goalStartedAt = profile.goalStartedAt;
    if (resetAnchor || startWeightKg == null) {
      try {
        const a = await resolveGoalAnchor(fastify.prisma, userId, weightKg);
        startWeightKg = a.startWeightKg;
        goalStartedAt = a.goalStartedAt;
      } catch {
        startWeightKg = weightKg;
        goalStartedAt = new Date();
      }
    }

    const goals = await calculateMacroGoalsWithGemini({
      locale: parsed.data.locale ?? 'hu',
      weightKg,
      heightCm,
      birthYear,
      gender,
      activityLevel,
      goal,
      targetWeightKg,
      goalWeeks,
      startWeightKg,
    });

    const updated = await fastify.prisma.userProfile.update({
      where: { userId },
      data: {
        goal,
        ...(parsed.data.targetWeightKg !== undefined
          ? { targetWeightKg: parsed.data.targetWeightKg }
          : {}),
        ...(parsed.data.goalWeeks !== undefined ? { goalWeeks: parsed.data.goalWeeks } : {}),
        dailyKcalGoal: goals.dailyKcalGoal,
        dailyProteinGoal: goals.dailyProteinGoal,
        dailyCarbsGoal: goals.dailyCarbsGoal,
        dailyFatGoal: goals.dailyFatGoal,
        dailyWaterGoalMl: goals.dailyWaterGoalMl,
        kcalGoalSource: 'AUTO',
        startWeightKg,
        goalStartedAt,
      },
    });

    return reply.send({ profile: updated, goals });
  });

  fastify.get('/kcal-goal-suggestion', { preHandler: authenticate }, async (request, reply) => {
    const result = await getKcalGoalSuggestion(fastify.prisma, request.user.userId);
    return reply.send(result);
  });

  fastify.post('/kcal-goal-suggestion/apply', { preHandler: authenticate }, async (request, reply) => {
    const result = await applyKcalGoalSuggestion(fastify.prisma, request.user.userId);
    if (!result.suggested) {
      return reply.status(400).send({ error: 'Nincs elfogadható javaslat.', ...result });
    }
    return reply.send(result);
  });

  fastify.post('/kcal-goal-suggestion/dismiss', { preHandler: authenticate }, async (request, reply) => {
    const profile = await fastify.prisma.userProfile.findUnique({
      where: { userId: request.user.userId },
      select: { userId: true },
    });
    if (!profile) {
      return reply.status(400).send({ error: 'Előbb töltsd ki a személyes adatokat.' });
    }
    const result = await dismissKcalGoalSuggestion(fastify.prisma, request.user.userId);
    return reply.send(result);
  });

  // DELETE /profile — soft delete user (GDPR)
  fastify.delete('/me', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user.userId;

    await fastify.prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date() },
    });

    await fastify.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return reply.send({ message: 'Fiók törlésre jelölve. 30 napon belül véglegesítjük.' });
  });
};

export default profileRoutes;
