/* Gestark PWA v2026.11.22.13: shell nativo, carga local de archivos estáticos.
 * Las consultas de autenticación y Firestore no pasan por este trabajador.
 */
const VERSION='2026.11.22.13';
const CACHE='gestark-pwa-'+VERSION;
const CORE=[
 './','./index.html','./gestark-app.html','./gestark-rapido.html','./checklist.html','./notas-transferencias.html',
 './entregas-clientes.html','./repositorio.html','./entregas-contingentes.html',
 './gestark-auth.js','./gestark-updates.js','./gestark-pwa.js','./gestark-ui.css',
 './notas-transferencias.js','./entregas-clientes.js',
 './usuarios.js','./gestark-version.json','./manifest.webmanifest',
 './icon-192.png','./icon-512.png','./icon-maskable-512.png','./apple-touch-icon.png'
];
const BASE=new URL(self.registration.scope);
const STATIC=/\.(?:html?|js|css|json|png|jpg|jpeg|svg|webp|ico|webmanifest)$/i;
const canonical=url=>new Request(url.origin+url.pathname,{method:'GET'});
self.addEventListener('install',event=>{
 self.skipWaiting();
 event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await Promise.allSettled(CORE.map(path=>cache.add(new Request(new URL(path,BASE),{cache:'reload'}))));
 })());
});
self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
  const names=await caches.keys();
  await Promise.all(names.filter(name=>name.startsWith('gestark-pwa-')&&name!==CACHE).map(name=>caches.delete(name)));
  await self.clients.claim();
 })());
});
self.addEventListener('fetch',event=>{
 const req=event.request;
 if(req.method!=='GET'||req.headers.has('authorization'))return;
 const url=new URL(req.url);
 if(url.origin!==BASE.origin||!url.pathname.startsWith(BASE.pathname)||!(url.pathname.endsWith('/')||STATIC.test(url.pathname)))return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  const key=canonical(url);
  const force=url.searchParams.has('actualizar')||url.searchParams.has('refresh-gestark');
  const stored=force?null:await cache.match(key);
  const fetchAndStore=async()=>{
    const response=await fetch(req,force?{cache:'reload'}:{});
    if(response.ok&&response.type==='basic')await cache.put(key,response.clone()).catch(()=>{});
    return response;
  };
  if(stored){
    // El contenido se abre inmediatamente; los HTML se renuevan sin bloquear.
    if(req.mode==='navigate'||url.pathname.endsWith('.html')||url.pathname.endsWith('/'))event.waitUntil(fetchAndStore().catch(()=>{}));
    return stored;
  }
  try{return await fetchAndStore();}
  catch(_){return (await cache.match(key))||Response.error();}
 })());
});
