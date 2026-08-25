/* SLine Service Worker — closed PWA notifications + shell cache */
const CACHE = 'sline-shell-v3';
const SHELL = ['./', './index.html', './sw.js'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})).catch(() => {})
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    } catch (err) {}
    try { await self.clients.claim(); } catch (err) {}
  })());
});

function notifOpts(o) {
  o = o || {};
  const opts = {
    body: o.body || '',
    tag: o.tag || ('sl-' + Date.now()),
    renotify: true,
    silent: false,
    requireInteraction: o.requireInteraction !== false,
    data: o.data || { url: './' }
  };
  if (o.icon && /^https?:\/\//i.test(o.icon)) opts.icon = o.icon;
  if (o.badge && /^https?:\/\//i.test(o.badge)) opts.badge = o.badge;
  if (Array.isArray(o.vibrate)) opts.vibrate = o.vibrate;
  else opts.vibrate = [300, 100, 300, 100, 300];
  try {
    opts.actions = [{ action: 'open', title: 'Открыть' }];
  } catch (e) {}
  return opts;
}

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const data = (e.notification && e.notification.data) || {};
  const url = data.url || './';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        try {
          if ('focus' in c) {
            try { c.postMessage({ type: 'sl-notification-click', data }); } catch (err) {}
            return c.focus();
          }
        } catch (err) {}
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

self.addEventListener('push', (e) => {
  let data = { title: 'SLine', body: 'Новое сообщение', urgent: false, tag: 'sl-push', url: './' };
  try {
    if (e.data) data = Object.assign(data, e.data.json());
  } catch (err) {
    try { data.body = e.data.text(); } catch (e2) {}
  }
  // Never show ciphertext in notification body
  if (typeof data.body === 'string' && /^e2e:(v1|sig):/i.test(data.body.trim())) {
    data.body = '🔒 Зашифрованное сообщение';
  }
  e.waitUntil(
    self.registration.showNotification(data.title || 'SLine', notifOpts({
      body: data.body || '',
      tag: data.tag || 'sl-push',
      requireInteraction: true,
      vibrate: data.urgent ? [400, 150, 400, 150, 400] : [300, 100, 300],
      icon: data.icon,
      badge: data.badge,
      data: { url: data.url || './', mid: data.mid, peerId: data.peerId }
    }))
  );
});

self.addEventListener('message', (e) => {
  const msg = e.data || {};
  if (msg.type === 'sl-show-notification') {
    const o = msg.options || {};
    let body = o.body || '';
    if (typeof body === 'string' && /^e2e:(v1|sig):/i.test(body.trim())) {
      body = '🔒 Зашифрованное сообщение';
    }
    e.waitUntil(
      self.registration.showNotification(msg.title || 'SLine', notifOpts({
        body: body,
        tag: o.tag || 'sl-local',
        requireInteraction: o.requireInteraction !== false,
        data: o.data || { url: './' },
        icon: o.icon,
        badge: o.badge,
        vibrate: o.vibrate
      }))
        .then(() => { if (e.ports && e.ports[0]) e.ports[0].postMessage({ ok: true }); })
        .catch((err) => { if (e.ports && e.ports[0]) e.ports[0].postMessage({ ok: false, error: String(err) }); })
    );
  }
  if (msg.type === 'sl-ping') {
    if (e.ports && e.ports[0]) e.ports[0].postMessage({ ok: true, sw: true });
  }
  if (msg.type === 'sl-skip-waiting') {
    self.skipWaiting();
  }
});

// Network-first for HTML; cache-first for same-origin static
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname.endsWith('/')) {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  if (/\.(js|css|png|jpg|jpeg|svg|webp|woff2?)$/i.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }))
    );
  }
});
