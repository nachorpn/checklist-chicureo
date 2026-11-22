/* Gestark · caché actualizada tras eliminar las credenciales locales. */
const VERSION='2026.11.22.6';
const CACHE='gestark-pwa-'+VERSION;
const CORE=['./','./index.html','./checklist.html','./repositorio.html','./admin.html',
  './gestark-auth.js','./usuarios.js','./gestark-updates.js','./gestark-pwa.js',
  './gestark-version.json','./manifest.webmanifest','./icon-192.png','./icon-512.png',
  './icon-maskable-512.png','./apple-touch-icon.png',
  './icono-checklist.png','./icono-repositorio.png','./icono-gestion.svg',
  './aviso-transferencia-chicureo.jpg'];
self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await Promise.allSettled(CORE.map(path=>cache.add(new Request(new URL(path,self.registration.scope),{cache:'reload'}))));
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const names=await caches.keys();
    await Promise.all(names.filter(x=>x.startsWith('gestark-pwa-')&&x!==CACHE).map(x=>caches.delete(x)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin||!url.pathname.startsWith(new URL(self.registration.scope).pathname))return;
  event.respondWith((async()=>{
    const canonical=new Request(new URL(url.pathname,url.origin),{method:'GET'});
    const cache=await caches.open(CACHE);
    try{
      const response=await fetch(req,{cache:'no-store'});
      if(response.ok&&response.type==='basic')await cache.put(canonical,response.clone()).catch(()=>{});
      return response;
    }catch(err){
      const saved=await cache.match(canonical);
      if(saved)return saved;
      if(req.mode==='navigate'){
        const home=await cache.match(new Request(new URL('./',self.registration.scope)));
        if(home)return home;
      }
      return Response.error();
    }
  })());
});
