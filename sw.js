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

// Push от ntfy.sh
self.addEventListener('push', e => {
  let title = 'Tovsa';
  let body  = 'Новое сообщение';
  try {
    if (e.data) {
      const d = e.data.json();
      title = d.title || d.topic || title;
      body  = d.message || d.body || body;
    }
  } catch (_) {
    try { body = e.data.text() || body; } catch (_) {}
  }
  e.waitUntil(
    self.registration.showNotification(title, {
      body, tag: 'tovsa-msg', renotify: true, vibrate: [200, 100, 200]
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      const existing = cs.find(c => c.url.includes(self.location.origin));
      if (existing) return existing.focus();
      return clients.openWindow('./');
    })
  );
});
