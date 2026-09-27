const CACHE='numnum-skt-v1-4';

// GitHub Pages repo yolu
const APP_URL = new URL('/NumNum-Skt/BarBoss_V19_SKTRenkli.html', self.location.origin).href;

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

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {
    try { data = { body: event.data ? event.data.text() : '' }; } catch (_) {}
  }

  const title = data.title || 'NN BarBoss';
  const incomingData = (data.data && typeof data.data === 'object') ? data.data : {};
  const incomingUrl = incomingData.url || data.url || APP_URL;

  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: data.icon || './icon-192.png',
      badge: data.badge || './icon-192.png',
      data: { url: incomingUrl },
      vibrate: [100, 50, 100],
      tag: data.tag || 'barboss-notification',
      renotify: true
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  event.waitUntil((async () => {
    let target = event.notification?.data?.url || APP_URL;

    try {
      const resolved = new URL(target, APP_URL);

      // Kök GitHub Pages adresi veya eski hatalı yollar gelirse
      // doğrudan gerçek BarBoss sayfasına git.
      if (
        resolved.origin === self.location.origin &&
        (
          resolved.pathname === '/' ||
          resolved.pathname === '' ||
          resolved.pathname === '/NumNum-Skt/' ||
          resolved.pathname === '/NumNum-Skt'
        )
      ) {
        target = APP_URL;
      } else if (resolved.origin === self.location.origin) {
        target = resolved.href;
      } else {
        target = APP_URL;
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
        if ('navigate' in client) await client.navigate(target);
        await client.focus();
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
      fetch(event.request, { cache: 'no-store' })
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(APP_URL))
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
