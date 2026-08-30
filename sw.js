/* SLine PWA Service Worker — background notifications + offline shell */
const CACHE = 'sline-pwa-v3';
const PRECACHE = [];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => {
      if (PRECACHE.length) return cache.addAll(PRECACHE);
    }).catch(function(){})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k === CACHE ? null : caches.delete(k))));
      await self.clients.claim();
    })()
  );
});

/* Network-first for navigations; cache fallback */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(function(){});
        return res;
      }).catch(() => caches.match(req).then((r) => r || caches.match('./') || caches.match('/')))
    );
    return;
  }
});

function parsePushData(event) {
  let data = { title: 'SLine', body: '', tag: 'sline', url: './', icon: null, badge: null };
  try {
    if (event.data) {
      const json = event.data.json();
      if (json) {
        data.title = json.title || json.notification?.title || data.title;
        data.body = json.body || json.notification?.body || json.message || '';
        data.tag = json.tag || json.notification?.tag || data.tag;
        data.url = json.url || json.link || json.click_action || './';
        data.icon = json.icon || json.notification?.icon || null;
        data.badge = json.badge || null;
        data.data = json.data || json;
      }
    }
  } catch (e) {
    try {
      const t = event.data && event.data.text();
      if (t) data.body = t;
    } catch (e2) {}
  }
  return data;
}

/* Web Push — works when PWA is minimized / browser in background */
self.addEventListener('push', (event) => {
  const data = parsePushData(event);
  const title = String(data.title || 'SLine').slice(0, 120);
  const options = {
    body: String(data.body || '').slice(0, 400),
    tag: data.tag || 'sline',
    renotify: true,
    requireInteraction: false,
    silent: false,
    data: {
      url: data.url || './',
      ...(data.data || {})
    },
    icon: data.icon || undefined,
    badge: data.badge || undefined,
    vibrate: [80, 40, 80]
  };
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    (async () => {
      const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of all) {
        try {
          if ('focus' in client) {
            await client.focus();
            if (client.navigate) {
              try { await client.navigate(target); } catch (e) {}
            }
            try {
              client.postMessage({ type: 'SL_NOTIFICATION_CLICK', url: target, data: event.notification.data });
            } catch (e) {}
            return;
          }
        } catch (e) {}
      }
      if (clients.openWindow) {
        await clients.openWindow(target);
      }
    })()
  );
});

self.addEventListener('notificationclose', () => {});

/* Messages from page: show local notification when tab is backgrounded */
self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg.type === 'SL_SHOW_NOTIFICATION') {
    const title = String(msg.title || 'SLine').slice(0, 120);
    const options = {
      body: String(msg.body || '').slice(0, 400),
      tag: msg.tag || 'sline-local',
      renotify: true,
      data: { url: msg.url || './', ...(msg.data || {}) },
      vibrate: [60, 30, 60]
    };
    event.waitUntil(self.registration.showNotification(title, options));
  }
  if (msg.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
