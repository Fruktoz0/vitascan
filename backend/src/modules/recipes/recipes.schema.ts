import { z } from 'zod';

export const RecipeSourceTypeSchema = z.enum([
  'MANUAL',
  'IMAGE',
  'VIDEO',
  'FACEBOOK',
  'INSTAGRAM',
  'TIKTOK',
  'YOUTUBE',
  'WEB',
]);

export const RecipeCategorySchema = z.enum([
  'BREAKFAST',
  'LUNCH',
  'DINNER',
  'SNACK',
  'DESSERT',
  'OTHER',
]);

export const RecipeDraftIngredientSchema = z.object({
  name: z.string().trim().min(1).max(160),
  amount: z.number().min(0).max(100000).nullable().optional(),
  unit: z.string().trim().max(24).nullable().optional(),
  amountG: z.number().min(0).max(100000).nullable().optional(),
  foodId: z.string().uuid().nullable().optional(),
  matchConfidence: z.number().min(0).max(1).nullable().optional(),
  sortOrder: z.number().int().min(0).max(200).optional(),
});

export const RecipeDraftSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).nullable().optional(),
  servings: z.number().int().min(1).max(50).default(1),
  category: RecipeCategorySchema.nullable().optional(),
  ingredients: z.array(RecipeDraftIngredientSchema).max(60).default([]),
  instructions: z.array(z.string().trim().min(1).max(2000)).max(40).default([]),
  sourceUrl: z
    .string()
    .max(2000)
    .nullable()
    .optional()
    .transform((v) => {
      if (!v) return null;
      try {
        const u = new URL(v);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
        return v;
      } catch {
        return null;
      }
    }),
  sourceType: RecipeSourceTypeSchema.default('MANUAL'),
  sourceExternalId: z.string().trim().max(200).nullable().optional(),
});

export const CreateRecipeSchema = RecipeDraftSchema.extend({
  tempImageKey: z
    .string()
    .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/i)
    .optional(),
  sourceExternalId: z.string().trim().max(200).nullable().optional(),
});

export const UpdateRecipeSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    servings: z.number().int().min(1).max(50).optional(),
    category: RecipeCategorySchema.nullable().optional(),
    ingredients: z.array(RecipeDraftIngredientSchema).max(60).optional(),
    instructions: z.array(z.string().trim().min(1).max(2000)).max(40).optional(),
    sourceUrl: z
      .string()
      .max(2000)
      .nullable()
      .optional()
      .transform((v) => {
        if (!v) return null;
        try {
          const u = new URL(v);
          if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
          return v;
        } catch {
          return null;
        }
      }),
    sourceType: RecipeSourceTypeSchema.optional(),
    tempImageKey: z
      .string()
      .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/i)
      .optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Legalább egy mezőt meg kell adni.' });

export const RecipeListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().trim().max(120).optional(),
  category: RecipeCategorySchema.optional(),
  favorite: z.enum(['true', '1']).optional(),
});

export const MatchIngredientsSchema = z.object({
  ingredients: z.array(RecipeDraftIngredientSchema).max(60),
  servings: z.number().int().min(1).max(50).optional(),
});

export const LogRecipeSchema = z
  .object({
    servings: z.number().min(0.25).max(50).optional(),
    amountG: z.number().min(1).max(100000).optional(),
    mealType: z.enum(['BREAKFAST', 'TIZORAI', 'LUNCH', 'UZSONNA', 'DINNER', 'SNACK', 'OTHER']).default('LUNCH'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .refine((d) => d.servings != null || d.amountG != null, {
    message: 'Adag vagy gramm megadása kötelező.',
  });

export const ImportUrlSchema = z.object({
  url: z.string().trim().url().max(2000),
  locale: z.enum(['hu', 'en']).optional(),
});

export const AI_RECIPE_IMAGE_DAILY_LIMIT = 10;
export const AI_RECIPE_URL_DAILY_LIMIT = 10;
export const AI_RECIPE_VIDEO_DAILY_LIMIT = 3;

export type CreateRecipeInput = z.infer<typeof CreateRecipeSchema>;
export type UpdateRecipeInput = z.infer<typeof UpdateRecipeSchema>;
export type RecipeListQuery = z.infer<typeof RecipeListQuerySchema>;
export type LogRecipeInput = z.infer<typeof LogRecipeSchema>;
