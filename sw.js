const CACHE='numnum-skt-v3-0';

const APP_URL = new URL('./BarBoss_V19_SKTRenkli.html', self.location.origin).href;

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE && key !== NOTIFICATION_CACHE).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Gerçek Web Push bildirimi + kalıcı Gelen Bildirimler kaydı.
// Bildirim uygulama kapalıyken de IndexedDB'ye kaydedilir.
const NOTIFICATION_DB_NAME='BarBossNotifications';
const NOTIFICATION_DB_VERSION=3;
const NOTIFICATION_STORE='items';
const NOTIFICATION_CACHE='barboss-notification-history-v2';
const NOTIFICATION_CACHE_KEY='/__barboss_notification_history__';
function openNotificationDB(){
  return new Promise((resolve,reject)=>{
    if(!('indexedDB' in self)){reject(new Error('IndexedDB yok'));return;}
    const req=indexedDB.open(NOTIFICATION_DB_NAME,NOTIFICATION_DB_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      let store;
      if(!db.objectStoreNames.contains(NOTIFICATION_STORE)) store=db.createObjectStore(NOTIFICATION_STORE,{keyPath:'id'});
      else store=req.transaction.objectStore(NOTIFICATION_STORE);
      if(store && !store.indexNames.contains('receivedAt')){try{store.createIndex('receivedAt','receivedAt',{unique:false});}catch(_){}}
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error('Bildirim DB açılamadı'));
    req.onblocked=()=>reject(new Error('Bildirim DB güncellemesi engellendi'));
  });
}
async function readHistoryCache(){
  try{
    const cache=await caches.open(NOTIFICATION_CACHE);
    const res=await cache.match(NOTIFICATION_CACHE_KEY);
    if(!res)return [];
    const data=await res.json();
    return Array.isArray(data)?data:[];
  }catch(_){return []}
}
async function writeHistoryCache(item){
  try{
    const cache=await caches.open(NOTIFICATION_CACHE);
    const existing=await readHistoryCache();
    const map=new Map(existing.map(x=>[String(x.id),x]));
    map.set(String(item.id),item);
    const list=[...map.values()].sort((a,b)=>(Number(b.receivedAt)||0)-(Number(a.receivedAt)||0)).slice(0,100);
    await cache.put(NOTIFICATION_CACHE_KEY,new Response(JSON.stringify(list),{headers:{'content-type':'application/json'}}));
  }catch(_){ }
}
async function saveReceivedNotification(item){
  let savedDb=false;
  try{
    const db=await openNotificationDB();
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(NOTIFICATION_STORE,'readwrite');
      tx.objectStore(NOTIFICATION_STORE).put(item);
      tx.oncomplete=resolve;
      tx.onerror=()=>reject(tx.error||new Error('Bildirim DB yazma hatası'));
      tx.onabort=()=>reject(tx.error||new Error('Bildirim DB işlemi iptal edildi'));
    });
    db.close();
    savedDb=true;
  }catch(e){ try{console.warn('Bildirim DB kaydı başarısız:',e); }catch(_){} }
  await writeHistoryCache(item);
  return savedDb;
}

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {
    try { data = { body: event.data ? event.data.text() : '' }; } catch (_) {}
  }

  const title = data.title || 'NN BarBoss';
  const body = data.body || '';
  const receivedAt = Date.now();
  const id = data.id || `${receivedAt}-${Math.random().toString(36).slice(2,10)}`;
  const options = {
    body,
    icon: data.icon || './icon-192.png',
    badge: data.badge || './icon-192.png',
    data: data.data || { url: APP_URL },
    vibrate: [100, 50, 100],
    tag: data.tag || `barboss-notification-${id}`,
    renotify: true
  };

  const item={
    id,
    title,
    body,
    receivedAt,
    data:data.data||null
  };

  event.waitUntil((async()=>{
    // Önce kalıcı kaydı yap; böylece uygulama kapalıyken gelen bildirim de
    // uygulama tekrar açıldığında Gelen Bildirimler bölümünde görünür.
    try{ await saveReceivedNotification(item); }catch(e){ console.warn('Bildirim geçmişi kaydedilemedi:',e); }

    await self.registration.showNotification(title, options);

    // Uygulama açıksa ekranı anında yenile.
    try{
      const allClients=await clients.matchAll({type:'window',includeUncontrolled:true});
      for(const client of allClients){
        try{ client.postMessage({type:'BARBOSS_NOTIFICATION_SAVED',notification:item}); }catch(_){}
      }
    }catch(_){}
  })());
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
