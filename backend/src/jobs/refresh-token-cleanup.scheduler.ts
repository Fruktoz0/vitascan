import type { FastifyInstance } from 'fastify';
import {
  getRefreshTokenCleanupConfig,
  runRefreshTokenCleanupJob,
  shouldRunScheduledCleanup,
} from '../modules/system/refresh-token-cleanup.service';

const TICK_MS = 60_000;

export function startRefreshTokenCleanupScheduler(fastify: FastifyInstance) {
  const run = async () => {
    try {
      const { intervalHours, lastRunAt } = await getRefreshTokenCleanupConfig(fastify.prisma);
      if (!shouldRunScheduledCleanup(lastRunAt, intervalHours)) return;
      const { deleted } = await runRefreshTokenCleanupJob(fastify.prisma);
      fastify.log.info({ deleted }, 'refresh_token_cleanup');
    } catch (err) {
      fastify.log.warn({ err }, 'refresh_token_cleanup_failed');
    }
  };

  const id = setInterval(run, TICK_MS);
  run().catch(() => {});

  fastify.addHook('onClose', async () => {
    clearInterval(id);
  });
}
