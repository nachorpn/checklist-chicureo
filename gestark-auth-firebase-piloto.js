/* Gestark · acceso progresivo Firebase Auth · 2026.11.22.1
 * COMPATIBILIDAD: preserva el acceso local existente mientras se valida Firebase.
 * Firebase solo autoriza perfiles de authorized_users/{uid} con active === true.
 * No conecta ni migra módulos de datos operativos; esos siguen usando almacenamiento local.
 */
(()=>{
'use strict';
const SESSION='gestark:session:v1';
const OVERRIDES='gestark:users:overrides:v1';
const REMOTE_PAUSED='gestark:firebase:automatic-login-paused:v1';
const SDK='https://www.gstatic.com/firebasejs/12.11.0/';
const PILOT=window.location.pathname.endsWith('/acceso-firebase-piloto.html');
const PILOT_PREFER='gestark:firebase:pilot-prefer:v1';
const preferRemoteInPilot=()=>PILOT&&sessionStorage.getItem(PILOT_PREFER)==='1';
const baseUsers=Array.isArray(window.GESTARK_USERS)?window.GESTARK_USERS:[];
let activeUser=null, firebasePromise=null;

const normalized=x=>String(x||'').toUpperCase().trim();
const cleanName=x=>String(x||'').trim().replace(/\s+/g,' ').slice(0,80);
const hexToBytes=h=>new Uint8Array((h.match(/.{2}/g)||[]).map(i=>parseInt(i,16)));
const bytesToHex=u=>Array.from(u,b=>b.toString(16).padStart(2,'0')).join('');

function overrides(){
 try{const d=JSON.parse(localStorage.getItem(OVERRIDES)||'{}');return d&&typeof d==='object'&&!Array.isArray(d)?d:{}}
 catch{return {}}
}
function users(){
 const a=new Map();
 baseUsers.forEach(u=>a.set(u.username,u));
 Object.values(overrides()).forEach(u=>{if(u&&u.username)a.set(u.username,u)});
 return [...a.values()].sort((a,b)=>a.role==='admin'?-1:b.role==='admin'?1:a.username.localeCompare(b.username));
}
function getById(id){return users().find(u=>u.username===normalized(id))||null}
function getLocalUser(){
 let s=null;try{s=JSON.parse(localStorage.getItem(SESSION)||'null')}catch{}
 if(!s)return null;
 const u=getById(s.username);
 if(!u||!u.enabled||s.sig!==u.hash)return null;
 return {username:u.username,name:u.name,role:u.role,provider:'local'};
}
function getUser(){return activeUser||getLocalUser()}
async function derive(password,salt,iterations){
 if(!window.crypto?.subtle)throw Error('Necesitas abrir Gestark mediante HTTPS desde GitHub Pages.');
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:hexToBytes(salt),iterations:iterations||120000,hash:'SHA-256'},key,256);
 return bytesToHex(new Uint8Array(bits));
}
async function makeVerifier(password){
 const salt=bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
 return {salt,iterations:120000,hash:await derive(password,salt,120000)};
}
function localSave(user){const d=overrides();d[user.username]=user;localStorage.setItem(OVERRIDES,JSON.stringify(d));}
function saveSession(user){localStorage.setItem(SESSION,JSON.stringify({username:user.username,sig:user.hash}));}

function loadPublicConfig(){
 if(window.GestarkFirebaseConfig)return Promise.resolve(window.GestarkFirebaseConfig);
 return new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src='./gestark-firebase-config.js?v=2026.11.21.43';
  script.onload=()=>window.GestarkFirebaseConfig?resolve(window.GestarkFirebaseConfig):reject(Error('Configuración Firebase no disponible.'));
  script.onerror=()=>reject(Error('No se pudo cargar la configuración Firebase.'));
  document.head.append(script);
 });
}
async function firebaseClient(){
 if(firebasePromise)return firebasePromise;
 firebasePromise=(async()=>{
  const cfg=await loadPublicConfig();
  if(cfg.enabled!==true||!cfg.apiKey||!cfg.projectId||!cfg.authDomain||!cfg.appId)
   throw Error('El proyecto Firebase todavía no está activado.');
  const [appSDK,authSDK,dbSDK]=await Promise.all([
   import(SDK+'firebase-app.js'),import(SDK+'firebase-auth.js'),import(SDK+'firebase-firestore.js')
  ]);
  const app=appSDK.getApps().find(x=>x.name==='[DEFAULT]')||appSDK.initializeApp({
   apiKey:cfg.apiKey,authDomain:cfg.authDomain,projectId:cfg.projectId,
   storageBucket:cfg.storageBucket,messagingSenderId:cfg.messagingSenderId,appId:cfg.appId
  });
  const auth=authSDK.getAuth(app);
  const db=dbSDK.getFirestore(app);
  await authSDK.setPersistence(auth,authSDK.browserLocalPersistence);
  return {auth,db,authSDK,dbSDK};
 })();
 try{return await firebasePromise}
 catch(e){firebasePromise=null;throw e}
}
async function firebaseInitialUser(client){
 return new Promise(resolve=>{
  let done=false,stop=()=>{};
  stop=client.authSDK.onAuthStateChanged(client.auth,user=>{
   if(done)return;done=true;stop();resolve(user);
  },()=>{if(done)return;done=true;stop();resolve(null)});
 });
}
async function authorizedIdentity(client,user){
 if(!user)throw Error('Inicia sesión con tu correo Firebase.');
 // Exigir lectura fresca del servidor: no conceder acceso desde un perfil en caché.
 const record=await client.dbSDK.getDocFromServer(client.dbSDK.doc(client.db,'authorized_users',user.uid));
 const p=record.exists()?record.data():null;
 if(!p||p.active!==true||!['admin','user'].includes(p.role)||
    !/^[A-Z0-9_-]{2,30}$/.test(String(p.username||''))){
  throw Error('Tu cuenta Firebase todavía no está autorizada para Gestark.');
 }
 return {
  username:p.username,name:cleanName(p.name)||user.email||p.username,
  role:p.role,provider:'firebase',uid:user.uid
 };
}
function errorMessage(e){
 const known={
  'auth/invalid-credential':'Correo o contraseña incorrectos.',
  'auth/invalid-email':'Revisa tu correo electrónico.',
  'auth/user-disabled':'Tu cuenta está desactivada.',
  'auth/too-many-requests':'Demasiados intentos. Prueba más tarde.',
  'permission-denied':'Firestore rechazó el permiso. Revisa authorized_users y sus reglas.',
  'unavailable':'No fue posible conectar a Firebase. Comprueba internet.'
 };
 return known[e?.code]||e?.message||'No fue posible acceder con Firebase.';
}
async function signInFirebase(email,password){
 const client=await firebaseClient();
 const credential=await client.authSDK.signInWithEmailAndPassword(client.auth,email,password);
 try{
  const identity=await authorizedIdentity(client,credential.user);
  // Sólo tras validar el perfil del servidor se sustituye la sesión local.
  if(PILOT)sessionStorage.setItem(PILOT_PREFER,'1');
  else localStorage.removeItem(SESSION);
  localStorage.removeItem(REMOTE_PAUSED);
  return identity;
 }catch(e){await client.authSDK.signOut(client.auth).catch(()=>{});throw e}
}
async function restoreFirebase(){
 if(localStorage.getItem(REMOTE_PAUSED)==='1')return;
 try{
  const client=await firebaseClient();
  const user=await firebaseInitialUser(client);
  if(!user||activeUser||(getLocalUser()&&!preferRemoteInPilot()))return;
  const identity=await authorizedIdentity(client,user);
  if(!activeUser&&(!getLocalUser()||preferRemoteInPilot()))showAuthenticated(identity);
 }catch(e){
  // El login local siempre permanece disponible durante esta fase de transición.
  console.info('Gestark: inicio Firebase no disponible:',errorMessage(e));
 }
}
async function loggedOut(){
 localStorage.removeItem(SESSION);
 // Evita que un inicio Firebase anterior vuelva a abrir la sesión tras pulsar Salir.
 localStorage.setItem(REMOTE_PAUSED,'1');
 try{const client=await firebaseClient();await client.authSDK.signOut(client.auth)}catch(e){console.info('Gestark: salida Firebase aplazada:',e?.message)}
 window.location.href='./';
}

function injectStyle(){
 const style=document.createElement('style');style.textContent=`
html:not(.gestark-unlocked) body>*:not(#gestark-login):not(noscript){display:none!important}
#gestark-login{min-height:100dvh;display:flex;align-items:center;justify-content:center;background:linear-gradient(155deg,#0d3d37,#106b59);padding:24px 18px;font-family:system-ui,-apple-system,sans-serif;color:#203d38}
.ga-card{width:100%;max-width:390px;text-align:center;background:#fff;border-radius:25px;padding:30px 24px 27px;box-shadow:0 18px 45px #001f1a35}
.ga-logo{width:73px;height:73px;object-fit:cover;border-radius:18px}.ga-title{font-size:28px;font-weight:800;letter-spacing:-.8px;margin-top:10px}.ga-sub{font-size:13px;color:#6a7f78;margin-top:2px}
.ga-form{text-align:left;margin-top:27px;display:grid;gap:9px}.ga-form[hidden]{display:none}.ga-form label{font-size:12px;font-weight:740;color:#3d6559}.ga-form input{width:100%;min-height:47px;border:1px solid #d6e4df;border-radius:11px;padding:12px;font-size:16px;background:#f8fbfa;color:#173b33;outline-offset:2px}
.ga-form button,.ga-action{margin-top:9px;min-height:45px;border-radius:11px;border:0;background:#137a59;color:white;font:750 15px system-ui,sans-serif;cursor:pointer;padding:10px}.ga-form button:disabled,.ga-action:disabled{opacity:.6}.ga-err{min-height:19px;color:#b72828;font-size:12px}.ga-foot{font-size:11px;color:#6d827b;margin-top:14px;line-height:1.5}
.ga-switch{background:#eaf5ee;color:#146b4f;width:100%;min-height:39px;border:0;border-radius:9px;margin-top:14px;font:700 12px system-ui,sans-serif;cursor:pointer}.ga-switch:focus-visible,.ga-form input:focus-visible,.ga-form button:focus-visible{outline:3px solid #83d9ba;outline-offset:2px}
.gestark-account-bar{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;max-width:790px;margin:0 auto;padding:11px 18px;background:#e7f3ed;color:#1b5848;font:600 12px system-ui,sans-serif}.gestark-account-bar strong{font-weight:800}.gestark-account-buttons{display:flex;gap:12px;align-items:center}.gestark-account-buttons a,.gestark-account-buttons button{border:0;background:none;color:#126149;text-decoration:underline;cursor:pointer;font-size:12px;font-weight:740;padding:2px}
.gestark-greeting{font-weight:700;font-size:13px;letter-spacing:0;color:#c6f6df;margin:10px 0 -5px}
.ga-modal{position:fixed;inset:0;background:#092b21bb;display:grid;place-items:center;padding:18px;z-index:99999}.ga-modal .ga-card{max-width:390px}.ga-modal .ga-form{margin-top:12px}.ga-modal-close{background:none;border:0;color:#376b58;text-decoration:underline;cursor:pointer;font-size:12px;margin-top:12px}
`;document.head.append(style);
}
function firebaseForm(form,onSuccess){
 form.addEventListener('submit',async e=>{
  e.preventDefault();const submit=form.querySelector('button[type=submit]');
  const error=form.querySelector('.ga-err');const email=form.querySelector('input[type=email]');
  const password=form.querySelector('input[type=password]');
  error.textContent='';submit.disabled=true;submit.textContent='Comprobando Firebase…';
  try{await signInFirebase(email.value.trim(),password.value);password.value='';onSuccess()}
  catch(err){error.textContent=errorMessage(err)}
  finally{submit.disabled=false;submit.textContent='Iniciar sesión con Firebase'}
 });
}
function remoteFormHTML(){
 return `<label for="ga-email">Correo de Firebase</label><input id="ga-email" type="email" autocomplete="username" required placeholder="correo@empresa.cl">
 <label for="ga-fb-pass">Contraseña de Firebase</label><input id="ga-fb-pass" type="password" autocomplete="current-password" required>
 <button type="submit">Iniciar sesión con Firebase</button><div class="ga-err" role="alert" aria-live="polite"></div>`;
}
function htmlLogin(){
 const mount=document.createElement('div');mount.id='gestark-login';
 mount.innerHTML=`<div class="ga-card"><img src="./icon-192.png" alt="" class="ga-logo"><div class="ga-title">Gestark</div>
 <div class="ga-sub">Greenbox · Acceso de trabajadores</div>
 <form class="ga-form" id="ga-login-form"><label for="ga-usr">Usuario</label><input id="ga-usr" autocapitalize="characters" autocomplete="username" spellcheck="false" required placeholder="Ej. CIBC" maxlength="30">
 <label for="ga-pass">Contraseña</label><input id="ga-pass" type="password" autocomplete="current-password" required placeholder="Ingresa tu contraseña">
 <button type="submit">Iniciar sesión</button><div class="ga-err" role="alert" aria-live="polite"></div></form>
 <form class="ga-form" id="ga-fb-form" hidden>${remoteFormHTML()}</form>
 <button class="ga-switch" type="button" id="ga-toggle">Acceder con correo Firebase</button>
 <div class="ga-foot">El acceso local seguirá disponible durante la prueba de Firebase.</div></div>`;
 document.body.append(mount);
 const localForm=mount.querySelector('#ga-login-form');
 const fbForm=mount.querySelector('#ga-fb-form');
 mount.querySelector('#ga-toggle').addEventListener('click',e=>{
  const toFirebase=fbForm.hidden;
  fbForm.hidden=!toFirebase;localForm.hidden=toFirebase;
  e.currentTarget.textContent=toFirebase?'Usar usuario anterior':'Acceder con correo Firebase';
  (toFirebase?fbForm:localForm).querySelector('input').focus();
 });
 localForm.addEventListener('submit',async e=>{
  e.preventDefault();const btn=localForm.querySelector('button[type=submit]');btn.disabled=true;btn.textContent='Comprobando…';
  const err=localForm.querySelector('.ga-err');err.textContent='';
  try{
   const u=getById(localForm.querySelector('#ga-usr').value);
   const pass=localForm.querySelector('#ga-pass').value;
   if(!u||!u.enabled||await derive(pass,u.salt,u.iterations)!==u.hash){err.textContent='Usuario o contraseña incorrectos.';return}
   saveSession(u);window.location.reload();
  }catch(ex){err.textContent=ex.message||'No fue posible iniciar sesión.'}
  finally{btn.disabled=false;btn.textContent='Iniciar sesión'}
 });
 firebaseForm(fbForm,()=>window.location.reload());
}
function showFirebaseModal(){
 if(document.querySelector('.ga-modal'))return;
 const cover=document.createElement('div');cover.className='ga-modal';cover.setAttribute('role','dialog');cover.setAttribute('aria-modal','true');cover.setAttribute('aria-label','Cambiar acceso a Firebase');
 const card=document.createElement('div');card.className='ga-card';
 const heading=document.createElement('div');heading.className='ga-title';heading.textContent='Activar acceso Firebase';
 const description=document.createElement('p');description.className='ga-foot';description.textContent='Usa la cuenta de Firebase autorizada. El acceso anterior se conservará hasta comprobar el cambio.';
 const form=document.createElement('form');form.className='ga-form';form.innerHTML=remoteFormHTML();
 const close=document.createElement('button');close.type='button';close.className='ga-modal-close';close.textContent='Cancelar';close.onclick=()=>cover.remove();
 card.append(heading,description,form,close);cover.append(card);document.body.append(cover);
 cover.addEventListener('click',e=>{if(e.target===cover)cover.remove()});
 firebaseForm(form,()=>window.location.reload());form.querySelector('input').focus();
}
function addBar(user){
 const bar=document.createElement('section');bar.className='gestark-account-bar';bar.setAttribute('aria-label','Sesión de Gestark');
 const name=document.createElement('span');name.textContent='Sesión: ';
 const bold=document.createElement('strong');bold.textContent=user.name;name.append(bold,document.createTextNode(user.provider==='firebase'?' · Firebase':' · Local (temporal)'));bar.append(name);
 const opts=document.createElement('div');opts.className='gestark-account-buttons';
 if(user.role==='admin'){
  const a=document.createElement('a');a.href='./admin.html';
  a.textContent=user.provider==='firebase'?'Usuarios locales':'Administrar';opts.append(a);
 }
 if(user.provider==='local'){
  const activate=document.createElement('button');activate.type='button';activate.textContent='Usar Firebase';activate.onclick=showFirebaseModal;opts.append(activate);
 }
 const logout=document.createElement('button');logout.type='button';logout.textContent='Salir';logout.onclick=()=>{void loggedOut()};opts.append(logout);
 bar.append(opts);document.body.prepend(bar);
 const hdr=document.querySelector('.header-inner .brand')||document.querySelector('header.hero .brand');
 if(hdr){const greeting=document.createElement('div');greeting.className='gestark-greeting';greeting.textContent='Bienvenido/a, '+user.name;hdr.insertAdjacentElement('afterend',greeting)}
}
function showAuthenticated(user){
 if(activeUser)return;
 activeUser=user;
 const login=document.getElementById('gestark-login');if(login)login.remove();
 if(window.location.pathname.endsWith('/admin.html')&&user.role!=='admin'){
  document.body.textContent='';const box=document.createElement('div');box.style.cssText='padding:40px;font-family:system-ui';
  box.textContent='No tienes permiso para administrar usuarios. ';
  const link=document.createElement('a');link.href='./';link.textContent='Volver a Gestark';box.append(link);document.body.append(box);
  document.documentElement.classList.add('gestark-unlocked');return;
 }
 document.documentElement.classList.add('gestark-unlocked');
 addBar(user);
 document.dispatchEvent(new CustomEvent('gestark:ready',{detail:user}));
}
function init(){
 injectStyle();
 const user=getLocalUser();
 if(user&&!preferRemoteInPilot()){showAuthenticated(user);return}
 htmlLogin();
 void restoreFirebase();
}
window.GestarkAuth={users,getUser,getById,logout:loggedOut,derive,makeVerifier,localSave,overrides,baseUsers,saveSession,
 firebaseStatus:()=>activeUser?.provider||'not-ready'};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
