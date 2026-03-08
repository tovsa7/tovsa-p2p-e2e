const C = 'tovsa-v3';

self.addEventListener('install', e => {
  // Немедленно активируемся, не ждём закрытия старых вкладок
  self.skipWaiting();
  e.waitUntil(
    caches.open(C).then(c => c.addAll(['./'])).catch(() => {})
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== C).map(k => caches.delete(k))))
      .then(() => clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  // Стратегия: сначала сеть, кеш только как fallback
  // Это значит что обновления подтягиваются сразу при наличии сети
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(C).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// ── Push уведомления ───────────────────────────────────────────────────────────
self.addEventListener('push', e => {
  let title = 'Tovsa';
  let body  = 'Новое сообщение';
  try {
    if (e.data) {
      const d = e.data.json();
      title = d.title || title;
      body  = d.body  || body;
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
