const CACHE='numnum-skt-v1-5';

// GitHub Pages repo yolu
const APP_URL = new URL('/NumNum-Skt/BarBoss_V19_SKTRenkli.html', self.location.origin).href;
const NOTIFICATION_URL = APP_URL + '?open=notifications';

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

  // Her BarBoss bildirimi uygulamadaki Bildirimler sekmesine gider.
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: data.icon || './icon-192.png',
      badge: data.badge || './icon-192.png',
      data: { url: NOTIFICATION_URL },
      vibrate: [100, 50, 100],
      tag: data.tag || 'barboss-notification',
      renotify: true
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  event.waitUntil((async () => {
    const target = NOTIFICATION_URL;

    const allClients = await clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });

    // Uygulama zaten açıksa aynı pencereyi kullan; yeni sekme açma.
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

  const isNotificationOpen = url.searchParams.get('open') === 'notifications';
  const isPage =
    event.request.mode === 'navigate' ||
    url.pathname.endsWith('.html') ||
    url.pathname === '/' ||
    url.pathname.endsWith('/');

  if (isPage) {
    event.respondWith((async () => {
      try {
        // Bildirim tıklamasında gerçek uygulama HTML'sini alıp,
        // Bildirimler sekmesini açan küçük bir kodu sayfaya ekliyoruz.
        const fetchUrl = isNotificationOpen ? APP_URL : event.request.url;
        const response = await fetch(fetchUrl, { cache: 'no-store' });

        if (isNotificationOpen && response.ok) {
          let html = await response.text();

          const injected = `
<script id="barboss-notification-open">
(function(){
  function openBarBossNotifications(){
    try{
      if(typeof show==='function' &&
         typeof currentProfile!=='undefined' &&
         currentProfile && currentProfile.id){
        show('settings');
        return true;
      }
      var btn=document.querySelector('nav button[data-page="settings"]');
      if(btn && typeof currentProfile!=='undefined' &&
         currentProfile && currentProfile.id){
        btn.click();
        return true;
      }
    }catch(e){}
    return false;
  }

  var tries=0;
  var timer=setInterval(function(){
    tries++;
    if(openBarBossNotifications() || tries>80) clearInterval(timer);
  },250);

  setTimeout(function(){
    try{clearInterval(timer)}catch(e){}
  },22000);
})();
</script>`;

          if (html.includes('</body>')) {
            html = html.replace('</body>', injected + '\n</body>');
          } else {
            html += injected;
          }

          const headers = new Headers(response.headers);
          headers.delete('content-encoding');
          headers.delete('content-length');
          headers.set('content-type', 'text/html; charset=utf-8');

          return new Response(html, {
            status: response.status,
            statusText: response.statusText,
            headers
          });
        }

        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
        return response;
      } catch (_) {
        return caches.match(APP_URL);
      }
    })());
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
