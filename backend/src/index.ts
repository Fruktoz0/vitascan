import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';

import prismaPlugin from './plugins/prisma';
import authRoutes from './modules/auth/auth.routes';
import foodRoutes from './modules/food/food.routes';
import logRoutes from './modules/log/log.routes';
import waterRoutes from './modules/water/water.routes';
import profileRoutes from './modules/profile/profile.routes';
import adminRoutes from './modules/admin/admin.routes';

const fastify = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
  },
});

async function bootstrap() {
  // ─── Security plugins ────────────────────────────────────────────────────
  await fastify.register(helmet, { contentSecurityPolicy: false });

  await fastify.register(cors, {
    origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:8081'],
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

  // ─── DB plugin ───────────────────────────────────────────────────────────
  await fastify.register(prismaPlugin);

  // ─── Routes ──────────────────────────────────────────────────────────────
  fastify.get('/', async () => ({
    status: 'VitaScan API fut! 🥗',
    version: '1.0.0',
    docs: 'https://github.com/vitascan/api',
  }));

  // Health check (Docker healthcheck endpoint)
  fastify.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  await fastify.register(authRoutes, { prefix: '/auth' });
  await fastify.register(foodRoutes, { prefix: '/foods' });
  await fastify.register(logRoutes, { prefix: '/logs' });
  await fastify.register(waterRoutes, { prefix: '/water' });
  await fastify.register(profileRoutes, { prefix: '/profile' });

  // Scanner rate limit: 20 req/perc/user (a /foods/barcode endpoint előtt)
  await fastify.register(
    async (instance) => {
      await instance.register(rateLimit, {
        max: 20,
        timeWindow: '1 minute',
        keyGenerator: (req) => {
          // Rate limit per user if authenticated, else per IP
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

  await fastify.register(adminRoutes, { prefix: '/admin' });

  // ─── Start ───────────────────────────────────────────────────────────────
  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    console.log('🚀 VitaScan API fut a 3000-es porton (kívül: 3005)');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

bootstrap();
