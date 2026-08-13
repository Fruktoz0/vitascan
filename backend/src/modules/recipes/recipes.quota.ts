import { PrismaClient } from '@prisma/client';

export type RecipeImportKind = 'IMAGE' | 'URL' | 'VIDEO';

export async function getRecipeImportUsage(
  prisma: PrismaClient,
  userId: string,
  kind: RecipeImportKind,
) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const usage = await prisma.aiRecipeImport.upsert({
    where: { userId_loggedDate_kind: { userId, loggedDate: today, kind } },
    create: { userId, loggedDate: today, kind, count: 0 },
    update: {},
  });
  return { usage, today };
}

export async function incrementRecipeImportUsage(
  prisma: PrismaClient,
  userId: string,
  kind: RecipeImportKind,
  today: Date,
) {
  return prisma.aiRecipeImport.update({
    where: { userId_loggedDate_kind: { userId, loggedDate: today, kind } },
    data: { count: { increment: 1 } },
  });
}
