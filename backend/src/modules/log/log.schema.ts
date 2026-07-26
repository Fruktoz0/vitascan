import { z } from 'zod';

export const CreateLogSchema = z.object({
  foodId: z.string().uuid().optional(), // optional: can log without DB food entry
  foodName: z.string().min(1).max(100),
  kcal: z.number().min(0),
  protein: z.number().min(0),
  carbs: z.number().min(0),
  fat: z.number().min(0),
  fiber: z.number().min(0).optional(),
  sugar: z.number().min(0).optional(),
  amount: z.number().min(1, 'Mennyiség min. 1g'),
  mealType: z.enum(['BREAKFAST', 'TIZORAI', 'LUNCH', 'UZSONNA', 'DINNER', 'SNACK', 'OTHER']).default('OTHER'),
  source: z.enum(['MANUAL', 'SCAN', 'SEARCH', 'AI']).default('MANUAL'),
  /** YYYY-MM-DD — ha meg van adva, a bejegyzés erre a napra kerül (nem a mai createdAt-re). */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dátum formátum: YYYY-MM-DD').optional(),
});

export const LogQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dátum formátum: YYYY-MM-DD').optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  mealType: z.enum(['BREAKFAST', 'TIZORAI', 'LUNCH', 'UZSONNA', 'DINNER', 'SNACK', 'OTHER']).optional(),
});

export const UpdateLogSchema = z.object({
  foodName: z.string().min(1).max(100).optional(),
  amount: z.number().min(1, 'Mennyiség min. 1g').optional(),
  mealType: z.enum(['BREAKFAST', 'TIZORAI', 'LUNCH', 'UZSONNA', 'DINNER', 'SNACK', 'OTHER']).optional(),
  kcal: z.number().min(0).optional(),
  protein: z.number().min(0).optional(),
  carbs: z.number().min(0).optional(),
  fat: z.number().min(0).optional(),
  fiber: z.number().min(0).optional().nullable(),
  sugar: z.number().min(0).optional().nullable(),
}).refine(
  (d) => Object.keys(d).length > 0,
  { message: 'Legalább egy mezőt meg kell adni.' }
);

export type CreateLogInput = z.infer<typeof CreateLogSchema>;
export type UpdateLogInput = z.infer<typeof UpdateLogSchema>;
