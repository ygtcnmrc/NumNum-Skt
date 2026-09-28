const CACHE='numnum-skt-v1-7';
const APP_URL=new URL('/NumNum-Skt/BarBoss_V19_SKTRenkli.html',self.location.origin).href;
const NOTIFICATION_URL=APP_URL+'?open=notifications';
const DB_NAME='BarBossNotifications';
const DB_VERSION=1;
const STORE='items';

self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())
));

function openNotificationDB(){
  return new Promise((resolve,reject)=>{
    if(!('indexedDB' in self)){reject(new Error('IndexedDB yok'));return;}
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(STORE)){
        const store=db.createObjectStore(STORE,{keyPath:'id'});
        store.createIndex('receivedAt','receivedAt',{unique:false});
      }
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error('DB açılamadı'));
  });
}

async function saveNotification(data){
  let db=null;
  try{
    db=await openNotificationDB();
    const id=(self.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readwrite');
      tx.objectStore(STORE).put({
        id,
        title:data.title||'NN BarBoss',
        body:data.body||'',
        receivedAt:Number(data.receivedAt)||Date.now()
      });
      tx.oncomplete=resolve;
      tx.onerror=()=>reject(tx.error||new Error('Kayıt başarısız'));
      tx.onabort=()=>reject(tx.error||new Error('Kayıt iptal edildi'));
    });
    return true;
  }catch(_e){
    return false;
  }finally{
    try{db?.close();}catch(_){}
  }
}

const HISTORY_FALLBACK_SCRIPT=`<script>(function(){
  if(window.__BARBOSS_NOTIFICATION_HISTORY_FALLBACK__)return;
  window.__BARBOSS_NOTIFICATION_HISTORY_FALLBACK__=true;
  const DB='BarBossNotifications',VER=1,STORE='items';
  function openDB(){return new Promise((resolve,reject)=>{try{
    const r=indexedDB.open(DB,VER);
    r.onupgradeneeded=function(){const db=r.result;if(!db.objectStoreNames.contains(STORE)){const s=db.createObjectStore(STORE,{keyPath:'id'});s.createIndex('receivedAt','receivedAt',{unique:false});}};
    r.onsuccess=function(){resolve(r.result)};r.onerror=function(){reject(r.error||new Error('db'))};
  }catch(e){reject(e)}})}
  async function save(n){try{const db=await openDB();const id=(crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(36).slice(2));await new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put({id,title:n.title||'NN BarBoss',body:n.body||'',receivedAt:Number(n.receivedAt)||Date.now()});tx.oncomplete=res;tx.onerror=()=>rej(tx.error||new Error('write'));tx.onabort=()=>rej(tx.error||new Error('abort'))});db.close();if(typeof window.renderReceivedNotifications==='function')window.renderReceivedNotifications()}catch(e){}}
  navigator.serviceWorker&&navigator.serviceWorker.addEventListener('message',function(ev){if(ev.data&&ev.data.type==='BARBOSS_NOTIFICATION_SAVED'&&ev.data.notification)save(ev.data.notification)});
})();</script>`;

self.addEventListener('push',event=>{
  let data={};
  try{data=event.data?event.data.json():{};}catch(_){try{data={body:event.data?event.data.text():''};}catch(__){}}
  const title=data.title||'NN BarBoss';
  const body=data.body||'';
  const receivedAt=Date.now();
  event.waitUntil((async()=>{
    const saved=await saveNotification({title,body,receivedAt});
    await self.registration.showNotification(title,{
      body,
      icon:data.icon||'./icon-192.png',
      badge:data.badge||'./icon-192.png',
      data:{url:NOTIFICATION_URL},
      vibrate:[100,50,100],
      tag:data.tag||`barboss-${Date.now()}`,
      renotify:true
    });
    const cs=await clients.matchAll({type:'window',includeUncontrolled:true});
    cs.forEach(c=>{try{c.postMessage({type:'BARBOSS_NOTIFICATION_SAVED',notification:{title,body,receivedAt},saved});}catch(_){}});
  })());
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const target=NOTIFICATION_URL;
    const all=await clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of all){try{if('navigate' in client)await client.navigate(target);await client.focus();return;}catch(_){}}
    if(clients.openWindow)await clients.openWindow(target);
  })());
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==location.origin)return;
  const isPage=event.request.mode==='navigate'||url.pathname.endsWith('.html')||url.pathname==='/'||url.pathname.endsWith('/');
  if(isPage){
    event.respondWith((async()=>{
      try{
        const isNotif=url.searchParams.get('open')==='notifications';
        const response=await fetch(isNotif?APP_URL:event.request,{cache:'no-store'});
        if(response.ok){
          let html=await response.text();
          const injected=isNotif?`<script id="barboss-notification-open">(function(){var n=0,t=setInterval(function(){try{if(typeof show==='function'&&typeof currentProfile!=='undefined'&&currentProfile&&currentProfile.id){show('notifications');clearInterval(t)}}catch(e){}if(++n>80)clearInterval(t)},250)})();<\/script>`:'';
          const addition=HISTORY_FALLBACK_SCRIPT+(injected?'\n'+injected:'');
          html=html.includes('</body>')?html.replace('</body>',addition+'\n</body>'):html+addition;
          const headers=new Headers(response.headers);headers.delete('content-encoding');headers.delete('content-length');headers.set('content-type','text/html; charset=utf-8');
          return new Response(html,{status:response.status,statusText:response.statusText,headers});
        }
        const copy=response.clone();caches.open(CACHE).then(c=>c.put(event.request,copy));return response;
      }catch(_){return caches.match(APP_URL);}
    })());
    return;
  }
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(c=>c.put(event.request,copy));return response;})));
});
