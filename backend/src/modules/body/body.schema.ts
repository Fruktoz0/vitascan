import { z } from 'zod';

export const BODY_PARTS = ['ARM', 'THIGH', 'WAIST', 'FOREARM', 'HIP', 'CHEST'] as const;
export type BodyPartKey = (typeof BODY_PARTS)[number];

export const MAX_BODY_ANALYSES_PER_DAY = 3;

export const BodyPartSchema = z.enum(BODY_PARTS);

export const UpsertMeasurementSchema = z.object({
  bodyPart: BodyPartSchema,
  valueCm: z.number().min(10).max(300),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const UpdateMeasurementSchema = z.object({
  valueCm: z.number().min(10).max(300).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).refine((d) => d.valueCm != null || d.date != null, {
  message: 'Legalább valueCm vagy date megadása kötelező.',
});

export const HistoryQuerySchema = z.object({
  bodyPart: BodyPartSchema,
});

export const UpsertGoalSchema = z.object({
  bodyPart: BodyPartSchema,
  goalCm: z.number().min(10).max(300),
});

export const UpsertGoalsSchema = z.object({
  goals: z.array(UpsertGoalSchema).min(1).max(6),
});

export const GenerateBodyAnalysisSchema = z.object({
  locale: z.enum(['hu', 'en']).optional(),
});
