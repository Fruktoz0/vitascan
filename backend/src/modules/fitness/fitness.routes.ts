import { FastifyPluginAsync } from 'fastify';
import { authenticate } from '../../middleware/authenticate';
import {
  WorkoutIngestSchema,
  WorkoutCreateSchema,
  StepsIngestSchema,
  StepsPutSchema,
} from './fitness.schema';
import * as svc from './fitness.service';

function statusFromErr(err: any): number {
  return typeof err?.statusCode === 'number' ? err.statusCode : 500;
}

const fitnessRoutes: FastifyPluginAsync = async (fastify) => {
  // ─── Token (JWT) ───────────────────────────────────────────────────────────
  fastify.get('/token', { preHandler: authenticate }, async (request, reply) => {
    const status = await svc.getTokenStatus(fastify.prisma, request.user.userId);
    return reply.send(status);
  });

  fastify.post('/token', { preHandler: authenticate }, async (request, reply) => {
    const result = await svc.createIngestToken(fastify.prisma, request.user.userId);
    return reply.status(201).send(result);
  });

  fastify.delete('/token', { preHandler: authenticate }, async (request, reply) => {
    const result = await svc.revokeIngestToken(fastify.prisma, request.user.userId);
    return reply.send(result);
  });

  // ─── Workouts ingest (Shortcuts token) ─────────────────────────────────────
  fastify.post('/workouts/ingest', async (request, reply) => {
    const userId = await svc.findUserIdByIngestToken(
      fastify.prisma,
      request.headers.authorization,
    );
    if (!userId) {
      return reply.status(401).send({ error: 'Érvénytelen fitness token.' });
    }
    const parsed = WorkoutIngestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    try {
      const workout = await svc.ingestWorkout(fastify.prisma, userId, parsed.data);
      return reply.status(201).send({ workout });
    } catch (err: any) {
      return reply.status(statusFromErr(err)).send({ error: err.message });
    }
  });

  // ─── Steps ingest (Shortcuts token) ────────────────────────────────────────
  fastify.post('/steps/ingest', async (request, reply) => {
    const userId = await svc.findUserIdByIngestToken(
      fastify.prisma,
      request.headers.authorization,
    );
    if (!userId) {
      return reply.status(401).send({ error: 'Érvénytelen fitness token.' });
    }
    const parsed = StepsIngestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    const result = await svc.upsertSteps(
      fastify.prisma,
      userId,
      parsed.data.date,
      parsed.data.steps,
      'SHORTCUTS',
    );
    return reply.status(201).send(result);
  });

  // ─── Workouts (JWT) ────────────────────────────────────────────────────────
  fastify.get('/workouts', { preHandler: authenticate }, async (request, reply) => {
    const { date } = request.query as { date?: string };
    return reply.send(await svc.listWorkouts(fastify.prisma, request.user.userId, date));
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
      return reply.status(statusFromErr(err)).send({ error: err.message });
    }
  });

  fastify.delete('/workouts/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return reply.send(await svc.deleteWorkout(fastify.prisma, request.user.userId, id));
    } catch (err: any) {
      return reply.status(statusFromErr(err)).send({ error: err.message });
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
