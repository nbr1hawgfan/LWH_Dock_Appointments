/* LWH Dock Appointments service worker: app-shell cache + push notifications. */
const CACHE = 'lwh-appt-v1.3.1';
const SHELL = ['./', 'index.html', 'assets/css/theme.css?v=1.3.1', 'assets/css/app.css?v=1.3.1', 'assets/js/app.js?v=1.3.1',
  'assets/img/logo.png', 'assets/img/entrance.jpg?v=3', 'assets/icons/appt-192.png', 'assets/icons/appt-favicon.png', 'manifest.webmanifest',
  'assets/fonts/oswald-latin-500-normal.woff2', 'assets/fonts/oswald-latin-600-normal.woff2', 'assets/fonts/oswald-latin-700-normal.woff2',
  'assets/fonts/inter-latin-400-normal.woff2', 'assets/fonts/inter-latin-600-normal.woff2', 'assets/fonts/inter-latin-700-normal.woff2'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // never cache API calls
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(CACHE).then((x) => x.put('index.html', c)); return r; }).catch(() => caches.match('index.html')));
    return;
  }
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => {
    if (r.ok) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); }
    return r;
  })));
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (er) { d = { title: 'Dock appointment', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Dock appointment', {
    body: d.body || '', tag: d.tag || undefined, renotify: !!d.tag,
    icon: 'assets/icons/appt-192.png', badge: 'assets/icons/appt-192.png',
    data: { path: d.path || './' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data && e.notification.data.path || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ws) => {
    for (const w of ws) { if (w.url.startsWith(self.registration.scope)) { w.focus(); return w.navigate(url); } }
    return self.clients.openWindow(url);
  }));
});
