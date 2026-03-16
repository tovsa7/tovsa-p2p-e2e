const C        = 'tovsa-v9';
const C_FONTS  = 'tovsa-fonts-v1';
const ICON_URL = './icon-192.png';
const DB_NAME  = 'tovsa_v1';
const DB_VER   = 4; // v4 adds 'voice' store

const PRECACHE = [
  './',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
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
      .then(keys => Promise.all(
        keys.filter(k => k !== C && k !== C_FONTS).map(k => caches.delete(k))
      ))
      .then(() => clients.claim())
      .then(() => clients.matchAll({ type: 'window' }))
      .then(cs => cs.forEach(c => c.postMessage({ action: 'sw-updated' })))
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // ── Google Fonts — cache-first ──────────────────────────────────────────────
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(C_FONTS).then(async cache => {
        const cached = await cache.match(e.request);
        if (cached) return cached;
        const res = await fetch(e.request);
        if (res.ok) cache.put(e.request, res.clone());
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

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
    let title = 'Tovsa', body = 'Новое сообщение', tag = 'tovsa-msg';
    let isConn = false, isContactReq = false;

    try {
      if (e.data) {
        // RFC 8291 расшифровывается браузером автоматически — e.data уже plaintext JSON
        try {
          const d = e.data.json();
          title = d.title || title;
          body  = d.body  || body;
          // contact-request: Worker шлёт только сигнал { action: 'contact-request' },
          // данные о заявителе не передаются (принцип приватности).
          // Реальные данные приходят через SEALED_RELAY после открытия приложения.
          if (d.data?.action === 'contact-request') {
            isContactReq = true;
            tag = 'tovsa-contact-req';
          }
        } catch(_) {
          try { body = e.data.text() || body; } catch(_) {}
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
      data: {
        action: isConn ? 'accept-call' : isContactReq ? 'contact-request' : 'open-chat',
      }
    });
  })());
});

// ── Notification click ─────────────────────────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const data       = e.notification.data || {};
  const isAccept   = e.action === 'accept' || data.action === 'accept-call';
  const isOpenChat = data.action === 'open-chat';
  // contact-request: открываем приложение без параметров.
  // Данные о заявителе придут через SEALED_RELAY после подключения к signaling.
  const isContactReq = data.action === 'contact-request';

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      const existing = cs.find(c => c.url.includes(self.location.origin));

      if (existing) {
        existing.focus();
        if (isAccept)     existing.postMessage({ action: 'accept-call' });
        if (isOpenChat)   existing.postMessage({ action: 'open-chat' });
        if (isContactReq) existing.postMessage({ action: 'contact-request' });
        return;
      }

      // Холодный старт — открываем приложение чистым URL.
      // SEALED_RELAY из signaling-буфера доставит данные после инициализации.
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
      // Вычисляем fingerprint из публичного Ed25519 ключа (как в основном приложении)
      // а не из endpoint подписки — они должны совпадать с ключом в KV
      const pubRaw = await _idbGet('keys', 'id_pub_raw');
      if (!pubRaw) return; // нет ключа — нечего обновлять
      const pubBytes = new Uint8Array(pubRaw);
      const hash = await crypto.subtle.digest('SHA-256', pubBytes);
      const fp = Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2,'0')).join('').slice(0, 24);
      // Подписываем запрос если есть приватный ключ (воркер принимает и без подписи)
      let authFields = {};
      try {
        const privJwk = await _idbGet('keys', 'id_priv_jwk');
        if (privJwk) {
          const privKey = await crypto.subtle.importKey('jwk', privJwk, { name: 'Ed25519' }, false, ['sign']);
          const ts = Math.floor(Date.now() / 1000);
          const msg = new TextEncoder().encode(`subscribe:${fp}:${ts}`);
          const sigBuf = await crypto.subtle.sign('Ed25519', privKey, msg);
          const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
            .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
          const pubRawArr = await _idbGet('keys', 'id_pub_raw');
          const pubKeyHex = Array.from(new Uint8Array(pubRawArr))
            .map(b => b.toString(16).padStart(2,'0')).join('');
          authFields = { sig, pubKeyHex, ts };
        }
      } catch(_) {}
      await fetch('https://subs.tovsa7.workers.dev/push/subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint: fp, subscription: sub.toJSON(), ...authFields })
      });
    } catch(err) { console.warn('[sw] pushsubscriptionchange:', err); }
  })());
});


// ── IndexedDB helpers (для SW) ─────────────────────────────────────────────────
function _swOpenDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      ['contacts','history','fav','files','voice','keys','meta','rooms','channels'].forEach(s => {
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


