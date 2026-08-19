import { notificationsApi } from './api';

export type PushSubscribeResult = 'ok' | 'denied' | 'unsupported' | 'no-permission' | 'missing-key';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
}

export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

export function pushUnsupported(): boolean {
  return (
    typeof window === 'undefined' ||
    !('Notification' in window) ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window)
  );
}

async function resolveVapidKey(explicit?: string | null): Promise<string | null> {
  if (explicit) return explicit;
  const fromEnv = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)?.trim();
  if (fromEnv) return fromEnv;
  try {
    const { publicKey } = await notificationsApi.vapidPublic();
    return publicKey || null;
  } catch {
    try {
      const prefs = await notificationsApi.getPrefs();
      return prefs.vapidPublicKey || null;
    } catch {
      return null;
    }
  }
}

export async function ensurePushSubscription(vapidPublicKey?: string | null): Promise<PushSubscribeResult> {
  if (pushUnsupported()) return 'unsupported';
  if (Notification.permission !== 'granted') return 'no-permission';

  const key = await resolveVapidKey(vapidPublicKey);
  if (!key) return 'missing-key';

  const registration = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => {
      window.setTimeout(() => resolve(null), 5000);
    }),
  ]);
  if (!registration) return 'unsupported';
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
    });
  }

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return 'unsupported';
  await notificationsApi.subscribe({
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    userAgent: navigator.userAgent,
  });
  return 'ok';
}

export async function requestAndSubscribe(vapidPublicKey?: string | null): Promise<PushSubscribeResult> {
  if (pushUnsupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'no-permission';
  }
  return ensurePushSubscription(vapidPublicKey);
}
