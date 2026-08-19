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
  const title = data.title || 'VitaScan';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/assets/app-icon-192.png',
      badge: '/assets/app-icon-192.png',
      data: { url: data.url || '/home' },
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
