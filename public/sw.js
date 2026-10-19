/* Only this public fallback is cached. Never cache chats, sessions, APIs or media. */
const CACHE = 'chatbit-public-offline-v2';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.add(new Request('/offline.html', {credentials:'omit'}))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('chatbit-public-offline-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||event.request.mode!=='navigate'||new URL(event.request.url).origin!==self.location.origin)return;
  event.respondWith(fetch(event.request).catch(async()=>await caches.match('/offline.html')??new Response('ChatBit is offline. Reconnect and try again.',{status:503,headers:{'Content-Type':'text/plain'}})));
});
