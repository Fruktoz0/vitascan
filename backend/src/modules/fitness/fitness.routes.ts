import { FastifyPluginAsync } from 'fastify';
import { authenticate } from '../../middleware/authenticate';
import {
  WorkoutCreateSchema,
  StepsPutSchema,
  FsCredentialsSchema,
  SyncSchema,
  FsExchangeSchema,
} from './fitness.schema';
import * as svc from './fitness.service';

function statusFromErr(err: any): number {
  return typeof err?.statusCode === 'number' ? err.statusCode : 500;
}

function publicErrMessage(err: any, fallback = 'Váratlan hiba.'): string {
  const raw = typeof err?.message === 'string' ? err.message : fallback;
  const cleaned = raw.replace(/\s+/g, ' ').trim() || fallback;
  return cleaned.length > 240 ? `${cleaned.slice(0, 239).trimEnd()}…` : cleaned;
}

const fitnessRoutes: FastifyPluginAsync = async (fastify) => {
  // ─── FitnessSyncer ─────────────────────────────────────────────────────────
  fastify.get('/fitnesssyncer/status', { preHandler: authenticate }, async (request, reply) => {
    return reply.send(await svc.getFsStatus(fastify.prisma, request.user.userId));
  });

  fastify.put('/fitnesssyncer/credentials', { preHandler: authenticate }, async (request, reply) => {
    const parsed = FsCredentialsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    try {
      return reply.send(
        await svc.saveFsCredentials(
          fastify.prisma,
          request.user.userId,
          parsed.data.clientId,
          parsed.data.clientSecret,
        ),
      );
    } catch (err: any) {
      return reply.status(statusFromErr(err)).send({ error: publicErrMessage(err) });
    }
  });

  fastify.get('/fitnesssyncer/connect', { preHandler: authenticate }, async (request, reply) => {
    try {
      return reply.send(await svc.startFsConnect(fastify.prisma, request.user.userId));
    } catch (err: any) {
      return reply.status(statusFromErr(err)).send({ error: publicErrMessage(err) });
    }
  });

  /** Personal App: paste redirect URL / code after authorize */
  fastify.post('/fitnesssyncer/exchange', { preHandler: authenticate }, async (request, reply) => {
    const parsed = FsExchangeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    try {
      return reply.send(
        await svc.exchangeFsPaste(fastify.prisma, request.user.userId, parsed.data.pasted),
      );
    } catch (err: any) {
      return reply.status(statusFromErr(err)).send({ error: publicErrMessage(err) });
    }
  });

  // Legacy callback — Personal apps redirect to personal.fitnesssyncer.com, not here
  fastify.get('/fitnesssyncer/callback', async (request, reply) => {
    const q = request.query as { code?: string; state?: string; error?: string };
    const redirectTo = await svc.handleFsCallback(fastify.prisma, q);
    return reply.redirect(redirectTo);
  });

  fastify.delete('/fitnesssyncer', { preHandler: authenticate }, async (request, reply) => {
    return reply.send(await svc.disconnectFs(fastify.prisma, request.user.userId));
  });

  fastify.post('/sync', { preHandler: authenticate }, async (request, reply) => {
    const parsed = SyncSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    try {
      const result = await svc.syncFromFitnessSyncer(
        fastify.prisma,
        request.user.userId,
        parsed.data.days ?? 7,
      );
      return reply.send(result);
    } catch (err: any) {
      return reply.status(statusFromErr(err)).send({ error: publicErrMessage(err) });
    }
  });

  // ─── Workouts (JWT) ────────────────────────────────────────────────────────
  fastify.get('/workouts', { preHandler: authenticate }, async (request, reply) => {
    const { date } = request.query as { date?: string };
    return reply.send(await svc.listWorkouts(fastify.prisma, request.user.userId, date));
  });

  fastify.get('/workouts/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return reply.send(await svc.getWorkout(fastify.prisma, request.user.userId, id));
    } catch (err: any) {
      return reply.status(statusFromErr(err)).send({ error: publicErrMessage(err) });
    }
  });

  fastify.post('/workouts', { preHandler: authenticate }, async (request, reply) => {
    const parsed = WorkoutCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    try {
      const workout = await svc.createWorkout(fastify.prisma, request.user.userId, parsed.data);
      return reply.status(201).send({ workout });
    } catch (err: any) {
      return reply.status(statusFromErr(err)).send({ error: publicErrMessage(err) });
    }
  });

  fastify.delete('/workouts/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return reply.send(await svc.deleteWorkout(fastify.prisma, request.user.userId, id));
    } catch (err: any) {
      return reply.status(statusFromErr(err)).send({ error: publicErrMessage(err) });
    }
  });

  // ─── Steps (JWT) ───────────────────────────────────────────────────────────
  fastify.get('/steps', { preHandler: authenticate }, async (request, reply) => {
    const { date } = request.query as { date?: string };
    return reply.send(await svc.getSteps(fastify.prisma, request.user.userId, date));
  });

  fastify.put('/steps', { preHandler: authenticate }, async (request, reply) => {
    const parsed = StepsPutSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    const result = await svc.upsertSteps(
      fastify.prisma,
      request.user.userId,
      parsed.data.date,
      parsed.data.steps,
      'MANUAL',
    );
    return reply.send(result);
  });
};

export default fitnessRoutes;
