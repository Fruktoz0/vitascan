import { z } from 'zod';

export const WorkoutIngestSchema = z.object({
  externalId: z.string().min(1).max(200).optional(),
  activityType: z.string().min(1).max(100),
  startedAt: z.string().min(1),
  endedAt: z.string().min(1).optional().nullable(),
  durationMin: z.number().min(0).max(24 * 60),
  activeEnergyKcal: z.number().min(0).max(20000).optional().nullable(),
  distanceKm: z.number().min(0).max(1000).optional().nullable(),
});

export const WorkoutCreateSchema = z.object({
  activityType: z.string().min(1).max(100),
  startedAt: z.string().min(1),
  endedAt: z.string().min(1).optional().nullable(),
  durationMin: z.number().min(0).max(24 * 60),
  activeEnergyKcal: z.number().min(0).max(20000).optional().nullable(),
  distanceKm: z.number().min(0).max(1000).optional().nullable(),
});

export const StepsIngestSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  steps: z.number().int().min(0).max(500_000),
});

export const StepsPutSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  steps: z.number().int().min(0).max(500_000),
});

export type WorkoutIngestInput = z.infer<typeof WorkoutIngestSchema>;
export type WorkoutCreateInput = z.infer<typeof WorkoutCreateSchema>;
export type StepsIngestInput = z.infer<typeof StepsIngestSchema>;
