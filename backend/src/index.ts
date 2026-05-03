import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';

import prismaPlugin from './plugins/prisma';
import authRoutes from './modules/auth/auth.routes';
import foodRoutes from './modules/food/food.routes';
import logRoutes from './modules/log/log.routes';
import waterRoutes from './modules/water/water.routes';
import profileRoutes from './modules/profile/profile.routes';
import adminRoutes from './modules/admin/admin.routes';
import premiumRoutes from './modules/premium/premium.routes';
import statsRoutes from './modules/stats/stats.routes';
import onboardingRoutes from './modules/onboarding/onboarding.routes';
import exportRoutes from './modules/export/export.routes';
import weightRoutes from './modules/weight/weight.routes';

const fastify = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
  },
});

async function bootstrap() {
  // ─── Security plugins ────────────────────────────────────────────────────
  await fastify.register(helmet, { contentSecurityPolicy: false });

  await fastify.register(cors, {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true,
  });

  await fastify.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      error: 'Túl sok kérés. Kérjük várjon egy percet.',
    }),
  });

  await fastify.register(multipart, {
    limits: { fileSize: 512 * 1024 * 1024 },
  });

  // ─── DB plugin ───────────────────────────────────────────────────────────
  await fastify.register(prismaPlugin);

  // ─── Routes ──────────────────────────────────────────────────────────────
  fastify.get('/', async () => ({
    status: 'VitaScan API fut! 🥗',
    version: '1.0.0',
    docs: 'https://github.com/vitascan/api',
  }));

  fastify.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  await fastify.register(authRoutes, { prefix: '/auth' });
  await fastify.register(foodRoutes, { prefix: '/foods' });
  await fastify.register(logRoutes, { prefix: '/logs' });
  await fastify.register(waterRoutes, { prefix: '/water' });
  await fastify.register(weightRoutes, { prefix: '/weight' });
  await fastify.register(profileRoutes, { prefix: '/profile' });
  await fastify.register(statsRoutes, { prefix: '/stats' });
  await fastify.register(onboardingRoutes, { prefix: '/onboarding' });
  await fastify.register(exportRoutes, { prefix: '/export' });
  await fastify.register(premiumRoutes);
  await fastify.register(adminRoutes, { prefix: '/admin' });

  // ─── Scanner rate-limited endpoint ───────────────────────────────────────
  await fastify.register(
    async (instance) => {
      await instance.register(rateLimit, {
        max: 20,
        timeWindow: '1 minute',
        keyGenerator: (req) => {
          const auth = req.headers.authorization;
          if (auth?.startsWith('Bearer ')) return `scan_${auth.slice(7, 30)}`;
          return `scan_ip_${req.ip}`;
        },
        errorResponseBuilder: () => ({
          error: 'Vonalkód-szkennelési limit elérve (20/perc). Kérjük várjon.',
        }),
      });
      instance.get('/scan/:barcode', async (req, reply) => {
        const { barcode } = req.params as { barcode: string };
        const food = await fastify.prisma.food.findUnique({ where: { barcode } });
        if (!food || food.status === 'BANNED') {
          return reply.status(404).send({ error: 'Nincs találat.' });
        }
        return reply.send(food);
      });
    },
    { prefix: '/scanner' }
  );

  // ─── Start ───────────────────────────────────────────────────────────────
  try {
    const port = parseInt(process.env.PORT ?? '3005');
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`🚀 VitaScan API fut a ${port}-es porton`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

bootstrap();
