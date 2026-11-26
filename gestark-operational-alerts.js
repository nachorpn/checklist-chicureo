/* Gestark v24 · alertas visibles en Inicio y burbuja de 3 segundos al abrir.
 * Usa el mismo Firebase que la nómina; no altera las notificaciones push.
 */
(()=>{
'use strict';
const SDK='https://www.gstatic.com/firebasejs/12.11.0/';
const ROSTERS='gestark_client_deliveries_v1';
const DRAFTS='gestark_client_scan_drafts_v1';
const host=document.getElementById('gestark-home-alerts');
const bubble=document.getElementById('gestark-open-bubble');
if(!host||!bubble)return;
let uid=null,role=null,username=null,rosterReady=false,draftsReady=false,rosterError='',draftsError='',rosters=[],drafts=[],bubbleShown=false,bubbleTimer=null,hiddenAt=0;
const el=(tag,klass,text)=>{const x=document.createElement(tag);if(klass)x.className=klass;if(text!=null)x.textContent=text;return x};
function navigateClients(){const btn=document.querySelector('#native-tabs button[data-tab="clients"]');btn?.click()}
function pendingCount(){let n=0;for(const r of rosters){if(r?.deleted===true||!Array.isArray(r?.orders))continue;const closures=r?.closures&&typeof r.closures==='object'?r.closures:{};for(const o of r.orders){if(/^\d{9}$/.test(String(o?.of||''))&&closures[o.of]!==true)n++}}return n}
function needAttention(){
 const found=drafts.filter(d=>(d.state==='active'||d.state==='awaiting-cloud')&&Array.isArray(d.orders)&&d.orders.length>0);
 // Protección local: la alerta no depende de que las reglas cloud ya estén activas.
 if(username){
  try{
   const raw=localStorage.getItem('gestark:clients:draft:v1:'+username),d=JSON.parse(raw||'null');
   const orders=Array.isArray(d?.orders)?d.orders.filter(o=>/^\d{9}$/.test(String(o.of||''))):[];
   const sid=localStorage.getItem('gestark:clients:scan-session:v1:'+username);
   if(orders.length&&!found.some(x=>sid&&x.id===sid))found.push({id:'local-current',ownerUid:uid,username,orders,state:'active'});
   const queue=JSON.parse(localStorage.getItem('gestark:clients:scan-cloud-outbox:v1:'+username)||'[]');
   if(Array.isArray(queue))for(const op of queue){
    const r=op?.record;if(r?.orders?.length&&!found.some(x=>x.id===op.id))found.push({...r,id:op.id});
   }
  }catch(_){/* No interrumpir Gestark por un respaldo local deteriorado. */}
 }
 return found;
}
function makeNotice({critical,title,detail}){
 const b=el('button','gs-alert '+(critical?'gs-alert-critical':'gs-alert-warning'));
 b.type='button';const sym=el('span','gs-alert-symbol',critical?'⚠':'📦');sym.setAttribute('aria-hidden','true');
 const body=el('span','gs-alert-content');body.append(el('span','gs-alert-title',title),el('span','gs-alert-detail',detail));
 b.append(sym,body,el('span','gs-alert-arrow','›'));
 b.addEventListener('click',navigateClients);return b;
}
function showBubble(p){
 if(p<=0)return;
 bubble.textContent='⚠ '+p+' '+(p===1?'orden sin cerrar':'órdenes sin cerrar')+' · Revisa Nómina operativa';
 bubble.hidden=false;clearTimeout(bubbleTimer);
 bubbleTimer=setTimeout(()=>{bubble.hidden=true},3000);
}
function render(){
 host.replaceChildren();const current=needAttention(),p=pendingCount();
 if(current.length){
  const totalOrders=current.reduce((n,d)=>n+d.orders.length,0);
  const sources=Array.from(new Set(current.map(d=>d.username||d.operator||''))).filter(Boolean);
  let detail=totalOrders+' O.F. escaneadas sin respaldo final confirmado en el historial';
  if(role==='admin'&&sources.length)detail+=' · '+sources.slice(0,3).join(', ');
  host.append(makeNotice({critical:true,title:current.length===1?'1 retiro sin finalizar o confirmar':current.length+' retiros sin finalizar o confirmar',detail}));
 }
 if(rosterReady&&p>0){
  host.append(makeNotice({critical:false,title:p===1?'1 orden pendiente de cierre':p+' órdenes pendientes de cierre',detail:'Ya figuran en la nómina, pero aún falta confirmar su cierre en sistema.'}));
 }
 if(rosterError||draftsError){
  const why=rosterError||draftsError;
  host.append(makeNotice({critical:true,title:'No se pudieron verificar todas las alertas',detail:'Comprueba la conexión y los permisos de Firebase. '+why}));
 }
 host.hidden=host.children.length===0;
 window.dispatchEvent(new Event('gestark:operational-summary'));
 // Mostrar el aviso breve una sola vez por apertura, tras la primera lectura real.
 if(rosterReady&&!bubbleShown){bubbleShown=true;showBubble(p)}
}
async function init(user){
 if(!user?.uid||!['admin','user'].includes(user.role)||uid)return;
 uid=user.uid;role=user.role;username=user.username;
 window.addEventListener('storage',e=>{if(e.key?.startsWith('gestark:clients:'))render()});
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden){hiddenAt=Date.now();bubble.hidden=true}
  else if(hiddenAt&&Date.now()-hiddenAt>=20000&&rosterReady)showBubble(pendingCount());
 });
 render();
 try{
  let cfg=window.GestarkFirebaseConfig;
  if(!cfg){cfg=await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='./gestark-firebase-config.js';s.onload=()=>resolve(window.GestarkFirebaseConfig);s.onerror=()=>reject(Error('Falta configuración Firebase'));document.head.append(s)})}
  if(!cfg?.enabled)throw Error('Firebase no está habilitado');
  const [appSDK,authSDK,fs]=await Promise.all([import(SDK+'firebase-app.js'),import(SDK+'firebase-auth.js'),import(SDK+'firebase-firestore.js')]);
  const app=appSDK.getApps().find(x=>x.name==='[DEFAULT]')||appSDK.initializeApp(cfg),auth=authSDK.getAuth(app);
  await auth.authStateReady();if(auth.currentUser?.uid!==uid)throw Error('La sesión no coincide con el usuario autenticado');
  const db=fs.getFirestore(app);
  fs.onSnapshot(fs.collection(db,ROSTERS),{includeMetadataChanges:true},snap=>{
    rosterError='';rosterReady=!snap.metadata.fromCache;rosters=snap.docs.map(d=>d.data());render();
  },err=>{rosterReady=false;rosterError=err.code||err.message||'Error de lectura';render()});
  // Los empleados ven únicamente sus borradores; el administrador los de todos.
  const reference=fs.collection(db,DRAFTS);
  const query=role==='admin'?reference:fs.query(reference,fs.where('ownerUid','==',uid));
  fs.onSnapshot(query,{includeMetadataChanges:true},snap=>{
    draftsError='';draftsReady=!snap.metadata.fromCache;drafts=snap.docs.map(d=>({...d.data(),id:d.id}));render();
  },err=>{draftsReady=false;draftsError=err.code||err.message||'Error de lectura';render()});
 }catch(e){rosterError=e.message||String(e);render()}
}
window.GestarkOperationalAlerts={init,status:()=>({ready:rosterReady&&!rosterError,pending:pendingCount()})};
if(window.__gestarkPendingPushUser)void init(window.__gestarkPendingPushUser);
})();
