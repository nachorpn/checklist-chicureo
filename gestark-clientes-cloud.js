/* Gestark · Entregas clientes compartidas · 2026.11.22.15
 * Integra el módulo existente sin modificar el lector de códigos ni la función nativa de compartir.
 * Fuente de verdad: Firestore gestark_client_deliveries_v1.
 * Respaldo/borrador: almacenamiento local existente. Operaciones pendientes: cola local durable.
 * Los documentos eliminados se conservan como lápidas (deleted=true), para impedir reimportarlos.
 */
(() => {
'use strict';
if (window.__gestarkClientsCloudLoaded) return;
window.__gestarkClientsCloudLoaded = true;
if (!location.pathname.endsWith('/entregas-clientes.html')) return;
const VERSION = '2026.11.22.15';
const SDK = 'https://www.gstatic.com/firebasejs/12.11.0/';
const COLLECTION = 'gestark_client_deliveries_v1';
const HISTORY_KEY = 'gestark:clients:rosters:v1';
const STATUS_KEY = 'gestark:clients:system-closure:v1';
const QUEUE_KEY = 'gestark:clients:cloud-queue:v1';
const KNOWN_KEY = 'gestark:clients:cloud-known:v1';
const VALID_ID = /^[a-zA-Z0-9_-]{5,100}$/;
const VALID_OF = /^\d{9}$/;
const $ = id => document.getElementById(id);
let current = window.GestarkAuth?.getUser?.();
let client = null, remote = new Map(), known = {}, queue = [], serverReady = false;
let syncing = false, applyingRemote = false, stopped = false, queueDurable = true, notifyError = '';
let rawSetItem = Storage.prototype.setItem;
let lastSnapshotFromCache = true;
let indicator = null;
const safeJSON = (str, fallback) => { try { const v = JSON.parse(str); return v && typeof v === 'object' ? v : fallback; } catch { return fallback; } };
function localArr(key){const r=safeJSON(localStorage.getItem(key),[]);return Array.isArray(r)?r:[]}
function localObj(key){const r=safeJSON(localStorage.getItem(key),{});return !Array.isArray(r)&&r? r:{} }
function nativeSave(key, value) { rawSetItem.call(localStorage, key, JSON.stringify(value)); }
function isOrder(x){return x&&VALID_OF.test(String(x.of))&&Number.isFinite(x.at)}
function cleanEntry(e){
 if (!e || !VALID_ID.test(String(e.id)) || typeof e.client !== 'string' || !Number.isFinite(e.at) || !Array.isArray(e.orders)) return null;
 const orders=e.orders.filter(isOrder).slice(0,500).map(x=>({of:String(x.of),at:Number(x.at)}));
 if(!orders.length || !e.client.trim())return null;
 return {id:String(e.id),client:e.client.trim().slice(0,80),at:Number(e.at),user:String(e.user||'').slice(0,32),operator:String(e.operator||'').slice(0,70),orders};
}
function goodRoster(x){return x&&typeof x.id==='string'&&Array.isArray(x.orders)&&x.closures&&typeof x.closures==='object'}
function makeStatus() {
 let host = $('gestark-cloud-clientes');
 if(host)return host;
 host=document.createElement('div'); host.id='gestark-cloud-clientes';
 host.setAttribute('role','status'); host.setAttribute('aria-live','polite');
 host.style.cssText='max-width:680px;margin:10px auto;padding:10px 13px;border:1px solid #cfe5d8;border-radius:12px;background:#eef8f2;color:#215943;font:700 12px/1.45 system-ui;display:flex;align-items:center;flex-wrap:wrap;gap:8px';
 const message=document.createElement('span');message.id='gestark-cloud-clientes-msg';message.style.flex='1';message.style.minWidth='175px';
 message.textContent='Entregas clientes: preparando sincronización…';
 const retry=document.createElement('button');retry.type='button';retry.textContent='Sincronizar';retry.title='Enviar registros pendientes, conservando los datos locales';
 retry.style.cssText='border:1px solid #bfd8ca;background:white;color:#206247;border-radius:8px;padding:6px 10px;font:700 11px system-ui';
 retry.addEventListener('click',()=>{captureLocalChanges();if(!serverReady){location.reload();return}notifyError='';showProgress();void flush()});
 const backup=document.createElement('button');backup.type='button';backup.textContent='Respaldo';backup.title='Guardar respaldo local de nóminas, cierres y cambios pendientes';
 backup.style.cssText='border:1px solid #bfd8ca;background:white;color:#206247;border-radius:8px;padding:6px 10px;font:700 11px system-ui';
 backup.addEventListener('click',exportBackup);
 host.append(message,retry,backup);
 const tabs=document.querySelector('.tabs');
 if(tabs)tabs.insertAdjacentElement('afterend',host);
 else ($('workspace')||document.body).prepend(host);
 indicator=message;
 return host;
}
function setStatus(message, warning=false){
 if(!indicator)makeStatus();
 indicator.textContent=message;
 const el=$('gestark-cloud-clientes');
 el.style.background=warning?'#fff5e5':'#eef8f2';el.style.borderColor=warning?'#f0d39f':'#cfe5d8';el.style.color=warning?'#795019':'#215943';
}
function exportBackup(){
 const data={version:VERSION,createdAt:new Date().toISOString(),history:localArr(HISTORY_KEY),closure:localObj(STATUS_KEY),pending:queue};
 const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='gestark-entregas-clientes-respaldo-'+new Date().toISOString().slice(0,10)+'.json';
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function saveQueue(){
 try { nativeSave(QUEUE_KEY,queue);queueDurable=true;return true; }
 catch(e){ queueDurable=false;notifyError='Sin espacio para conservar los cambios pendientes. Exporta un respaldo.';setStatus(notifyError,true);console.error('Gestark cola local',e);return false; }
}
function saveKnown(){try{nativeSave(KNOWN_KEY,known)}catch(e){console.warn('Gestark marcas de importación',e)}}
function enqueue(op){
 if(!op || !VALID_ID.test(String(op.id)))return;
 const next={...op,nonce:crypto.randomUUID?.()||Date.now()+'-'+Math.random(),queuedAt:Date.now()};
 queue.push(next);if(!saveQueue()){queue.pop();return;}
 showProgress();void flush();
}
function changedHistory(before, after) {
 const old=new Map((Array.isArray(before)?before:[]).map(e=>[e?.id,e]));
 const now=new Map((Array.isArray(after)?after:[]).map(e=>[e?.id,e]));
 for(const [id,raw] of now) if(!old.has(id)){
   const entry=cleanEntry(raw);if(entry)enqueue({type:'create',id,entry,closures:closuresFor(id,localObj(STATUS_KEY))});
 }
 for(const [id,previous] of old){
   const next=now.get(id);
   const remaining=new Set((next?.orders||[]).map(x=>x.of));
   for(const order of previous?.orders||[]){
     if(VALID_OF.test(String(order.of))&&!remaining.has(order.of))enqueue({type:'remove-order',id,of:String(order.of)});
   }
 }
}
function changedClosures(before,after) {
 const old=before&&typeof before==='object'&&!Array.isArray(before)?before:{};
 const now=after&&typeof after==='object'&&!Array.isArray(after)?after:{};
 const all=new Set([...Object.keys(old),...Object.keys(now)]);
 for(const k of all){
  if(Boolean(old[k])===Boolean(now[k]))continue;
  const at=k.lastIndexOf(':');if(at<0)continue;
  const id=k.slice(0,at),of=k.slice(at+1);
  if(VALID_ID.test(id)&&VALID_OF.test(of))enqueue({type:'closure',id,of,closed:now[k]===true});
 }
}
// Observador explícito de operaciones locales. En Safari/iOS sobrescribir
// Storage.prototype.setItem no es una forma fiable de recibir eventos.
// Leemos los cambios tras los clics operativos y, como respaldo, periódicamente.
let captureLocalChanges=()=>{};
function observeLocalChanges() {
 const previous={
  [HISTORY_KEY]:localStorage.getItem(HISTORY_KEY),
  [STATUS_KEY]:localStorage.getItem(STATUS_KEY)
 };
 // La materialización de Firestore actualiza este registro para que NO se
 // confunda una descarga remota con una nueva operación local.
 window.__gestarkClientsCloudObserverLast=previous;
 captureLocalChanges=()=>{
  if(applyingRemote||stopped)return;
  for(const key of [HISTORY_KEY,STATUS_KEY]){
   const oldValue=previous[key],newValue=localStorage.getItem(key);
   if(oldValue===newValue)continue;
   previous[key]=newValue;
   if(key===HISTORY_KEY)changedHistory(safeJSON(oldValue,[]),safeJSON(newValue,[]));
   else changedClosures(safeJSON(oldValue,{}),safeJSON(newValue,{}));
  }
 };
 // Los controles ya tienen handlers en entregas-clientes.js. El evento
 // burbujea aquí una vez que el guardado local ha terminado.
 document.addEventListener('click',event=>{
  const target=event.target?.closest?.('button');
  if(!target)return;
  if(target.id==='finish'||target.id==='history-delete-confirm'||target.classList.contains('history-state')){
   // La primera comprobación ocurre al final del gesto; la segunda cubre
   // navegadores donde un diálogo nativo posterga la actividad del documento.
   queueMicrotask(captureLocalChanges);
   setTimeout(captureLocalChanges,150);
  }
 });
 // Respaldo para guardar desde otros controles o modificaciones en otras pestañas.
 window.addEventListener('focus',captureLocalChanges);
 window.addEventListener('pageshow',captureLocalChanges);
 window.addEventListener('storage',event=>{
  if(event.key===HISTORY_KEY||event.key===STATUS_KEY)captureLocalChanges();
 });
 document.addEventListener('visibilitychange',()=>{
  if(!document.hidden)captureLocalChanges();
 });
 setInterval(()=>{if(!document.hidden)captureLocalChanges()},1200);
}
function closuresFor(id,flat){const value={};for(const [k,v] of Object.entries(flat)){if(k.startsWith(id+':')){const of=k.slice(id.length+1);if(VALID_OF.test(of)&&v===true)value[of]=true;}}return value;}
function prepareLegacy(){
 const localHistory=localArr(HISTORY_KEY),storedClosures=localObj(STATUS_KEY);
 const queuedCreates=new Set(queue.filter(x=>x.type==='create').map(x=>x.id));
 let added=0;
 for(const e of localHistory){
  const entry=cleanEntry(e);
  if(!entry||known[entry.id]||queuedCreates.has(entry.id))continue;
  const op={type:'create',id:entry.id,entry,closures:closuresFor(entry.id,storedClosures),nonce:crypto.randomUUID?.()||Date.now()+'-'+added,queuedAt:Date.now()};
  queue.push(op);queuedCreates.add(entry.id);added++;
 }
 if(added&&!saveQueue())setStatus('Error: no se pudo preparar la importación. Descarga un respaldo.',true);
 return added;
}
function applyPending(map){
 const data=new Map([...map.entries()].map(([id,d])=>[id,{...d,closures:{...(d.closures||{})},orders:[...(d.orders||[])]}]));
 for(const op of queue){
  const curr=data.get(op.id);
  if(op.type==='create'){
   if(!curr && op.entry) data.set(op.id,{...op.entry,closures:{...(op.closures||{})},deleted:false});
  }else if(curr && !curr.deleted){
   if(op.type==='remove-order'){
    curr.orders=curr.orders.filter(x=>x.of!==op.of);delete curr.closures[op.of];if(!curr.orders.length)curr.deleted=true;
   } else if(op.type==='closure'&&curr.orders.some(x=>x.of===op.of)) curr.closures[op.of]=Boolean(op.closed);
  }
 }
 return data;
}
function reflectRemote() {
 // No pisar un retiro local que todavía no haya sido incorporado a la cola.
 captureLocalChanges();
 if(!serverReady||stopped||!queueDurable)return;
 const working=applyPending(remote);
 const list=[],flat={};
 for(const [id,doc] of working){
  if(!goodRoster(doc)||doc.deleted===true||!doc.orders?.length)continue;
  const entry=cleanEntry({...doc,id});if(!entry)continue;
  list.push(entry);
  for(const [of,closed] of Object.entries(doc.closures)){if(VALID_OF.test(of)&&closed===true)flat[id+':'+of]=true}
 }
 list.sort((a,b)=>a.at-b.at);
 applyingRemote=true;
 try {
  // La fuente visible procede de Firestore + operaciones locales pendientes.
  const payloads={[HISTORY_KEY]:JSON.stringify(list),[STATUS_KEY]:JSON.stringify(flat)};
  // Evitar reconstruir cientos de filas si sólo cambió la metadata de Firestore.
  for(const key of [HISTORY_KEY,STATUS_KEY]){
   if(localStorage.getItem(key)===payloads[key])continue;
   rawSetItem.call(localStorage,key,payloads[key]);
   if(window.__gestarkClientsCloudObserverLast)window.__gestarkClientsCloudObserverLast[key]=payloads[key];
   try{window.dispatchEvent(new StorageEvent('storage',{key,storageArea:localStorage,url:location.href}))}
   catch(_){const ev=new Event('storage');Object.defineProperty(ev,'key',{value:key});window.dispatchEvent(ev)}
  }
 }catch(error){notifyError='No se pudo guardar la copia local de la nómina. Descarga un respaldo.';setStatus(notifyError,true);console.error(error)}
 finally{applyingRemote=false}
}
function showProgress(){
 if(notifyError){setStatus(notifyError,true);return}
 if(!navigator.onLine){setStatus('Sin conexión · '+queue.length+' cambio(s) pendientes de sincronizar',true);return}
 if(!serverReady){setStatus('Conectando Entregas clientes con Firebase…',true);return}
 if(queue.length){setStatus('Sincronizando '+queue.length+' cambio(s) pendientes…',true);return}
 const valid=[...remote.values()].filter(v=>!v.deleted&&Array.isArray(v.orders));
 const orders=valid.reduce((sum,r)=>sum+r.orders.length,0);
 setStatus('Firebase sincronizado · '+valid.length+' retiro(s) en la nube · '+orders+' O.F.');
}
async function uploadCreate(op){
 const ref=client.fs.doc(client.db,COLLECTION,op.id);
 let returned=null;
 await client.fs.runTransaction(client.db,async tx=>{
  const snap=await tx.get(ref);
  if(snap.exists()){returned=snap.data();return}
  const entry=op.entry;
  if(!entry||!entry.orders.length)throw Error('Retiro local sin órdenes válidas');
  const doc={...entry,closures:op.closures||{},deleted:false,schemaVersion:1,
   createdBy:current.uid,createdAt:client.fs.serverTimestamp(),updatedBy:current.uid,updatedAt:client.fs.serverTimestamp()};
  tx.set(ref,doc);returned=doc;
 });
 return returned;
}
async function uploadClosure(op){
 const ref=client.fs.doc(client.db,COLLECTION,op.id);let returned=null;
 await client.fs.runTransaction(client.db,async tx=>{
  const snap=await tx.get(ref);
  if(!snap.exists()||snap.data().deleted)return;
  const d=snap.data();if(!d.orders?.some(x=>x.of===op.of))return;
  const closures={...(d.closures||{}),[op.of]:Boolean(op.closed)};
  tx.update(ref,{closures,updatedBy:current.uid,updatedAt:client.fs.serverTimestamp()});
  returned={...d,closures};
 });return returned;
}
async function uploadRemoval(op){
 const ref=client.fs.doc(client.db,COLLECTION,op.id);let returned=null;
 await client.fs.runTransaction(client.db,async tx=>{
  const snap=await tx.get(ref);
  if(!snap.exists()||snap.data().deleted)return;
  const d=snap.data();
  const orders=d.orders.filter(x=>x.of!==op.of),closures={...(d.closures||{})};delete closures[op.of];
  const deleted=orders.length===0;
  tx.update(ref,{orders,closures,deleted,updatedBy:current.uid,updatedAt:client.fs.serverTimestamp()});
  returned={...d,orders,closures,deleted};
 });return returned;
}
async function flush(){
 if(syncing||!serverReady||!client||stopped||!navigator.onLine)return;
 syncing=true;
 try {
  while(queue.length&&serverReady&&navigator.onLine&&!stopped){
   const op=queue[0];
   try {
    const returned=op.type==='create'?await uploadCreate(op):op.type==='closure'?await uploadClosure(op):op.type==='remove-order'?await uploadRemoval(op):null;
    if(op.type==='create'){known[op.id]=true;saveKnown()}
    if(returned)remote.set(op.id,returned);
    // Quitar sólo la operación confirmada; preserva otras agregadas mientras se esperaba la red.
    queue.shift();saveQueue();notifyError='';reflectRemote();showProgress();
   } catch(error){
    const code=error?.code||'';
    notifyError=code==='permission-denied'?'Firebase rechazó el acceso a Entregas clientes. Revisa las reglas de Firestore.':
      code==='unavailable'?'Sin conexión con Firebase. Los cambios siguen guardados localmente.':
      'Sin sincronizar: '+String(error?.message||error).slice(0,140);
    showProgress();console.warn('Gestark: sync Entregas clientes',error);break;
   }
  }
 } finally{syncing=false;showProgress()}
}
async function loadConfig(){
 if(window.GestarkFirebaseConfig)return window.GestarkFirebaseConfig;
 return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='./gestark-firebase-config.js?v=2026.11.21.43';
  s.onload=()=>window.GestarkFirebaseConfig?resolve(window.GestarkFirebaseConfig):reject(Error('Configuración Firebase no disponible'));
  s.onerror=()=>reject(Error('No se pudo cargar Firebase'));document.head.append(s)})
}
async function boot(){
 makeStatus();
 queue=localArr(QUEUE_KEY).filter(x=>x&&['create','closure','remove-order'].includes(x.type)&&VALID_ID.test(String(x.id))&&x.nonce);
 known=localObj(KNOWN_KEY);
 observeLocalChanges();
 const oldCount=prepareLegacy();
 if(oldCount)setStatus('Preparando '+oldCount+' retiro(s) guardados en este dispositivo…',true);
 window.addEventListener('online',()=>{captureLocalChanges();notifyError='';showProgress();void flush()});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){captureLocalChanges();showProgress();void flush()}});
 // No cerrar el listener en pagehide: Safari puede suspender y restaurar una PWA.
 // Si el documento se destruye, el navegador libera sus listeners automáticamente.
 window.addEventListener('storage',e=>{if([QUEUE_KEY,KNOWN_KEY].includes(e.key)){queue=localArr(QUEUE_KEY);known=localObj(KNOWN_KEY);showProgress();void flush()}});
 try {
  if(!current||current.provider!=='firebase'||!current.uid)throw Error('Se necesita una sesión Firebase autorizada.');
  const cfg=await loadConfig();if(cfg.enabled!==true)throw Error('Firebase no está habilitado.');
  const [appSDK,authSDK,fs]=await Promise.all([import(SDK+'firebase-app.js'),import(SDK+'firebase-auth.js'),import(SDK+'firebase-firestore.js')]);
  const app=appSDK.getApps().find(x=>x.name==='[DEFAULT]')||appSDK.initializeApp(cfg);
  const auth=authSDK.getAuth(app);
  const firebaseUser=await new Promise((resolve,reject)=>{
   let done=false;let unsub=()=>{};unsub=authSDK.onAuthStateChanged(auth,u=>{if(done)return;done=true;unsub();resolve(u)},reject);
  });
  if(!firebaseUser||firebaseUser.uid!==current.uid)throw Error('La sesión Firebase no coincide con el usuario de Gestark.');
  const db=fs.getFirestore(app);
  const m=await fs.getDocFromServer(fs.doc(db,'authorized_users',firebaseUser.uid));
  if(!m.exists()||m.data().active!==true||m.data().username!==current.username||!['admin','user'].includes(m.data().role))throw Error('Usuario sin autorización para sincronizar.');
  client={fs,db};
  client.unsubscribe=fs.onSnapshot(fs.collection(db,COLLECTION),{includeMetadataChanges:true},snapshot=>{
   lastSnapshotFromCache=snapshot.metadata.fromCache;
   serverReady=!lastSnapshotFromCache;
   remote=new Map(snapshot.docs.map(d=>[d.id,{...d.data(),id:d.id}]));
   if(serverReady){if(queueDurable)notifyError='';reflectRemote();void flush()}
   showProgress();
  },error=>{
   serverReady=false;notifyError=error?.code==='permission-denied'?'Sin permiso para consultar Entregas clientes: añade las reglas indicadas.':'Error de sincronización: '+String(error?.message||error);
   showProgress();
  });
 }catch(error){
  serverReady=false;notifyError=String(error?.message||error);showProgress();console.warn('Gestark: inicio Cloud clientes',error)
 }
}
// Permite probar de forma local la integración sin exponer credenciales ni SDKs.
if (typeof window!=='undefined') window.GestarkClientsCloud={version:VERSION,status:()=>({ready:serverReady,pending:queue.length,lastSnapshotFromCache}),retry:()=>{captureLocalChanges();notifyError='';showProgress();void flush()}};
void boot();
})();
