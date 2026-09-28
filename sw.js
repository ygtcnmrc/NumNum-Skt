const CACHE='numnum-skt-v1-8';
const DB_NAME='BarBossNotifications';
const DB_VERSION=2;
const STORE='items';
const HISTORY_CACHE='barboss-notification-history-v2';
const HISTORY_KEY='/__barboss_notification_history__';

self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(k=>k!==CACHE && k!==HISTORY_CACHE).map(k=>caches.delete(k)));
  await self.clients.claim();
})()));

function openNotificationDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(STORE)){
        const store=db.createObjectStore(STORE,{keyPath:'id'});
        store.createIndex('receivedAt','receivedAt',{unique:false});
      }
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error('Bildirim DB açılamadı'));
  });
}

async function readHistoryCache(){
  try{
    const cache=await caches.open(HISTORY_CACHE);
    const res=await cache.match(HISTORY_KEY);
    if(!res)return [];
    const data=await res.json();
    return Array.isArray(data)?data:[];
  }catch(_){return []}
}

async function writeHistoryCache(item){
  try{
    const cache=await caches.open(HISTORY_CACHE);
    const existing=await readHistoryCache();
    const map=new Map(existing.map(x=>[String(x.id),x]));
    map.set(String(item.id),item);
    const list=[...map.values()].sort((a,b)=>(Number(b.receivedAt)||0)-(Number(a.receivedAt)||0)).slice(0,100);
    await cache.put(HISTORY_KEY,new Response(JSON.stringify(list),{headers:{'content-type':'application/json'}}));
  }catch(_){ }
}

async function saveNotification(data){
  const item={
    id:(self.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`),
    title:data.title||'NN BarBoss',
    body:data.body||'',
    receivedAt:Number(data.receivedAt)||Date.now()
  };
  let savedDb=false;
  try{
    const db=await openNotificationDB();
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readwrite');
      tx.objectStore(STORE).put(item);
      tx.oncomplete=resolve;
      tx.onerror=()=>reject(tx.error||new Error('Bildirim DB yazma hatası'));
      tx.onabort=()=>reject(tx.error||new Error('Bildirim DB işlemi iptal edildi'));
    });
    db.close();
    savedDb=true;
  }catch(_){ }
  await writeHistoryCache(item);
  return {item,savedDb};
}

self.addEventListener('push',event=>{
  let data={};
  try{data=event.data?event.data.json():{};}catch(_){try{data={body:event.data?event.data.text():''};}catch(__){}}
  const title=data.title||'NN BarBoss';
  const body=data.body||'';
  const receivedAt=Date.now();
  event.waitUntil((async()=>{
    const result=await saveNotification({title,body,receivedAt});
    await self.registration.showNotification(title,{
      body,
      icon:data.icon||'./icon-192.png',
      badge:data.badge||'./icon-192.png',
      data:{url:'./?open=notifications'},
      vibrate:[100,50,100],
      tag:data.tag||`barboss-${Date.now()}`,
      renotify:true
    });
    const cs=await clients.matchAll({type:'window',includeUncontrolled:true});
    cs.forEach(c=>{try{c.postMessage({type:'BARBOSS_NOTIFICATION_SAVED',notification:result.item,saved:result.savedDb});}catch(_){} });
  })());
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const target=event.notification?.data?.url||'./?open=notifications';
    const all=await clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of all){
      try{
        if('navigate' in client)await client.navigate(target);
        await client.focus();
        return;
      }catch(_){}
    }
    if(clients.openWindow)await clients.openWindow(target);
  })());
});

// Cache only static GET requests. Do not rewrite the HTML page; the live HTML
// already contains the notification-history UI and IndexedDB/cache fallback.
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==location.origin)return;
  const isPage=event.request.mode==='navigate'||url.pathname.endsWith('.html')||url.pathname==='/'||url.pathname.endsWith('/');
  if(isPage)return;
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{
    const copy=response.clone();caches.open(CACHE).then(c=>c.put(event.request,copy));return response;
  })));
});
