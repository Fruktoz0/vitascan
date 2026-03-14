import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate';
import { calculateTDEE, calculateWaterGoal } from '../../utils/tdee';

const OnboardingCompleteSchema = z.object({
  birthYear:      z.number().int().min(1920).max(new Date().getFullYear() - 10).optional(),
  heightCm:       z.number().min(50).max(300).optional(),
  weightKg:       z.number().min(20).max(500).optional(),
  gender:         z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  activityLevel:  z.enum(['SEDENTARY', 'LIGHT', 'MODERATE', 'ACTIVE', 'VERY_ACTIVE']).optional(),
  goal:           z.enum(['LOSE', 'MAINTAIN', 'GAIN']).optional(),
  dailyKcalGoal:  z.number().min(500).max(10000).optional(),
  acceptedTerms:  z.literal(true),
});

const onboardingRoutes: FastifyPluginAsync = async (fastify) => {

  // GET /onboarding/status — onboarding állapot lekérése
  fastify.get('/status', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user.userId;

    const profile = await fastify.prisma.userProfile.findUnique({ where: { userId } });

    // Onboarding befejezettnek tekintjük, ha van profil és van kalória-cél
    const completed = !!(profile && profile.dailyKcalGoal);

    return reply.send({
      completed,
      steps: {
        profileCreated: !!profile,
        goalsSet:       !!(profile?.dailyKcalGoal),
        waterGoalSet:   !!(profile?.dailyWaterGoalMl),
      },
    });
  });

  // POST /onboarding/complete — onboarding adatok mentése
  fastify.post('/complete', { preHandler: authenticate }, async (request, reply) => {
    const parsed = OnboardingCompleteSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }

    const userId = request.user.userId;
    const data = parsed.data;

    // TDEE kiszámítása ha van elég adat
    let calculatedKcalGoal: number | undefined;
    if (data.weightKg && data.heightCm && data.birthYear && data.gender && data.activityLevel && data.goal) {
      calculatedKcalGoal = calculateTDEE({
        weightKg:      data.weightKg,
        heightCm:      data.heightCm,
        birthYear:     data.birthYear,
        gender:        data.gender,
        activityLevel: data.activityLevel,
        goal:          data.goal,
      });
    }

    const dailyKcalGoal    = data.dailyKcalGoal ?? calculatedKcalGoal ?? 2000;
    const dailyWaterGoalMl = data.weightKg ? calculateWaterGoal(data.weightKg) : 2000;

    const profile = await fastify.prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        birthYear:      data.birthYear,
        heightCm:       data.heightCm,
        weightKg:       data.weightKg,
        gender:         data.gender,
        activityLevel:  data.activityLevel ?? 'SEDENTARY',
        goal:           data.goal ?? 'MAINTAIN',
        dailyKcalGoal,
        dailyWaterGoalMl,
        tier: 'FREE',
      },
      update: {
        birthYear:      data.birthYear,
        heightCm:       data.heightCm,
        weightKg:       data.weightKg,
        gender:         data.gender,
        activityLevel:  data.activityLevel ?? 'SEDENTARY',
        goal:           data.goal ?? 'MAINTAIN',
        dailyKcalGoal,
        dailyWaterGoalMl,
      },
    });

    return reply.send({
      success: true,
      profile,
      calculatedKcalGoal,
      message: 'Onboarding sikeresen befejezve!',
    });
  });

  // POST /onboarding/preview-tdee — TDEE előnézet mentés nélkül
  fastify.post('/preview-tdee', async (request, reply) => {
    const schema = z.object({
      weightKg:      z.number().min(20).max(500),
      heightCm:      z.number().min(50).max(300),
      birthYear:     z.number().int().min(1920).max(new Date().getFullYear() - 10),
      gender:        z.enum(['MALE', 'FEMALE', 'OTHER']),
      activityLevel: z.enum(['SEDENTARY', 'LIGHT', 'MODERATE', 'ACTIVE', 'VERY_ACTIVE']),
      goal:          z.enum(['LOSE', 'MAINTAIN', 'GAIN']),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }

    const dailyKcalGoal    = calculateTDEE(parsed.data);
    const dailyWaterGoalMl = calculateWaterGoal(parsed.data.weightKg);

    return reply.send({ dailyKcalGoal, dailyWaterGoalMl });
  });
};

export default onboardingRoutes;
