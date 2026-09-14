// Deliberately caches only public application assets. Private team content is
// encrypted in IndexedDB; authenticated API responses never enter CacheStorage.
const CACHE='vigia-team-shell-v1';
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const response=await fetch('/offline-assets.json',{cache:'no-store'});if(!response.ok)throw Error('Offline asset list unavailable');
  const {assets}=await response.json(),cache=await caches.open(CACHE);
  for(const path of assets){const url=new URL(path,self.location.origin);if(url.origin!==self.location.origin||!/^\/(?:bundle|styles|assets)\//.test(url.pathname)&&!['/index.html','/offline-team.html'].includes(url.pathname))throw Error('Invalid offline asset');const r=await fetch(url,{cache:'reload'});if(!r.ok)throw Error('Offline asset download failed');await cache.put(url,r);}
})()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/backend/')||url.pathname.startsWith('/__operator/'))return;
  if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(async()=>{const cached=await caches.match('/offline-team.html',{cacheName:CACHE});return cached??Response.error();}));return;}
  if(/^\/(?:bundle|styles|assets)\//.test(url.pathname))event.respondWith(fetch(event.request).catch(async()=>await caches.match(event.request,{cacheName:CACHE})??Response.error()));
});
