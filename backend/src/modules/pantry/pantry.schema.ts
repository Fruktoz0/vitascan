import { z } from 'zod';

export const DateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dátum formátum: YYYY-MM-DD');

export const PantryQuerySchema = z.object({
  ownerId: z.string().uuid().optional(),
});

export const UpsertPantrySchema = z.object({
  ownerId: z.string().uuid().optional(),
  foodId: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(1).max(120),
  quantity: z.number().min(0.01).max(100000),
  unit: z.string().trim().max(16).optional().nullable(),
  expiresOn: DateKeySchema.optional().nullable(),
  source: z.enum(['MANUAL', 'BARCODE', 'CART_CHECKED', 'LEFTOVER', 'AI']).optional(),
  merge: z.boolean().optional(),
});

export const PatchPantrySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    quantity: z.number().min(0).max(100000).optional(),
    unit: z.string().trim().max(16).optional().nullable(),
    expiresOn: DateKeySchema.optional().nullable(),
  })
  .refine((d) => d.name != null || d.quantity != null || d.unit != null || d.expiresOn !== undefined, {
    message: 'Legalább egy mezőt meg kell adni.',
  });
