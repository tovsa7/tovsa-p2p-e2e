const C = 'tovsa-v5';

// SVG иконка закодированная в base64 — используется в push уведомлениях
const ICON = 'data:image/svg+xml;base64,' + btoa(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">' +
  '<rect width="192" height="192" rx="48" fill="#0a0a0f"/>' +
  '<circle cx="96" cy="96" r="52" fill="none" stroke="#7c6aff" stroke-width="12"/>' +
  '<circle cx="96" cy="96" r="24" fill="#7c6aff"/>' +
  '<circle cx="96" cy="44" r="8" fill="#7c6aff"/>' +
  '<circle cx="148" cy="96" r="8" fill="#7c6aff"/>' +
  '<circle cx="96" cy="148" r="8" fill="#7c6aff"/>' +
  '<circle cx="44" cy="96" r="8" fill="#7c6aff"/>' +
  '</svg>'
);

self.addEventListener('install', e => {
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

  const url = new URL(e.request.url);

  // Внешние запросы (PeerJS, Cloudflare, FCM) — не кешируем
  if (url.origin !== self.location.origin) return;

  // Своё приложение — network-first (быстрые обновления)
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(C).then(c => c.put(e.request, clone));
        }
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
      body,
      icon:     ICON,
      badge:    ICON,
      tag:      'tovsa-msg',
      renotify: true,
      vibrate:  [200, 100, 200],
      actions:  [{ action: 'open', title: 'Открыть' }]
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

// ── Автообновление push-подписки если FCM её сменил ───────────────────────────
self.addEventListener('pushsubscriptionchange', e => {
  e.waitUntil(
    (async () => {
      try {
        // Получаем VAPID ключ с воркера
        const { publicKey } = await fetch('https://subs.tovsa7.workers.dev/push/vapid')
          .then(r => r.json());

        const sub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: b64urlToBytes(publicKey)
        });

        // Достаём fp из старого subscription или из данных
        const fp = e.oldSubscription
          ? await digestHex(e.oldSubscription.endpoint)
          : null;

        if (fp) {
          await fetch('https://subs.tovsa7.workers.dev/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fingerprint: fp, subscription: sub.toJSON() })
          });
        }
      } catch(err) {
        console.warn('[sw] pushsubscriptionchange error:', err);
      }
    })()
  );
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function b64urlToBytes(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function digestHex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('').slice(0, 24);
}
