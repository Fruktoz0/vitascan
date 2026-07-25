import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate';
import { calculateTDEE, calculateWaterGoal } from '../../utils/tdee';
import { calculateMacroGoalsWithGemini } from './profile.gemini';

const UpsertProfileSchema = z.object({
  birthYear: z.number().int().min(1920).max(new Date().getFullYear() - 10).optional(),
  heightCm: z.number().min(50).max(300).optional(),
  weightKg: z.number().min(20).max(500).optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  activityLevel: z.enum(['SEDENTARY', 'LIGHT', 'MODERATE', 'ACTIVE', 'VERY_ACTIVE']).optional(),
  goal: z.enum(['LOSE', 'MAINTAIN', 'GAIN']).optional(),
  dailyKcalGoal: z.number().min(500).max(10000).optional(),
  dailyWaterGoalMl: z.number().min(500).max(5000).optional(),
  dailyProteinGoal: z.number().min(20).max(400).optional(),
  dailyCarbsGoal: z.number().min(20).max(800).optional(),
  dailyFatGoal: z.number().min(10).max(300).optional(),
  avatarKey: z.string().min(1).max(64).optional(),
  tier: z.enum(['FREE', 'PREMIUM']).optional(),
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

    const profile = await fastify.prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        ...data,
        dailyKcalGoal: data.dailyKcalGoal ?? calculatedKcalGoal,
        dailyWaterGoalMl: data.dailyWaterGoalMl ?? (data.weightKg ? calculateWaterGoal(data.weightKg) : undefined),
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

    const goals = await calculateMacroGoalsWithGemini({
      locale: parsed.data.locale ?? 'hu',
      weightKg,
      heightCm,
      birthYear,
      gender,
      activityLevel,
      goal,
    });

    const updated = await fastify.prisma.userProfile.update({
      where: { userId },
      data: {
        goal,
        dailyKcalGoal: goals.dailyKcalGoal,
        dailyProteinGoal: goals.dailyProteinGoal,
        dailyCarbsGoal: goals.dailyCarbsGoal,
        dailyFatGoal: goals.dailyFatGoal,
        dailyWaterGoalMl: goals.dailyWaterGoalMl,
      },
    });

    return reply.send({ profile: updated, goals });
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
