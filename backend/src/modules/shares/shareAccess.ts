import { PrismaClient, ShareCategory, ShareStatus } from '@prisma/client';

export async function findActiveCartShare(
  prisma: PrismaClient,
  ownerId: string,
  partnerId: string,
) {
  return prisma.dataShare.findFirst({
    where: {
      ownerId,
      partnerId,
      status: ShareStatus.ACTIVE,
      categories: { has: ShareCategory.CART },
    },
  });
}

export async function canAccessShoppingList(
  prisma: PrismaClient,
  userId: string,
  listOwnerId: string,
): Promise<boolean> {
  if (listOwnerId === userId) return true;
  const share = await findActiveCartShare(prisma, listOwnerId, userId);
  return Boolean(share);
}

export async function findActiveMealPlanShare(
  prisma: PrismaClient,
  ownerId: string,
  partnerId: string,
) {
  return prisma.dataShare.findFirst({
    where: {
      ownerId,
      partnerId,
      status: ShareStatus.ACTIVE,
      categories: { has: ShareCategory.MEAL_PLAN },
    },
  });
}

export async function canAccessMealPlan(
  prisma: PrismaClient,
  userId: string,
  planOwnerId: string,
): Promise<boolean> {
  if (planOwnerId === userId) return true;
  const share = await findActiveMealPlanShare(prisma, planOwnerId, userId);
  return Boolean(share);
}

export async function listIncomingMealPlanShares(prisma: PrismaClient, partnerId: string) {
  return prisma.dataShare.findMany({
    where: {
      partnerId,
      status: ShareStatus.ACTIVE,
      categories: { has: ShareCategory.MEAL_PLAN },
    },
    include: {
      owner: { select: { id: true, username: true } },
    },
    orderBy: { acceptedAt: 'desc' },
  });
}
