import { z } from 'zod';

export const AnalysisQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dátum formátum: YYYY-MM-DD').optional(),
});

export const GenerateAnalysisSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dátum formátum: YYYY-MM-DD').optional(),
  locale: z.enum(['hu', 'en']).optional(),
  /** Client local ISO datetime, e.g. 2026-07-25T18:42:00+02:00 */
  localTime: z.string().min(8).max(40).optional(),
});

export type GenerateAnalysisInput = z.infer<typeof GenerateAnalysisSchema>;

export const MAX_GENERATIONS_PER_DAY = 5;
