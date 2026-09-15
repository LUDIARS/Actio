/**
 * Actio Service Worker — PWA install 専用 (キャッシュは積まない)。
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
