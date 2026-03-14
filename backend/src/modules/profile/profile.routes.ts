import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate';
import { calculateTDEE, calculateWaterGoal } from '../../utils/tdee';

const UpsertProfileSchema = z.object({
  birthYear: z.number().int().min(1920).max(new Date().getFullYear() - 10).optional(),
  heightCm: z.number().min(50).max(300).optional(),
  weightKg: z.number().min(20).max(500).optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  activityLevel: z.enum(['SEDENTARY', 'LIGHT', 'MODERATE', 'ACTIVE', 'VERY_ACTIVE']).optional(),
  goal: z.enum(['LOSE', 'MAINTAIN', 'GAIN']).optional(),
  dailyKcalGoal: z.number().min(500).max(10000).optional(), // manual override
  dailyWaterGoalMl: z.number().min(500).max(5000).optional(),
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

    // Badge: Szakértő ha reputation >= 10
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

    // Auto-calculate TDEE if enough data is provided
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
        dailyKcalGoal: data.dailyKcalGoal ?? calculatedKcalGoal,
        dailyWaterGoalMl: data.dailyWaterGoalMl ?? (data.weightKg ? calculateWaterGoal(data.weightKg) : undefined),
      },
    });

    return reply.send({ profile, calculatedKcalGoal });
  });

  // POST /profile/calculate-tdee — számítás mentés nélkül (onboarding preview)
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

  // DELETE /profile — soft delete user (GDPR)
  fastify.delete('/me', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user.userId;

    await fastify.prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date() },
    });

    // Revoke all refresh tokens
    await fastify.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return reply.send({ message: 'Fiók törlésre jelölve. 30 napon belül véglegesítjük.' });
  });
};

export default profileRoutes;
