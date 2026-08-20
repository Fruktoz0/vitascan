import { z } from 'zod';

export const DateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dátum formátum: YYYY-MM-DD');

export const MealTypeSchema = z.enum([
  'BREAKFAST',
  'TIZORAI',
  'LUNCH',
  'UZSONNA',
  'DINNER',
  'SNACK',
  'OTHER',
]);

export const SlotSourceSchema = z.enum(['RECIPE', 'TEMPLATE', 'FOOD', 'SKIPPED']);

export const GetPlanQuerySchema = z.object({
  weekStart: DateKeySchema.optional(),
  ownerId: z.string().uuid().optional(),
});

export const UpsertSlotSchema = z
  .object({
    weekStart: DateKeySchema.optional(),
    ownerId: z.string().uuid().optional(),
    slotDate: DateKeySchema,
    mealType: MealTypeSchema,
    source: SlotSourceSchema,
    recipeId: z.string().uuid().optional().nullable(),
    templateId: z.string().uuid().optional().nullable(),
    foodId: z.string().uuid().optional().nullable(),
    servings: z.number().min(0.25).max(50).optional(),
    amountG: z.number().min(1).max(100000).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.source === 'RECIPE' && !data.recipeId) {
      ctx.addIssue({ code: 'custom', message: 'Recept megadása kötelező.', path: ['recipeId'] });
    }
    if (data.source === 'TEMPLATE' && !data.templateId) {
      ctx.addIssue({ code: 'custom', message: 'Sablon megadása kötelező.', path: ['templateId'] });
    }
    if (data.source === 'FOOD' && !data.foodId) {
      ctx.addIssue({ code: 'custom', message: 'Étel megadása kötelező.', path: ['foodId'] });
    }
  });

export const DeleteSlotQuerySchema = z.object({
  alsoDiary: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'true'),
});

export const DeleteDayParamsSchema = z.object({
  date: DateKeySchema,
});

export const DeleteDayQuerySchema = z.object({
  alsoDiary: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'true'),
  ownerId: z.string().uuid().optional(),
});

export const LogSlotSchema = z.object({
  servings: z.number().min(0.25).max(50).optional(),
  amountG: z.number().min(1).max(100000).optional(),
  date: DateKeySchema.optional(),
  deductPantry: z.boolean().optional(),
});

export const DietTagSchema = z.enum(['GLUTEN_FREE', 'DAIRY_FREE', 'VEGAN', 'SUGAR_FREE']);

export const GeneratePlanSchema = z.object({
  weekStart: DateKeySchema.optional(),
  ownerId: z.string().uuid().optional(),
  meals: z.array(z.enum(['BREAKFAST', 'LUNCH', 'DINNER'])).min(1).max(3).optional(),
  usePantry: z.boolean().optional(),
  seasonal: z.boolean().optional(),
  scope: z.enum(['day', 'week']).optional(),
  date: DateKeySchema.optional(),
  diet: z.array(DietTagSchema).max(4).optional(),
  matchKcal: z.boolean().optional(),
  locale: z.enum(['hu', 'en']).optional(),
});

export const MissingCartSchema = z.object({
  weekStart: DateKeySchema.optional(),
  ownerId: z.string().uuid().optional(),
  listId: z.string().uuid().optional(),
});

export const MAX_MEAL_PLAN_GENERATE_FREE = 1;
export const MAX_MEAL_PLAN_GENERATE_PREMIUM = 3;
export const MAX_MEAL_PLAN_GENERATE_ADMIN = 20;

export type UpsertSlotInput = z.infer<typeof UpsertSlotSchema>;
export type LogSlotInput = z.infer<typeof LogSlotSchema>;
export type GeneratePlanInput = z.infer<typeof GeneratePlanSchema>;
export type MissingCartInput = z.infer<typeof MissingCartSchema>;
