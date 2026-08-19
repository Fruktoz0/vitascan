import { PrismaClient, ShareCategory, ShareStatus } from '@prisma/client';

type CartListener = (chunk: string) => void;

const listeners = new Map<string, Set<CartListener>>();

export function subscribeCartUser(userId: string, listener: CartListener): () => void {
  let set = listeners.get(userId);
  if (!set) {
    set = new Set();
    listeners.set(userId, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
    if (set && set.size === 0) listeners.delete(userId);
  };
}

export function notifyCartUsers(userIds: Iterable<string>): void {
  const chunk = `data: ${JSON.stringify({ type: 'cart', at: Date.now() })}\n\n`;
  const seen = new Set<string>();
  for (const userId of userIds) {
    if (!userId || seen.has(userId)) continue;
    seen.add(userId);
    const set = listeners.get(userId);
    if (!set) continue;
    for (const listener of set) listener(chunk);
  }
}

export async function cartAudienceUserIds(prisma: PrismaClient, ownerId: string): Promise<string[]> {
  const partners = await prisma.dataShare.findMany({
    where: {
      ownerId,
      status: ShareStatus.ACTIVE,
      categories: { has: ShareCategory.CART },
    },
    select: { partnerId: true },
  });
  return [ownerId, ...partners.map((row) => row.partnerId)];
}

export async function notifyCartListAudience(prisma: PrismaClient, ownerId: string): Promise<void> {
  notifyCartUsers(await cartAudienceUserIds(prisma, ownerId));
}
