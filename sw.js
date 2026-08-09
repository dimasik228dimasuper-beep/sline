/* SLine Service Worker — notifications + offline shell */
const CACHE = 'sline-shell-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const data = e.notification.data || {};
  const url = data.url || './';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        try {
          if (c.url && 'focus' in c) {
            c.postMessage({ type: 'sl-notification-click', data });
            return c.focus();
          }
        } catch (err) {}
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

self.addEventListener('push', (e) => {
  let data = { title: 'SLine', body: 'Новое уведомление', urgent: false, tag: 'sl-push', url: './' };
  try {
    if (e.data) {
      const j = e.data.json();
      data = Object.assign(data, j);
    }
  } catch (err) {
    try { data.body = e.data.text(); } catch (e2) {}
  }
  const vibrate = data.urgent
    ? [400, 150, 400, 150, 400, 150, 400]
    : [200, 100, 200, 100, 200];
  e.waitUntil(
    self.registration.showNotification(data.title || 'SLine', {
      body: data.body || '',
      tag: data.tag || 'sl-push',
      renotify: true,
      vibrate,
      requireInteraction: !!data.urgent,
      silent: false,
      data: { url: data.url || './' }
    })
  );
});

self.addEventListener('message', (e) => {
  const msg = e.data || {};
  if (msg.type === 'sl-show-notification') {
    const o = msg.options || {};
    e.waitUntil(
      self.registration.showNotification(msg.title || 'SLine', {
        body: o.body || '',
        tag: o.tag || 'sl-local',
        renotify: true,
        vibrate: o.vibrate || [200, 100, 200],
        requireInteraction: !!o.requireInteraction,
        silent: false,
        icon: o.icon,
        badge: o.badge,
        data: o.data || { url: './' }
      })
    );
  }
});
