import { z } from 'zod';

export const RegisterSchema = z.object({
  username: z
    .string()
    .min(3, 'Felhasználónév min. 3 karakter')
    .max(30, 'Felhasználónév max. 30 karakter')
    .regex(/^[a-zA-Z0-9_]+$/, 'Csak betű, szám és _ megengedett'),
  email: z.string().email('Érvénytelen email cím'),
  password: z
    .string()
    .min(8, 'Jelszó min. 8 karakter')
    .max(72, 'Jelszó max. 72 karakter'),
  acceptedTerms: z.literal(true, {
    errorMap: () => ({ message: 'El kell fogadni az adatkezelési tájékoztatót (GDPR)' }),
  }),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type RefreshInput = z.infer<typeof RefreshSchema>;
