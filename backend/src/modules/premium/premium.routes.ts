import { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate';
import { TIER_LIMITS, getUserTier } from '../../middleware/tierGuard';

// A valós fizetési integráció (Stripe / RevenueCat) csatlakoztatási pontjai.
// Jelenleg: szimulált upgrade/downgrade fejlesztéshez.

export default async function premiumRoutes(fastify: FastifyInstance) {

  // GET /premium/status — tier, limitek, használat lekérése
  fastify.get('/premium/status', {
    preHandler: [authenticate],
  }, async (req, reply) => {
    const prisma = (fastify as any).prisma;
    const userId = (req.user as any).id ?? (req.user as any).userId;

    const tier = await getUserTier(prisma, userId);
    const limits = TIER_LIMITS[tier];

    // Jelenlegi napi felhasználás
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [dailyLogCount, dailyScanCount] = await Promise.all([
      prisma.dailyLog.count({ where: { userId, createdAt: { gte: startOfDay } } }),
      prisma.dailyLog.count({ where: { userId, source: 'SCAN', createdAt: { gte: startOfDay } } }),
    ]);

    return reply.send({
      tier,
      limits: {
        dailyLogs: { limit: limits.dailyLogs === Infinity ? null : limits.dailyLogs, used: dailyLogCount },
        dailyScans: { limit: limits.dailyScans === Infinity ? null : limits.dailyScans, used: dailyScanCount },
        exportEnabled: limits.exportEnabled,
        monthlyStatsEnabled: limits.monthlyStatsEnabled,
        premiumFoodsVisible: limits.premiumFoodsVisible,
        profileCustomization: limits.profileCustomization,
      },
    });
  });

  // GET /premium/features — marketing szöveg a Premium funkciókhoz
  fastify.get('/premium/features', async (_req, reply) => {
    return reply.send({
      features: [
        { id: 'unlimited_logs',   icon: '📝', title: 'Korlátlan naplózás',        desc: 'Adj hozzá annyi bejegyzést, amennyit csak akarsz.' },
        { id: 'unlimited_scans',  icon: '📷', title: 'Korlátlan szkennelés',      desc: 'Vonalkód-szkenner napi limit nélkül.' },
        { id: 'full_history',     icon: '📊', title: 'Teljes előzmény',           desc: 'Havi és éves statisztikák, trend-grafikonok.' },
        { id: 'export',           icon: '📤', title: 'Excel export',              desc: 'Töltsd le az összes adatodat XLSX formátumban.' },
        { id: 'premium_foods',    icon: '⭐', title: 'Prémium étel-adatbázis',   desc: 'Kiegészítő prémium ételek és tápértékek.' },
        { id: 'customization',    icon: '🎨', title: 'Profil testreszabás',       desc: 'Avatár, színtéma, egyedi célok.' },
        { id: 'no_ads',           icon: '🚫', title: 'Reklámok nélkül',          desc: 'Teljesen reklámmentes élmény.' },
      ],
      price: {
        monthly: { amount: 1990, currency: 'HUF', label: '1 990 Ft / hó' },
        yearly:  { amount: 14990, currency: 'HUF', label: '14 990 Ft / év', saving: '37%' },
      },
    });
  });

  // POST /premium/upgrade — DEV: szimulált upgrade (valódin Stripe webhook váltja)
  fastify.post('/premium/upgrade', {
    preHandler: [authenticate],
  }, async (req, reply) => {
    if (process.env.NODE_ENV === 'production') {
      return reply.status(400).send({ error: 'Éles környezetben a Stripe webhookon keresztül történik a frissítés.' });
    }
    const prisma = (fastify as any).prisma;
    const userId = (req.user as any).id ?? (req.user as any).userId;

    await prisma.userProfile.upsert({
      where: { userId },
      update: { tier: 'PREMIUM' },
      create: { userId, tier: 'PREMIUM', activityLevel: 'SEDENTARY', goal: 'MAINTAIN' },
    });

    return reply.send({ success: true, tier: 'PREMIUM', message: 'DEV: Tier frissítve Premium-ra.' });
  });

  // POST /premium/downgrade — DEV: visszaállítás FREE-re
  fastify.post('/premium/downgrade', {
    preHandler: [authenticate],
  }, async (req, reply) => {
    if (process.env.NODE_ENV === 'production') {
      return reply.status(400).send({ error: 'Éles környezetben a Stripe webhookon keresztül történik.' });
    }
    const prisma = (fastify as any).prisma;
    const userId = (req.user as any).id ?? (req.user as any).userId;

    await prisma.userProfile.update({
      where: { userId },
      data: { tier: 'FREE' },
    });

    return reply.send({ success: true, tier: 'FREE' });
  });

  // POST /premium/webhook — Stripe webhook (production placeholder)
  fastify.post('/premium/webhook', async (req, reply) => {
    // TODO: Stripe signature ellenőrzés + event feldolgozás
    // Tipikus event-ek:
    //   checkout.session.completed → tier = PREMIUM
    //   customer.subscription.deleted → tier = FREE
    //   invoice.payment_failed → értesítés küldése
    return reply.send({ received: true });
  });
}
