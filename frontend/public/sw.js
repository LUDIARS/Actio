/**
 * Actio Service Worker — PWA + WebPush 専用 (キャッシュは積まない)。
 *
 * Nuntius の `web-push` lib が送る payload は JSON:
 *   { title, body, url?, icon?, tag?, data? }
 *
 * iOS Safari は PWA install (homescreen 追加) 後でないと PushManager.subscribe
 * が動かない仕様 (16.4+)。
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Actio', body: event.data.text() };
  }
  const title = payload.title || 'Actio';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/favicon.svg',
    badge: '/favicon.svg',
    tag: payload.tag || 'actio',
    data: { url: payload.url || '/' },
    requireInteraction: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification?.data?.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url && new URL(w.url).origin === self.location.origin) {
          return w.focus().then(() => {
            try { w.navigate(targetUrl); } catch { /* old browsers */ }
          });
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
