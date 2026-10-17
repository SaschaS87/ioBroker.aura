// Minimaler Service Worker – nur damit Chrome (Android) Aura als App installieren kann.
// Er cached NICHTS und greift in keine Anfrage ein: der fetch-Handler ruft bewusst
// kein respondWith() auf, der Browser lädt also genau wie ohne Service Worker.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
