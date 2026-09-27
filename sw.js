const CACHE='numnum-skt-v1-3';

const APP_URL = new URL('./BarBoss_V19_SKTRenkli.html', self.location.origin).href;

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Gerçek Web Push bildirimi.
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {
    try { data = { body: event.data ? event.data.text() : '' }; } catch (_) {}
  }

  const title = data.title || 'NN BarBoss';
  const options = {
    body: data.body || '',
    icon: data.icon || './icon-192.png',
    badge: data.badge || './icon-192.png',
    // URL gönderilmezse doğrudan BarBoss ana sayfasını aç.
    data: data.data || { url: APP_URL },
    vibrate: [100, 50, 100],
    tag: data.tag || 'barboss-notification',
    renotify: true
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  event.waitUntil((async () => {
    let target = event.notification?.data?.url;

    // Eski bildirimlerde './' veya '/' gönderilmiş olabilir.
    // Bunları GitHub Pages köküne değil, gerçek BarBoss HTML'sine yönlendir.
    try {
      if (!target || target === './' || target === '/' ||
          target === self.location.origin || target === self.location.origin + '/') {
        target = APP_URL;
      } else {
        const resolved = new URL(target, self.location.origin);
        if (resolved.origin === self.location.origin &&
            (resolved.pathname === '/' || resolved.pathname === '')) {
          target = APP_URL;
        } else {
          target = resolved.href;
        }
      }
    } catch (_) {
      target = APP_URL;
    }

    const allClients = await clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });

    for (const client of allClients) {
      try {
        await client.focus();
        if ('navigate' in client) await client.navigate(target);
        return;
      } catch (_) {}
    }

    if (clients.openWindow) await clients.openWindow(target);
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  const isPage =
    event.request.mode === 'navigate' ||
    url.pathname.endsWith('.html') ||
    url.pathname === '/' ||
    url.pathname.endsWith('/');

  if (isPage) {
    event.respondWith(
      fetch(event.request, {cache:'no-store'})
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy));
          return response;
        })
        .catch(() =>
          caches.match(event.request)
            .then(cached => cached || caches.match('./BarBoss_V19_SKTRenkli.html'))
        )
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached =>
      cached || fetch(event.request).then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
        return response;
      })
    )
  );
});
