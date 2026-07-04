/* LSL push service worker */
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'LSL', body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'Lomita Shooters League';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icon-512.png',
    badge: '/icon-512.png',
    image: data.image || undefined,
    tag: data.tag || data.notification_id || String(Date.now()),
    renotify: true,
    requireInteraction: !!data.requireInteraction,
    vibrate: data.vibrate || [120, 60, 120],
    timestamp: Date.now(),
    data: { link: data.link || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) {
        try { await c.navigate(link); } catch { /* ignore cross-origin */ }
        return c.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(link);
  })());
});
