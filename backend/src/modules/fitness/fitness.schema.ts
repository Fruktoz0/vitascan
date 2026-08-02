import { z } from 'zod';

export const WorkoutCreateSchema = z.object({
  activityType: z.string().min(1).max(100),
  startedAt: z.string().min(1),
  endedAt: z.string().min(1).optional().nullable(),
  durationMin: z.number().min(0).max(24 * 60),
  activeEnergyKcal: z.number().min(0).max(20000).optional().nullable(),
  distanceKm: z.number().min(0).max(1000).optional().nullable(),
});

export const StepsPutSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  steps: z.number().int().min(0).max(500_000),
});

export const FsCredentialsSchema = z.object({
  clientId: z.string().min(8).max(128),
  clientSecret: z.string().min(8).max(256),
});

export const SyncSchema = z.object({
  days: z.number().int().min(1).max(90).optional(),
});

export const FsExchangeSchema = z.object({
  /** Full redirect URL from personal.fitnesssyncer.com/?code=... or bare code */
  pasted: z.string().min(8).max(4000),
});

export type WorkoutCreateInput = z.infer<typeof WorkoutCreateSchema>;
