const C = 'tovsa-v7';

// Иконка — реальный PNG файл рядом с приложением
const ICON_URL = './icon-192.png';

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(C).then(c => c.addAll(['./'])).catch(() => {}));
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
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) { const clone = res.clone(); caches.open(C).then(c => c.put(e.request, clone)); }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// ── Push ───────────────────────────────────────────────────────────────────────
self.addEventListener('push', e => {
  let title = 'Tovsa', body = 'Новое сообщение', tag = 'tovsa-msg', isConn = false;
  try {
    if (e.data) {
      const d = e.data.json();
      title = d.title || title;
      body  = d.body  || body;
      // Определяем тип уведомления по заголовку
      if(title.startsWith('📡')) { tag = 'tovsa-conn'; isConn = true; }
    }
  } catch (_) {
    try { body = e.data.text() || body; } catch (_) {}
  }

  const actions = isConn
    ? [{ action: 'accept', title: '✓ Принять' }]
    : [{ action: 'open',   title: 'Открыть'   }];

  e.waitUntil(
    self.registration.showNotification(title, {
        body, icon: ICON_URL, badge: ICON_URL, tag, renotify: true,
        vibrate: [200, 100, 200], actions
      })
  );
});

// ── Notification click ─────────────────────────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();

  const isAccept = e.action === 'accept' || e.notification.tag === 'tovsa-conn';

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      const existing = cs.find(c => c.url.includes(self.location.origin));
      if (existing) {
        existing.focus();
        if(isAccept) existing.postMessage({ action: 'accept-call' });
        return;
      }
      // Открываем приложение и передаём action через URL параметр
      const url = isAccept ? './?action=accept-call' : './';
      return clients.openWindow(url);
    })
  );
});

// ── pushsubscriptionchange ─────────────────────────────────────────────────────
self.addEventListener('pushsubscriptionchange', e => {
  e.waitUntil((async () => {
    try {
      const { publicKey } = await fetch('https://subs.tovsa7.workers.dev/push/vapid').then(r => r.json());
      const sub = await self.registration.pushManager.subscribe({
        userVisibleOnly: true, applicationServerKey: b64urlToBytes(publicKey)
      });
      const fp = e.oldSubscription ? await digestHex(e.oldSubscription.endpoint) : null;
      if (fp) {
        await fetch('https://subs.tovsa7.workers.dev/push/subscribe', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fingerprint: fp, subscription: sub.toJSON() })
        });
      }
    } catch(err) { console.warn('[sw] pushsubscriptionchange:', err); }
  })());
});

function b64urlToBytes(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function digestHex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,24);
}
