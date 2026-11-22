/* Gestark v24 · protección del escaneo. No modifica el lector ni el historial existente.
 * Cada sesión de escaneo tiene su propio documento de respaldo; nunca se borra
 * antes de comprobar que su retiro finalizado existe en la nómina de Firestore.
 */
(()=>{
'use strict';
if(window.__gestarkRetireDraftBooted||!location.pathname.endsWith('/entregas-clientes.html'))return;
window.__gestarkRetireDraftBooted=true;
const SDK='https://www.gstatic.com/firebasejs/12.11.0/';
const DRAFTS='gestark_client_scan_drafts_v1',ROSTERS='gestark_client_deliveries_v1';
const PREFIX='gestark:clients:draft:v1:',SESSION_PREFIX='gestark:clients:scan-session:v1:',OUTBOX_PREFIX='gestark:clients:scan-cloud-outbox:v1:';
const HISTORY='gestark:clients:rosters:v1';
const user=window.GestarkAuth?.getUser?.();
if(!user?.uid||user.provider!=='firebase')return;
const draftKey=PREFIX+user.username,sessionKey=SESSION_PREFIX+user.username,outboxKey=OUTBOX_PREFIX+user.username;
const validOf=x=>/^\d{9}$/.test(String(x?.of||''))&&Number.isFinite(x.at);
const readJSON=(key,def)=>{try{return JSON.parse(localStorage.getItem(key)||'null')??def}catch{return def}};
const normalize=v=>({client:String(v?.client||'').slice(0,80),orders:(Array.isArray(v?.orders)?v.orders:[]).filter(validOf).slice(0,500).map(x=>({of:String(x.of),at:Number(x.at)}))});
const local=()=>normalize(readJSON(draftKey,{}));
const history=()=>{const a=readJSON(HISTORY,[]);return Array.isArray(a)?a:[]};
const random=()=>crypto.randomUUID?.()||('s'+Date.now()+'_'+Math.random().toString(36).slice(2));
let client=null,remote=[],rosters=new Map(),outbox=[],sending=false,server=false,rostersReady=false,lastDraft=local();
let sessionId=localStorage.getItem(sessionKey)||'',poll=null,watching=false,banner=null,statusLine=null;
let lastJSON=JSON.stringify(lastDraft),busyDelete=new Set(),restoring=false,syncError='',nextRetryAt=0;
function saveOutbox(){try{localStorage.setItem(outboxKey,JSON.stringify(outbox));return true}catch(e){setStatus('ALERTA: No se pudo guardar cola de respaldo. No cierres la aplicación.',true);return false}}
function enqueue(id,record){
 const previous=outbox.slice();outbox=outbox.filter(x=>x.id!==id);
 outbox.push({id,record,when:Date.now()});
 if(!saveOutbox()){outbox=previous;return false}
 void flush();return true;
}
function findCompleted(rec){
 const orders=new Set((rec?.orders||[]).map(x=>x.of));
 const firstScan=Math.min(...rec.orders.map(x=>x.at));
 return history().slice().reverse().find(e=>Number(e?.at)>=firstScan&&e?.client?.trim()===rec.client.trim()&&Array.isArray(e.orders)&&e.orders.length===orders.size&&e.orders.every(o=>orders.has(o.of))&&typeof e.id==='string');
}
function makeRecord(id,draft,state='active',entryId=''){
 return {ownerUid:user.uid,username:user.username,operator:String(user.name||user.username).slice(0,70),client:draft.client,
   orders:draft.orders,state,entryId,deviceId:id.split('_').slice(1).join('_'),updatedAt:null};
}
function setStatus(message,bad=false){
 if(!statusLine)return;
 statusLine.textContent=message;statusLine.style.color=bad?'#8a3e29':'#365f47';
 banner.style.background=bad?'#fff2eb':'#eef8f2';banner.style.borderColor=bad?'#efc1ae':'#cee7d4';
}
function setupUI(){
 if(document.getElementById('gs-draft-security'))return;
 banner=document.createElement('section');banner.id='gs-draft-security';
 banner.style.cssText='max-width:820px;margin:10px auto 12px;border:1px solid #cfe4d5;border-radius:11px;background:#eef8f2;padding:10px 12px;color:#365f47;font:700 12px/1.4 system-ui';
 statusLine=document.createElement('span');statusLine.textContent='Comprobando respaldo de los escaneos…';
 banner.append(statusLine);
 const tab=document.querySelector('.tabs');
 if(tab)tab.insertAdjacentElement('afterend',banner);
 else(document.getElementById('workspace')||document.body).prepend(banner);
}
function findNotRecovered(){
 const live=local();
 return remote.filter(r=>r.ownerUid===user.uid&&r.orders?.length&&r.state!=='confirmed'&&
   !(sessionId===r.id&&live.orders.length));
}
function updateUI(){
 if(!banner)return;
 banner.querySelectorAll('.gs-recover').forEach(n=>n.remove());
 const d=local(),pending=findNotRecovered();
 if(syncError){setStatus('⚠ '+syncError,true)}
 else if(d.orders.length){
  const cloud=remote.find(x=>x.id===sessionId);
  const safe=server&&cloud&&cloud.state==='active'&&cloud.orders.length===d.orders.length&&
   cloud.orders.every((x,i)=>x.of===d.orders[i].of);
  setStatus(safe?'✓ '+d.orders.length+' orden(es) respaldadas en Firebase.':
    '⚠ '+d.orders.length+' orden(es) guardadas en este dispositivo; respaldo en nube pendiente.',!safe);
 }else if(pending.length){
  setStatus('⚠ '+pending.length+' retiro(s) escaneado(s) sin confirmación de registro en el historial.',true);
 }else if(outbox.length){setStatus('Sincronizando registros pendientes con Firebase…',true)}
 else{setStatus(server?'✓ Sin retiros sin finalizar. Firebase conectado.':'Comprobando conexión con Firebase…',!server)}
 if(!d.orders.length){
  const candidates=pending.filter(r=>r.state==='active');
  if(candidates.length){
   const b=document.createElement('button');b.type='button';b.className='gs-recover';b.textContent='Recuperar retiro escaneado';
   b.style.cssText='display:block;margin-top:9px;padding:8px 11px;border:1px solid #d7a485;border-radius:9px;background:#fff;color:#804026;font:800 12px system-ui';
   b.addEventListener('click',()=>{
    const selected=candidates[0];
    if(local().orders.length){alert('Ya existe un retiro abierto. Finalízalo antes de recuperar otro.');return}
    const draft=normalize(selected);
    try{
     localStorage.setItem(draftKey,JSON.stringify(draft));localStorage.setItem(sessionKey,selected.id);
     restoring=true;location.reload();
    }catch(e){alert('No se pudo recuperar el borrador en este dispositivo: '+String(e.message||e))}
   });banner.append(b);
  }else if(pending.length){
   const b=document.createElement('button');b.type='button';b.className='gs-recover';b.textContent='Reintentar sincronización del historial';
   b.style.cssText='display:block;margin-top:9px;padding:8px 11px;border:1px solid #d7a485;border-radius:9px;background:#fff;color:#804026;font:800 12px system-ui';
   b.addEventListener('click',()=>{nextRetryAt=0;window.GestarkClientsCloud?.retry?.();void flush();});banner.append(b);
  }
 }
}
function capture(){
 if(restoring)return;
 const d=local(),serialized=JSON.stringify(d);
 if(serialized===lastJSON)return;
 const previous=lastDraft;
 lastJSON=serialized;lastDraft=d;
 if(d.orders.length){
  if(!sessionId){sessionId=user.uid+'_'+random();try{localStorage.setItem(sessionKey,sessionId)}catch(e){setStatus('No se pudo conservar el identificador del borrador.',true);return}}
  enqueue(sessionId,makeRecord(sessionId,d));
 }else if(previous.orders.length&&sessionId){
  const entry=findCompleted(previous);
  if(entry){
   enqueue(sessionId,makeRecord(sessionId,previous,'awaiting-cloud',entry.id));
   sessionId='';try{localStorage.removeItem(sessionKey)}catch(_){}
  }else{
   // No hubo finalización confirmada. Conservar el último respaldo en nube.
   setStatus('⚠ El borrador quedó vacío sin un retiro finalizado. Verifica las órdenes.',true);
  }
 }
 updateUI();
}
async function flush(){
 if(sending||!client||!navigator.onLine||Date.now()<nextRetryAt)return;
 sending=true;
 try{
  while(outbox.length&&navigator.onLine){
   const op=outbox[0],ref=client.fs.doc(client.db,DRAFTS,op.id);
   const payload={...op.record,updatedAt:client.fs.serverTimestamp()};
   try{await client.fs.setDoc(ref,payload);syncError='';nextRetryAt=0}
   catch(e){syncError='Respaldo en Firebase pendiente: '+(e.code||e.message);nextRetryAt=Date.now()+30000;setStatus('⚠ '+syncError,true);break}
   if(outbox[0]===op){outbox.shift();saveOutbox()}
  }
 }finally{sending=false;updateUI()}
}
async function cleanup(){
 if(!client||!rostersReady||!server)return;
 for(const r of remote){
  if(r.ownerUid!==user.uid||r.state!=='awaiting-cloud'||!r.entryId||busyDelete.has(r.id))continue;
  const roster=rosters.get(r.entryId);
  if(!roster||roster.deleted===true)continue;
  const saved=new Set((roster.orders||[]).map(x=>x.of));
  if(!r.orders.every(o=>saved.has(o.of)))continue;
  if(outbox.some(x=>x.id===r.id))continue;
  busyDelete.add(r.id);
  try{await client.fs.deleteDoc(client.fs.doc(client.db,DRAFTS,r.id))}
  catch(e){console.warn('Gestark: comprobación de borrador confirmado',e)}
  finally{busyDelete.delete(r.id)}
 }
}
async function start(){
 setupUI();outbox=readJSON(outboxKey,[]);if(!Array.isArray(outbox))outbox=[];
 const initial=local();
 if(initial.orders.length){
  if(!sessionId){sessionId=user.uid+'_'+random();try{localStorage.setItem(sessionKey,sessionId)}catch(_){}}
  if(sessionId)enqueue(sessionId,makeRecord(sessionId,initial));
 }
 // La página del escáner escribe localStorage sincrónicamente después de cada O.F.
 // storage no se dispara en el mismo documento; capture se activa después de clics,
 // scanner y cambios manuales y se respalda periódicamente en primer plano.
 document.addEventListener('click',()=>setTimeout(capture,0));
 document.addEventListener('input',()=>setTimeout(capture,0));
 window.addEventListener('storage',e=>{if(e.key===draftKey||e.key===HISTORY||e.key===outboxKey)capture()});
 window.addEventListener('focus',()=>{capture();void flush()});
 window.addEventListener('online',()=>{capture();nextRetryAt=0;void flush()});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){capture();void flush()}});
 poll=setInterval(()=>{if(!document.hidden){capture();void flush()}},750);
 try{
  let cfg=window.GestarkFirebaseConfig;
  if(!cfg){cfg=await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='./gestark-firebase-config.js';s.onload=()=>resolve(window.GestarkFirebaseConfig);s.onerror=()=>reject(Error('Configuración Firebase no disponible'));document.head.append(s)})}
  if(!cfg?.enabled)throw Error('Configuración Firebase deshabilitada');
  const [appSdk,authSdk,fs]=await Promise.all([import(SDK+'firebase-app.js'),import(SDK+'firebase-auth.js'),import(SDK+'firebase-firestore.js')]);
  const app=appSdk.getApps().find(x=>x.name==='[DEFAULT]')||appSdk.initializeApp(cfg),auth=authSdk.getAuth(app);
  await auth.authStateReady();if(auth.currentUser?.uid!==user.uid)throw Error('El usuario Firebase no coincide con la sesión');
  client={db:fs.getFirestore(app),fs};
  fs.onSnapshot(fs.query(fs.collection(client.db,DRAFTS),fs.where('ownerUid','==',user.uid)),{includeMetadataChanges:true},snap=>{
   server=!snap.metadata.fromCache;
   remote=snap.docs.map(d=>({id:d.id,...d.data()}));
   // Finalizaciones locales anteriores al inicio del módulo: detectarlas y
   // esperar hasta que la nómina de Firebase confirme su incorporación.
   for(const r of remote){
    if(r.state==='active'&&!outbox.some(x=>x.id===r.id)&&!(sessionId===r.id&&local().orders.length)){
      const done=findCompleted(r);
      if(done)enqueue(r.id,makeRecord(r.id,r,'awaiting-cloud',done.id));
    }
   }
   updateUI();void cleanup();
  },e=>{server=false;setStatus('⚠ No se pudieron consultar borradores en Firebase: '+(e.code||e.message),true)});
  fs.onSnapshot(fs.collection(client.db,ROSTERS),{includeMetadataChanges:true},snap=>{
   rostersReady=!snap.metadata.fromCache;
   rosters=new Map(snap.docs.map(d=>[d.id,d.data()]));void cleanup();
  },e=>{rostersReady=false;console.warn('Gestark: nómina no disponible para confirmar borradores',e)});
  void flush();updateUI();
 }catch(e){setStatus('⚠ Respaldo en nube no disponible: '+(e.message||e)+'. El borrador sigue local.',true)}
}
void start();
})();
