import { z } from 'zod';

export const ServingUnitSchema = z.enum(['g', 'db', 'adag', 'ek', 'szelet']);

export const CreateFoodSchema = z.object({
  name: z.string().min(2, 'Név min. 2 karakter').max(100),
  nameHu: z.string().min(2).max(100).optional(),
  nameEn: z.string().min(2).max(100).optional(),
  brand: z.string().max(100).optional(),
  barcode: z.string().max(50).optional(),
  kcal: z.number().min(0).max(9000),
  protein: z.number().min(0).max(100),
  carbs: z.number().min(0).max(100),
  fat: z.number().min(0).max(100),
  fiber: z.number().min(0).max(100).optional(),
  sugar: z.number().min(0).max(100).optional(),
  /** Grams that equal 1 servingUnit (e.g. 1 db = 118 g). */
  servingSize: z.number().min(0).optional(),
  servingUnit: ServingUnitSchema.optional(),
  source: z.enum(['INTERNAL', 'USER_SCAN', 'EXTERNAL_API']).optional(),
});

export const UpdateFoodSchema = CreateFoodSchema.partial();

export const FoodQuerySchema = z.object({
  q: z.string().optional(),
  status: z.enum(['UNVERIFIED', 'VERIFIED', 'BANNED']).optional(),
  tier: z.enum(['FREE', 'PREMIUM']).optional(),
  limit: z.coerce.number().min(1).max(50).default(20),
  offset: z.coerce.number().min(0).default(0),
});

export const VoteSchema = z.object({
  value: z.literal(1).or(z.literal(-1)),
});

export type CreateFoodInput = z.infer<typeof CreateFoodSchema>;
export type FoodQueryInput = z.infer<typeof FoodQuerySchema>;
