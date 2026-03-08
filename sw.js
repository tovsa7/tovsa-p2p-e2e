const C = 'tovsa-v6';

// Иконка рисуется через OffscreenCanvas — PNG, единый стиль с приложением
async function _buildIcon(){
  try{
    const c = new OffscreenCanvas(192, 192);
    const ctx = c.getContext('2d');
    const r = 48, s = 192;
    ctx.fillStyle = '#0a0a0f';
    ctx.beginPath();
    ctx.moveTo(r,0); ctx.lineTo(s-r,0); ctx.arcTo(s,0,s,r,r);
    ctx.lineTo(s,s-r); ctx.arcTo(s,s,s-r,s,r);
    ctx.lineTo(r,s); ctx.arcTo(0,s,0,s-r,r);
    ctx.lineTo(0,r); ctx.arcTo(0,0,r,0,r);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle='#00ff9d'; ctx.lineWidth=12;
    ctx.beginPath(); ctx.arc(96,96,52,0,Math.PI*2); ctx.stroke();
    ctx.fillStyle='#00ff9d';
    ctx.beginPath(); ctx.arc(96,96,22,0,Math.PI*2); ctx.fill();
    [[96,36],[156,96],[96,156],[36,96]].forEach(([x,y])=>{
      ctx.beginPath(); ctx.arc(x,y,8,0,Math.PI*2); ctx.fill();
    });
    const blob = await c.convertToBlob({type:'image/png'});
    return URL.createObjectURL(blob);
  }catch(_){ return undefined; }
}

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
  if (url.origin !== self.location.origin) return;
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
    _buildIcon().then(icon =>
      self.registration.showNotification(title, {
        body,
        icon,
        badge:    icon,
        tag:      'tovsa-msg',
        renotify: true,
        vibrate:  [200, 100, 200],
        actions:  [{ action: 'open', title: 'Открыть' }]
      })
    )
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
  e.waitUntil((async () => {
    try {
      const { publicKey } = await fetch('https://subs.tovsa7.workers.dev/push/vapid').then(r => r.json());
      const sub = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64urlToBytes(publicKey)
      });
      const fp = e.oldSubscription ? await digestHex(e.oldSubscription.endpoint) : null;
      if (fp) {
        await fetch('https://subs.tovsa7.workers.dev/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fingerprint: fp, subscription: sub.toJSON() })
        });
      }
    } catch(err) { console.warn('[sw] pushsubscriptionchange error:', err); }
  })());
});

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
