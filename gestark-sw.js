/* Gestark PWA v2026.11.25.38: shell nativo, carga local de archivos estáticos.
 * Las consultas de autenticación y Firestore no pasan por este trabajador.
 */
const VERSION='2026.11.25.38';
const CACHE='gestark-pwa-'+VERSION;
const CORE=[
 './','./index.html','./gestark-app.html','./gestark-rapido.html','./checklist.html','./notas-transferencias.html',
 './entregas-clientes.html','./directorio-clientes.html','./repositorio.html','./entregas-contingentes.html',
 './gestark-home-v37.js','./gestark-auth.js','./gestark-operational-alerts.js','./gestark-retire-draft.js','./gestark-client-autocomplete.js','./gestark-updates.js','./gestark-pwa.js','./gestark-ui.css',
 './notas-transferencias.js','./entregas-clientes.js','./gestark-clientes-cloud.js',
 './gestark-clientes-ui.js','./directorio-clientes.js','./gestark-push.js','./gestark-push-config.json',
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

// Notificaciones Push estándar (Apple Web Push, Android y navegadores compatibles).
// No requiere Firebase Messaging SDK ni otro Service Worker.
self.addEventListener('push',event=>{
 event.waitUntil((async()=>{
  let data={};try{data=event.data?.json()||{}}catch(_){return}
  const kind=String(data.kind||'');
  if(!['prueba','orders_1000','orders_1330','orders_1700','checklist_1230'].includes(kind))return;
  const title=String(data.title||'Gestark').slice(0,90);
  const body=String(data.body||'Tienes un recordatorio de Gestark.').slice(0,220);
  const target=data.target==='checklist'?'checklist':'clients';
  const day=String(data.tag||'gestark-recordatorio').slice(0,90);
  await self.registration.showNotification(title,{
   body,icon:new URL('icon-192.png',BASE).href,badge:new URL('icon-192.png',BASE).href,
   tag:day,renotify:false,data:{target},timestamp:Date.now()
  });
 })());
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const tab=event.notification?.data?.target==='checklist'?'checklist':'clients';
 const target=new URL('gestark-app.html#'+tab,BASE).href;
 event.waitUntil((async()=>{
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of windows){
   try{if(new URL(client.url).origin===BASE.origin){await client.navigate(target);return client.focus();}}catch(_){/* Abrir nueva ventana */}
  }
  return self.clients.openWindow(target);
 })());
});
