import { PrismaClient } from '@prisma/client';
import webpush from 'web-push';

export type PushPayload = {
  title: string;
  body: string;
  url: string;
};

type PrefFlag = 'cartPartnerEnabled' | 'shareInviteEnabled';

let vapidReady = false;

export function getVapidPublicKey(): string | null {
  const key = process.env.VAPID_PUBLIC_KEY?.trim();
  return key || null;
}

function ensureVapid(): boolean {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:admin@example.com';
  if (!publicKey || !privateKey) return false;
  if (!vapidReady) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    vapidReady = true;
  }
  return true;
}

async function dropSubscription(prisma: PrismaClient, endpoint: string) {
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
}

export async function sendPushToSubscriptions(
  prisma: PrismaClient,
  subscriptions: Array<{ endpoint: string; p256dh: string; auth: string }>,
  payload: PushPayload,
): Promise<void> {
  if (!ensureVapid() || subscriptions.length === 0) return;
  const body = JSON.stringify(payload);
  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
        );
      } catch (err: unknown) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          await dropSubscription(prisma, sub.endpoint);
        }
      }
    }),
  );
}

export async function sendPushToUsers(
  prisma: PrismaClient,
  userIds: string[],
  payload: PushPayload,
  flag?: PrefFlag,
): Promise<void> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0 || !ensureVapid()) return;

  const prefs = await prisma.notificationPref.findMany({
    where: { userId: { in: unique } },
    select: { userId: true, cartPartnerEnabled: true, shareInviteEnabled: true },
  });
  const prefByUser = new Map(prefs.map((p) => [p.userId, p]));
  const allowed = unique.filter((id) => {
    const pref = prefByUser.get(id);
    if (!flag) return true;
    if (!pref) return true;
    return pref[flag];
  });
  if (allowed.length === 0) return;

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId: { in: allowed } },
    select: { endpoint: true, p256dh: true, auth: true },
  });
  await sendPushToSubscriptions(prisma, subscriptions, payload);
}

export async function notifyCartPartnerPush(
  prisma: PrismaClient,
  audienceUserIds: string[],
  actorId: string,
  payload: PushPayload,
): Promise<void> {
  await sendPushToUsers(
    prisma,
    audienceUserIds.filter((id) => id !== actorId),
    payload,
    'cartPartnerEnabled',
  );
}

export async function notifyShareInvitePush(
  prisma: PrismaClient,
  partnerId: string,
  payload: PushPayload,
): Promise<void> {
  await sendPushToUsers(prisma, [partnerId], payload, 'shareInviteEnabled');
}
