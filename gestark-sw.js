/* Gestark PWA 2026.11.22.8 - navegacion cache-first segura para recursos estaticos. */
const VERSION = '2026.11.22.8';
const CACHE = 'gestark-pwa-' + VERSION;
const CORE = ['./','./index.html','./checklist.html','./repositorio.html','./admin.html',
 './notas-transferencias.html','./entregas-clientes.html','./entregas-contingentes.html',
 './gestark-auth.js','./gestark-updates.js','./gestark-pwa.js','./gestark-ui.css',
 './usuarios.js','./gestark-version.json','./manifest.webmanifest',
 './icon-192.png','./icon-512.png','./icon-maskable-512.png','./apple-touch-icon.png',
 './icono-checklist.png','./icono-repositorio.png','./icono-gestion.svg'];
const SCOPE_PATH = new URL(self.registration.scope).pathname;
const IMMUTABLE_EXT = /\.(?:html?|js|css|json|png|jpg|jpeg|svg|webp|ico|webmanifest)$/i;
const staticPath = url => url.pathname.startsWith(SCOPE_PATH) &&
 (url.pathname.endsWith('/') || IMMUTABLE_EXT.test(url.pathname));
const canonical = url => new Request(url.origin + url.pathname, {method:'GET'});
self.addEventListener('install', event => {
 self.skipWaiting();
 event.waitUntil((async()=>{
   const cache=await caches.open(CACHE);
   await Promise.allSettled(CORE.map(path=>cache.add(new Request(new URL(path,self.registration.scope),{cache:'reload'}))));
 })());
});
self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
   const keys=await caches.keys();
   await Promise.all(keys.filter(key=>key.startsWith('gestark-pwa-') && key!==CACHE).map(key=>caches.delete(key)));
   await self.clients.claim();
 })());
});
self.addEventListener('fetch',event=>{
 const req=event.request;
 if(req.method!=='GET'||req.headers.has('authorization'))return;
 const url=new URL(req.url);
 if(url.origin!==self.location.origin || !staticPath(url))return;
 // El boton Actualizar sigue permitiendo forzar una descarga reciente.
 // La version anterior agregaba ?actualizar a TODOS los enlaces internos.
 // Solo una recarga de la MISMA pagina (boton Actualizar) fuerza la red.
 let sameDocument=false;
 try {sameDocument=Boolean(req.referrer) && new URL(req.referrer).pathname===url.pathname;}catch(_){}
 const forceFresh=url.searchParams.has('actualizar') && sameDocument;
 event.respondWith((async()=>{
   const cache=await caches.open(CACHE);
   const key=canonical(url);
   const saved=forceFresh ? null : await cache.match(key);
   const network=async()=>{
     const response=await fetch(req,forceFresh?{cache:'reload'}:{});
     if(response.ok && response.type==='basic'){
       // Solo se cachean recursos estaticos del propio GitHub Pages, nunca API/datos de Firebase.
       await cache.put(key,response.clone()).catch(()=>{});
     }
     return response;
   };
   if(saved){
     // Respuesta inmediata desde cache; se actualiza discretamente al navegar.
     event.waitUntil(network().catch(()=>{}));
     return saved;
   }
   try{return await network();}
   catch(error){
     const fallback=await cache.match(key);
     if(fallback)return fallback;
     if(req.mode==='navigate'){
       const home=await cache.match(new Request(new URL('./',self.registration.scope)));
       if(home)return home;
     }
     return Response.error();
   }
 })());
});
