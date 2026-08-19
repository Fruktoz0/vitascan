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
