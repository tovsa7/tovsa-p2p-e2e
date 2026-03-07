const C = 'tovsa-v1';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(C).then(c => c.addAll(['./'])).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== C).map(k => caches.delete(k)))
    ).then(() => clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(C).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => caches.match('./'));
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(cs => {
      if (cs.length) return cs[0].focus();
      return clients.openWindow('./');
    })
  );
});
