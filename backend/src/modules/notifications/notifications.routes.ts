import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate';
import { getVapidPublicKey } from './push.service';

const HHMM = z
  .string()
  .transform((s) => s.trim().slice(0, 5))
  .pipe(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Érvénytelen időpont (HH:mm).'));

const PrefsSchema = z.object({
  mealEnabled: z.boolean().optional(),
  mealBreakfast: z.boolean().optional(),
  mealLunch: z.boolean().optional(),
  mealDinner: z.boolean().optional(),
  mealSnack: z.boolean().optional(),
  mealBreakfastAt: HHMM.optional(),
  mealLunchAt: HHMM.optional(),
  mealDinnerAt: HHMM.optional(),
  mealSnackAt: HHMM.optional(),
  waterEnabled: z.boolean().optional(),
  waterEveryHours: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
  waterQuietStart: HHMM.optional(),
  waterQuietEnd: HHMM.optional(),
  dailySummaryEnabled: z.boolean().optional(),
  dailySummaryAt: HHMM.optional(),
  cartPartnerEnabled: z.boolean().optional(),
  shareInviteEnabled: z.boolean().optional(),
  timezone: z.string().min(1).max(64).optional(),
});

const SubscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(256),
  }),
  userAgent: z.string().max(512).optional().nullable(),
});

const UnsubscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
});

function serializePrefs(row: {
  mealEnabled: boolean;
  mealBreakfast: boolean;
  mealLunch: boolean;
  mealDinner: boolean;
  mealSnack: boolean;
  mealBreakfastAt: string;
  mealLunchAt: string;
  mealDinnerAt: string;
  mealSnackAt: string;
  waterEnabled: boolean;
  waterEveryHours: number;
  waterQuietStart: string;
  waterQuietEnd: string;
  dailySummaryEnabled: boolean;
  dailySummaryAt: string;
  cartPartnerEnabled: boolean;
  shareInviteEnabled: boolean;
  timezone: string;
}) {
  return {
    mealEnabled: row.mealEnabled,
    mealBreakfast: row.mealBreakfast,
    mealLunch: row.mealLunch,
    mealDinner: row.mealDinner,
    mealSnack: row.mealSnack,
    mealBreakfastAt: row.mealBreakfastAt,
    mealLunchAt: row.mealLunchAt,
    mealDinnerAt: row.mealDinnerAt,
    mealSnackAt: row.mealSnackAt,
    waterEnabled: row.waterEnabled,
    waterEveryHours: row.waterEveryHours,
    waterQuietStart: row.waterQuietStart,
    waterQuietEnd: row.waterQuietEnd,
    dailySummaryEnabled: row.dailySummaryEnabled,
    dailySummaryAt: row.dailySummaryAt,
    cartPartnerEnabled: row.cartPartnerEnabled,
    shareInviteEnabled: row.shareInviteEnabled,
    timezone: row.timezone,
    vapidPublicKey: getVapidPublicKey(),
  };
}

const notificationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/vapid-public', async (_request, reply) => {
    const publicKey = getVapidPublicKey();
    if (!publicKey) {
      return reply.status(503).send({ error: 'A Web Push nincs beállítva a szerveren.' });
    }
    return reply.send({ publicKey });
  });

  fastify.get('/prefs', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user.userId;
    const row = await fastify.prisma.notificationPref.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
    return reply.send(serializePrefs(row));
  });

  fastify.put('/prefs', { preHandler: authenticate }, async (request, reply) => {
    const parsed = PrefsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    const userId = request.user.userId;
    const data = parsed.data;
    const row = await fastify.prisma.notificationPref.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    return reply.send(serializePrefs(row));
  });

  fastify.post('/subscribe', { preHandler: authenticate }, async (request, reply) => {
    const parsed = SubscribeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    const userId = request.user.userId;
    const { endpoint, keys, userAgent } = parsed.data;
    await fastify.prisma.pushSubscription.upsert({
      where: { endpoint },
      create: {
        userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: userAgent || null,
      },
      update: {
        userId,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: userAgent || null,
      },
    });
    return reply.send({ ok: true });
  });

  fastify.delete('/subscribe', { preHandler: authenticate }, async (request, reply) => {
    const parsed = UnsubscribeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    await fastify.prisma.pushSubscription.deleteMany({
      where: { userId: request.user.userId, endpoint: parsed.data.endpoint },
    });
    return reply.send({ ok: true });
  });
};

export default notificationRoutes;
