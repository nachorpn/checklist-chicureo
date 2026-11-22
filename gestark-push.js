/* Gestark · Web Push sin servidor de pago · v2026.11.22.17
 * Solo la PWA principal. Registro explícito por dispositivo y por usuario Firebase.
 * La clave VAPID privada JAMÁS se almacena en el navegador ni en GitHub público.
 */
(()=>{
'use strict';
if(window.__gestarkPushUI)return;window.__gestarkPushUI=true;
const V='2026.11.22.17';
const SDK='https://www.gstatic.com/firebasejs/12.11.0/';
const COLLECTION='gestark_push_subscriptions_v1';
const $=id=>document.getElementById(id);
const DEVICE_KEY='gestark:push:device:v1';
const OWNER_KEY='gestark:push:owner:v1';
let profile=null,client=null,operation=false;
const configureMessage='Falta configurar la clave pública VAPID en gestark-push-config.json.';
function feedback(s,bad=false){const x=$('gs-push-status');if(x){x.textContent=s;x.style.color=bad?'#9f4238':'#376e56';}}
function appInstalled(){return window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;}
function supported(){return window.isSecureContext&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window&&'crypto' in window;}
function decodeVapid(s){const str=(s||'').replace(/-/g,'+').replace(/_/g,'/');const bytes=atob(str.padEnd(Math.ceil(str.length/4)*4,'='));return Uint8Array.from(bytes,ch=>ch.charCodeAt(0));}
async function config(){const response=await fetch('./gestark-push-config.json?actualizar='+V.replace(/\D/g,''),{cache:'no-store'});if(!response.ok)throw Error('No se pudo leer configuración Web Push.');const value=await response.json();if(!value.vapidPublicKey||value.vapidPublicKey.startsWith('REEMPLAZAR_'))throw Error(configureMessage);return value;}
function deviceId(){let id=localStorage.getItem(DEVICE_KEY);if(id&&!/^[A-Za-z0-9_-]{12,80}$/.test(id))id=null;
 if(!id){id=Array.from(crypto.getRandomValues(new Uint8Array(20)),x=>x.toString(16).padStart(2,'0')).join('');localStorage.setItem(DEVICE_KEY,id);}return id;}
function refFor(){return client.fs.doc(client.db,COLLECTION,'push_'+profile.uid+'_'+deviceId());}
async function firebaseClient(){
 if(client)return client;
 if(!profile?.uid||profile.provider!=='firebase')throw Error('Entra primero con un usuario autorizado de Gestark.');
 const configApp=window.GestarkFirebaseConfig||await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='./gestark-firebase-config.js';s.onload=()=>resolve(window.GestarkFirebaseConfig);s.onerror=()=>reject(Error('No se pudo cargar configuración Firebase.'));document.head.append(s)});
 if(!configApp?.enabled)throw Error('Firebase está deshabilitado.');
 const [apps,authSDK,fs]=await Promise.all([import(SDK+'firebase-app.js'),import(SDK+'firebase-auth.js'),import(SDK+'firebase-firestore.js')]);
 const app=apps.getApps().find(a=>a.name==='[DEFAULT]')||apps.initializeApp(configApp);
 const auth=authSDK.getAuth(app);
 const user=await new Promise((resolve,reject)=>{let unsub=()=>{};unsub=authSDK.onAuthStateChanged(auth,u=>{unsub();resolve(u)},reject)});
 if(!user||user.uid!==profile.uid)throw Error('La sesión de Firebase todavía no está preparada. Inténtalo nuevamente.');
 client={fs,db:fs.getFirestore(app)};return client;
}
function btnMode(busy){operation=busy;for(const id of ['gs-push-enable','gs-push-disable','gs-push-save']){const b=$(id);if(b)b.disabled=busy;}}
async function getSubscription(){const reg=await navigator.serviceWorker.register('./gestark-sw.js?v='+V,{scope:'./'});return {reg,subscription:await reg.pushManager.getSubscription()};}
async function refresh(){
 if(!profile)return;
 if(!supported()){feedback('Este navegador no admite Web Push. En iPhone necesitas iOS 16.4+ e instalar Gestark en pantalla de inicio.',true);return;}
 if(/iP(hone|ad|od)/i.test(navigator.userAgent)&&!appInstalled()){feedback('Abre Gestark desde su ícono de pantalla de inicio para activar avisos en iPhone.',true);return;}
 if(Notification.permission==='denied'){feedback('Las notificaciones están bloqueadas. Actívalas desde Ajustes del iPhone → Notificaciones → Gestark.',true);return;}
 try {
  const {subscription}=await getSubscription();if(!subscription){feedback('Notificaciones desactivadas en este dispositivo.');return;}
  const c=await firebaseClient();const doc=await c.fs.getDoc(refFor());
  if(!doc.exists()){feedback('Permiso activo en el navegador, pero falta registrar este dispositivo. Pulsa Activar.',true);return;}
  const d=doc.data();$('gs-push-checklist').checked=d.checklistEnabled!==false;$('gs-push-orders').checked=d.ordersEnabled!==false;
  feedback('Notificaciones activas en este dispositivo · Checklist 12:30 · O.F. 10:00 / 13:30 / 17:00');
 }catch(e){feedback('No se pudo verificar: '+String(e.message||e),true);}
}
async function enable(){if(operation)return;btnMode(true);feedback('Activando Web Push…');try{
 if(!supported())throw Error('Este navegador no admite notificaciones Web Push.');
 if(/iP(hone|ad|od)/i.test(navigator.userAgent)&&!appInstalled())throw Error('En iPhone, abre Gestark instalada desde la pantalla de inicio.');
 // Safari/iOS exige que el permiso se solicite durante el clic del usuario;
 // no hacer fetch ni otras esperas antes de esta llamada.
 const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('No se otorgó permiso para las notificaciones.');
 const cfg=await config();
 const {reg,subscription}=await getSubscription();
 // Al cambiar de cuenta en este teléfono, invalidar el antiguo endpoint.
 // Así una suscripción anterior no seguirá mostrando avisos de otra cuenta.
 const changedOwner=localStorage.getItem(OWNER_KEY)&&localStorage.getItem(OWNER_KEY)!==profile.uid;
 if(changedOwner&&subscription)await subscription.unsubscribe();
 const sub=(!changedOwner&&subscription)||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decodeVapid(cfg.vapidPublicKey)});
 const json=sub.toJSON();if(!json.endpoint||!json.keys?.p256dh||!json.keys?.auth)throw Error('Suscripción incompleta del navegador.');
 const c=await firebaseClient(),ref=refFor(),existing=await c.fs.getDoc(ref);
 const data={uid:profile.uid,endpoint:json.endpoint,p256dh:json.keys.p256dh,auth:json.keys.auth,
   checklistEnabled:$('gs-push-checklist').checked,ordersEnabled:$('gs-push-orders').checked,updatedAt:c.fs.serverTimestamp()};
 if(!existing.exists())data.createdAt=c.fs.serverTimestamp();
 await c.fs.setDoc(ref,data,{merge:true});
 localStorage.setItem(OWNER_KEY,profile.uid);
 feedback('Notificaciones activas. Ya puedes bloquear el teléfono.');
 }catch(e){feedback('No fue posible activar: '+String(e.message||e),true);}finally{btnMode(false);}}
async function savePreferences(){if(operation)return;btnMode(true);try{
 const c=await firebaseClient(),ref=refFor(),doc=await c.fs.getDoc(ref);
 if(!doc.exists())throw Error('Activa primero las notificaciones en este dispositivo.');
 await c.fs.updateDoc(ref,{checklistEnabled:$('gs-push-checklist').checked,ordersEnabled:$('gs-push-orders').checked,updatedAt:c.fs.serverTimestamp()});
 feedback('Preferencias guardadas en Firebase para este dispositivo.');
 }catch(e){feedback('Error al guardar: '+String(e.message||e),true);}finally{btnMode(false);}}
async function disable(){if(operation)return;btnMode(true);try{
 const c=await firebaseClient(),ref=refFor();const found=await c.fs.getDoc(ref);if(found.exists())await c.fs.deleteDoc(ref);
 const {subscription}=await getSubscription();if(subscription)await subscription.unsubscribe();
 feedback('Notificaciones desactivadas en este dispositivo.');
 }catch(e){feedback('No se pudo desactivar: '+String(e.message||e),true);}finally{btnMode(false);}}
function setup(){const more=document.querySelector('#more-view .more-inner');if(!more)return;
 const action=document.createElement('button');action.type='button';action.className='menu-row';action.id='gs-push-action';action.innerHTML='<span class="menu-glyph">🔔</span><span class="menu-copy">Notificaciones<small>Checklist 12:30 y O.F. pendientes tres veces al día</small></span><span class="menu-chevron">›</span>';
 const groups=more.querySelectorAll('.menu-group');(groups[1]||groups[0]||more).append(action);
 const panel=document.createElement('section');panel.id='gs-push-panel';panel.hidden=true;
 panel.innerHTML=`<div class="gs-push-head"><strong>Notificaciones de Gestark</strong><button type="button" id="gs-push-back">Cerrar</button></div>
 <p class="gs-push-desc">Se muestran incluso con el iPhone bloqueado cuando Gestark está instalada en pantalla de inicio. Solicitan permiso una sola vez por dispositivo.</p>
 <label class="gs-push-option"><input type="checkbox" id="gs-push-orders" checked><span><strong>O.F. por cerrar</strong><small>Lunes a viernes · 10:00, 13:30 y 17:00 · solo si hay pendientes</small></span></label>
 <label class="gs-push-option"><input type="checkbox" id="gs-push-checklist" checked><span><strong>Checklist diario</strong><small>Lunes a viernes · 12:30 · enviar antes de las 13:00</small></span></label>
 <p id="gs-push-status" role="status" aria-live="polite">Abre este panel para revisar el dispositivo.</p>
 <button type="button" id="gs-push-enable" class="gs-push-primary">Activar notificaciones</button><button type="button" id="gs-push-save">Guardar preferencias</button><button type="button" id="gs-push-disable">Desactivar en este dispositivo</button>
 <p class="gs-push-foot">El Checklist se recuerda aunque ya lo hayas enviado: WhatsApp todavía no confirma ese envío a Firebase. Los recordatorios pueden llegar con retraso si GitHub demora la ejecución.</p>`;
 more.append(panel);
 const css=document.createElement('style');css.textContent=`#gs-push-panel{margin:14px 0;padding:16px;border:1px solid #d7e9de;border-radius:16px;background:white;box-shadow:0 2px 12px #173c2111;color:#204c37;font:14px/1.45 system-ui}
 #gs-push-panel[hidden]{display:none!important}.gs-push-head{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:17px}.gs-push-head button{border:0;background:#eaf5ed;border-radius:8px;padding:7px 10px;color:#2a6648;font-weight:750}
 .gs-push-desc,.gs-push-foot{color:#617b6a;font-size:12px}.gs-push-option{display:flex;gap:11px;align-items:center;background:#f1f8f3;border:1px solid #dcebe0;padding:12px;border-radius:11px;margin:9px 0;cursor:pointer}
 .gs-push-option input{width:20px;height:20px;accent-color:#13805b}.gs-push-option span{display:grid;gap:3px}.gs-push-option small{color:#65806e;font-size:11px}
 #gs-push-status{margin:13px 0;color:#376e56;font-size:12px;font-weight:700}
 #gs-push-panel>button{width:100%;padding:12px;border-radius:11px;font-weight:800;margin:5px 0;border:1px solid #cce0d2;background:#f1f7f2;color:#236247}
 #gs-push-panel>button.gs-push-primary{background:#117e56;color:white;border-color:#117e56}#gs-push-panel>button:disabled{opacity:.55}`;
 document.head.append(css);
 action.addEventListener('click',()=>{panel.hidden=false;panel.scrollIntoView({behavior:'smooth',block:'start'});void refresh();});
 $('gs-push-back').addEventListener('click',()=>{panel.hidden=true;action.scrollIntoView({behavior:'smooth',block:'nearest'});});
 $('gs-push-enable').addEventListener('click',()=>void enable());$('gs-push-disable').addEventListener('click',()=>void disable());$('gs-push-save').addEventListener('click',()=>void savePreferences());
}
window.GestarkPush={init:user=>{profile=user;if(!window.__gestarkPushSetup){window.__gestarkPushSetup=true;setup();}},version:V};
if(window.__gestarkPendingPushUser)window.GestarkPush.init(window.__gestarkPendingPushUser);
})();
