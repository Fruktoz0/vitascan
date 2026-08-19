const ICON = '/assets/app-icon-192.png';
/** Android status-bar: white silhouette on transparent (not the full-color app icon). */
const BADGE = '/assets/notification-badge.png';

const KIND_DEFAULTS = {
  meal: {
    tag: 'vitascan-meal',
    actions: [{ action: 'open', title: 'Naplózás' }],
  },
  water: {
    tag: 'vitascan-water',
    actions: [{ action: 'open', title: 'Víz napló' }],
  },
  daily: {
    tag: 'vitascan-daily',
    actions: [{ action: 'open', title: 'Megnyitás' }],
  },
  cart: {
    tag: 'vitascan-cart',
    actions: [{ action: 'open', title: 'Kosár' }],
  },
  share: {
    tag: 'vitascan-share',
    actions: [{ action: 'open', title: 'Meghívó' }],
  },
};

function assetUrl(path) {
  try {
    return new URL(path, self.location.origin).href;
  } catch {
    return path;
  }
}

self.addEventListener('push', (event) => {
  let data = { title: 'VitaScan', body: '', url: '/home' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    try {
      const text = event.data && event.data.text();
      if (text) data.body = text;
    } catch {
      /* ignore */
    }
  }

  const kind = data.kind && KIND_DEFAULTS[data.kind] ? data.kind : null;
  const kindOpts = kind ? KIND_DEFAULTS[kind] : { tag: 'vitascan', actions: [{ action: 'open', title: 'Megnyitás' }] };
  const title = data.title || 'VitaScan';
  const url = data.url || '/home';

  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: assetUrl(ICON),
      badge: assetUrl(BADGE),
      lang: 'hu',
      dir: 'ltr',
      tag: data.tag || kindOpts.tag,
      renotify: true,
      timestamp: Date.now(),
      vibrate: [80, 40, 80],
      actions: kindOpts.actions,
      data: { url, kind },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const raw = (event.notification.data && event.notification.data.url) || '/home';
  const url = new URL(raw, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clientList) {
        if (!('focus' in client)) continue;
        if (typeof client.navigate === 'function') {
          const next = await client.navigate(url);
          if (next && 'focus' in next) return next.focus();
        }
        return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
      return undefined;
    })(),
  );
});
