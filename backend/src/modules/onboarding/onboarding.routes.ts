import { FastifyPluginAsync } from 'fastify';
import { authenticate } from '../../middleware/authenticate';
import { OnboardingSchema } from './onboarding.schema';
import { completeOnboarding, getOnboardingStatus } from './onboarding.service';

const onboardingRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /onboarding/status — ellenőrzi, hogy kész-e az onboarding
  // A mobilapp ezt hívja induláskor: ha completed=false → onboarding screen
  fastify.get('/status', { preHandler: authenticate }, async (request, reply) => {
    const status = await getOnboardingStatus(fastify.prisma, request.user.userId);
    return reply.send(status);
  });

  // POST /onboarding/complete — az összes lépés adatát egyszerre menti
  fastify.post('/complete', { preHandler: authenticate }, async (request, reply) => {
    const parsed = OnboardingSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }

    try {
      const result = await completeOnboarding(
        fastify.prisma,
        request.user.userId,
        parsed.data
      );
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // POST /onboarding/preview-tdee — TDEE előnézet mentés nélkül (5. lépés UI-hoz)
  fastify.post('/preview-tdee', async (request, reply) => {
    const { calculateTDEE, calculateWaterGoal } = await import('../../utils/tdee');
    const { z } = await import('zod');

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

    const dailyKcalGoal = calculateTDEE(parsed.data);
    const dailyWaterGoalMl = calculateWaterGoal(parsed.data.weightKg);

    // Breakdown megjelenítéshez
    const age = new Date().getFullYear() - parsed.data.birthYear;
    const BMR =
      parsed.data.gender === 'MALE'
        ? 10 * parsed.data.weightKg + 6.25 * parsed.data.heightCm - 5 * age + 5
        : 10 * parsed.data.weightKg + 6.25 * parsed.data.heightCm - 5 * age - 161;

    const TDEE_MULTIPLIERS: Record<string, number> = {
      SEDENTARY: 1.2,
      LIGHT: 1.375,
      MODERATE: 1.55,
      ACTIVE: 1.725,
      VERY_ACTIVE: 1.9,
    };

    const tdee = Math.round(BMR * TDEE_MULTIPLIERS[parsed.data.activityLevel]);

    return reply.send({
      dailyKcalGoal,
      dailyWaterGoalMl,
      breakdown: {
        bmr: Math.round(BMR),
        tdee,
        adjustment:
          parsed.data.goal === 'LOSE' ? -500 : parsed.data.goal === 'GAIN' ? 300 : 0,
        goalLabel:
          parsed.data.goal === 'LOSE'
            ? 'Fogyás (-500 kcal/nap)'
            : parsed.data.goal === 'GAIN'
            ? 'Tömegnövelés (+300 kcal/nap)'
            : 'Szinten tartás',
      },
    });
  });
};

export default onboardingRoutes;
