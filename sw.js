/* SLine Service Worker */
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => { try { await self.clients.claim(); } catch (err) {} })());
});

function notifOpts(o) {
  o = o || {};
  const opts = {
    body: o.body || '',
    tag: o.tag || ('sl-' + Date.now()),
    renotify: true,
    silent: false,
    // Android/Xiaomi: keep visible in shade until user taps
    requireInteraction: o.requireInteraction !== false,
    data: o.data || { url: './' }
  };
  if (o.icon && /^https?:\/\//i.test(o.icon)) opts.icon = o.icon;
  if (o.badge && /^https?:\/\//i.test(o.badge)) opts.badge = o.badge;
  if (Array.isArray(o.vibrate)) opts.vibrate = o.vibrate;
  else opts.vibrate = [300, 100, 300, 100, 300];
  // Action button helps some OEMs surface the notification
  try {
    opts.actions = [{ action: 'open', title: 'Открыть' }];
  } catch (e) {}
  return opts;
}

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const data = e.notification.data || {};
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
  let data = { title: 'SLine', body: 'Новое уведомление', urgent: false, tag: 'sl-push', url: './' };
  try {
    if (e.data) data = Object.assign(data, e.data.json());
  } catch (err) {
    try { data.body = e.data.text(); } catch (e2) {}
  }
  e.waitUntil(
    self.registration.showNotification(data.title || 'SLine', notifOpts({
      body: data.body || '',
      tag: data.tag || 'sl-push',
      requireInteraction: true,
      vibrate: data.urgent ? [400, 150, 400, 150, 400] : [300, 100, 300],
      icon: data.icon,
      badge: data.badge,
      data: { url: data.url || './', mid: data.mid }
    }))
  );
});

self.addEventListener('message', (e) => {
  const msg = e.data || {};
  if (msg.type === 'sl-show-notification') {
    const o = msg.options || {};
    e.waitUntil(
      self.registration.showNotification(msg.title || 'SLine', notifOpts(o))
        .then(() => { if (e.ports && e.ports[0]) e.ports[0].postMessage({ ok: true }); })
        .catch((err) => { if (e.ports && e.ports[0]) e.ports[0].postMessage({ ok: false, error: String(err) }); })
    );
  }
  if (msg.type === 'sl-ping') {
    if (e.ports && e.ports[0]) e.ports[0].postMessage({ ok: true, sw: true });
  }
});
