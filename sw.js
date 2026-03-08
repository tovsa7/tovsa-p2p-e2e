const C = 'tovsa-v8';
const ICON_URL = './icon-192.png';
const DB_NAME  = 'fpv_drun_v1';
const DB_VER   = 2;

const PRECACHE = [
  './',
  './manifest.json',
  './icon-192.png',
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(C).then(c => c.addAll(PRECACHE)).catch(() => {})
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
  if (url.origin !== self.location.origin) return;

  const isPrecached = PRECACHE.some(p => {
    const u = new URL(p, self.location.origin);
    return u.pathname === url.pathname;
  });

  if (isPrecached) {
    // Stale-while-revalidate: отдаём кэш мгновенно, фоном обновляем
    e.respondWith(
      caches.open(C).then(async cache => {
        const cached = await cache.match(e.request);
        const fetchPromise = fetch(e.request).then(res => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        }).catch(() => null);
        return cached || fetchPromise;
      })
    );
  } else {
    // Остальные ресурсы — сеть с fallback в кэш
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
  }
});

// ── Push ───────────────────────────────────────────────────────────────────────
self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let title = 'Tovsa', body = 'Новое сообщение', tag = 'tovsa-msg', isConn = false;

    try {
      if (e.data) {
        const raw = e.data.arrayBuffer ? await e.data.arrayBuffer() : null;

        // Пробуем расшифровать если есть зашифрованный payload
        if (raw && raw.byteLength > 0) {
          const decrypted = await _decryptPushPayload(raw).catch(() => null);
          if (decrypted) {
            try {
              const d = JSON.parse(decrypted);
              title = d.title || title;
              body  = d.body  || body;
            } catch(_) { body = decrypted; }
          } else {
            // Fallback: попробуем как обычный JSON
            try {
              const d = e.data.json();
              title = d.title || title;
              body  = d.body  || body;
            } catch(_) {
              try { body = e.data.text() || body; } catch(_) {}
            }
          }
        }

        if (title.startsWith('📡')) { tag = 'tovsa-conn'; isConn = true; }
      }
    } catch (_) {}

    const actions = isConn
      ? [{ action: 'accept', title: '✓ Принять' }]
      : [{ action: 'open',   title: 'Открыть'   }];

    await self.registration.showNotification(title, {
      body, icon: ICON_URL, badge: ICON_URL, tag, renotify: true,
      vibrate: [200, 100, 200], actions,
      data: { action: isConn ? 'accept-call' : 'open-chat' }
    });
  })());
});

// ── Notification click ─────────────────────────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const isAccept   = e.action === 'accept' || e.notification.tag === 'tovsa-conn';
  const isOpenChat = e.notification.data?.action === 'open-chat';

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      const existing = cs.find(c => c.url.includes(self.location.origin));
      if (existing) {
        existing.focus();
        if (isAccept)   existing.postMessage({ action: 'accept-call' });
        if (isOpenChat) existing.postMessage({ action: 'open-chat' });
        return;
      }
      const url = isAccept ? './?action=accept-call' : isOpenChat ? './?action=open-chat' : './';
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

// ── Расшифровка push payload ───────────────────────────────────────────────────
// Формат: ephPubKey(65 bytes) | iv(12 bytes) | ciphertext
// Шифрование: ECDH P-256 + AES-GCM 256
async function _decryptPushPayload(arrayBuf) {
  const privJwk = await _idbGet('keys', 'push_priv_jwk');
  if (!privJwk) return null;

  const privKey = await crypto.subtle.importKey(
    'jwk', privJwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false, ['deriveBits', 'deriveKey']
  );

  const buf = new Uint8Array(arrayBuf);
  if (buf.length < 65 + 12 + 1) return null;

  const ephemeralPubBytes = buf.slice(0, 65);
  const iv                = buf.slice(65, 77);
  const ciphertext        = buf.slice(77);

  const ephemeralPub = await crypto.subtle.importKey(
    'raw', ephemeralPubBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    false, []
  );

  const sharedKey = await crypto.subtle.deriveKey(
    { name: 'ECDH', public: ephemeralPub },
    privKey,
    { name: 'AES-GCM', length: 256 },
    false, ['decrypt']
  );

  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv }, sharedKey, ciphertext
  );

  return new TextDecoder().decode(plain);
}

// ── IndexedDB helpers (для SW) ─────────────────────────────────────────────────
function _swOpenDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      ['contacts','history','fav','files','keys'].forEach(s => {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
      });
    };
    req.onsuccess = e => res(e.target.result);
    req.onerror   = () => rej(req.error);
  });
}

async function _idbGet(store, key) {
  const db = await _swOpenDB();
  return new Promise((res, rej) => {
    const tx  = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => res(req.result ?? null);
    req.onerror   = () => rej(req.error);
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
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
