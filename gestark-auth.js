/* Gestark · Inicio de sesión 100% Firebase Auth · 2026.11.22.5
 * No verifica contraseñas locales ni lee usuarios.js.
 * Requiere la cuenta de Authentication Y authorized_users/{uid} activo.
 * El correo se utiliza solo para iniciar sesión con Firebase.
 * No contiene contraseñas ni credenciales administrativas.
 */
(() => {
'use strict';
const SDK = 'https://www.gstatic.com/firebasejs/12.11.0/';
const OLD_SESSION = 'gestark:session:v1';
const OLD_OVERRIDES = 'gestark:users:overrides:v1';
const OLD_PAUSE = 'gestark:firebase:automatic-login-paused:v1';
const usernameRE = /^[A-Z0-9_-]{2,30}$/;
let activeUser = null;
let clientPromise = null;
let screen = null;
const $ = selector => screen?.querySelector(selector) || null;

function cleanName(value) { return String(value || '').trim().replace(/\s+/g,' ').slice(0,80); }
function clearOldLocalCredentials() {
  try {
    localStorage.removeItem(OLD_SESSION);
    localStorage.removeItem(OLD_OVERRIDES);
    localStorage.removeItem(OLD_PAUSE);
    sessionStorage.removeItem('gestark:firebase:pilot-prefer:v1');
  } catch (_) { /* El navegador puede tener almacenamiento restringido. */ }
}
function loadConfig() {
  if (window.GestarkFirebaseConfig) return Promise.resolve(window.GestarkFirebaseConfig);
  return new Promise((resolve,reject) => {
    const script = document.createElement('script');
    script.src = './gestark-firebase-config.js?v=2026.11.21.43';
    script.onload = () => window.GestarkFirebaseConfig
      ? resolve(window.GestarkFirebaseConfig)
      : reject(Error('No se encontró la configuración Firebase.'));
    script.onerror = () => reject(Error('No se pudo cargar Firebase. Comprueba tu conexión.'));
    document.head.append(script);
  });
}
async function firebaseClient() {
  if (!clientPromise) clientPromise = (async () => {
    const cfg = await loadConfig();
    if (cfg.enabled !== true || !cfg.apiKey || !cfg.authDomain || !cfg.projectId || !cfg.appId)
      throw Error('La configuración Firebase está incompleta.');
    const [appSDK, authSDK, dbSDK] = await Promise.all([
      import(SDK + 'firebase-app.js'),
      import(SDK + 'firebase-auth.js'),
      import(SDK + 'firebase-firestore.js')
    ]);
    const app = appSDK.getApps().find(a => a.name === '[DEFAULT]') || appSDK.initializeApp({
      apiKey:cfg.apiKey,authDomain:cfg.authDomain,projectId:cfg.projectId,
      appId:cfg.appId,messagingSenderId:cfg.messagingSenderId,storageBucket:cfg.storageBucket
    });
    const auth = authSDK.getAuth(app);
    const db = dbSDK.getFirestore(app);
    await authSDK.setPersistence(auth,authSDK.browserLocalPersistence);
    return {auth,db,authSDK,dbSDK};
  })();
  try { return await clientPromise; }
  catch (error) { clientPromise = null; throw error; }
}
function errorMessage(error) {
  const messages = {
    'auth/invalid-credential': 'Correo o contraseña incorrectos.',
    'auth/invalid-email': 'Revisa el correo electrónico.',
    'auth/user-disabled': 'Esta cuenta está desactivada.',
    'auth/too-many-requests': 'Demasiados intentos. Inténtalo más tarde.',
    'auth/network-request-failed': 'Sin conexión. Comprueba internet.',
    'auth/missing-email': 'Escribe tu correo de Firebase.',
    'permission-denied': 'No tienes permiso para entrar. Consulta al administrador.',
    'unavailable': 'No se pudo contactar a Firebase. Comprueba internet.'
  };
  return messages[error?.code] || error?.message || 'No fue posible iniciar sesión.';
}
async function authorizedIdentity(client, firebaseUser) {
  if (!firebaseUser) throw Error('Debes iniciar sesión con Firebase.');
  // No autorizar perfiles locales ni perfiles solo en caché del navegador.
  const ref = client.dbSDK.doc(client.db, 'authorized_users', firebaseUser.uid);
  const snap = await client.dbSDK.getDocFromServer(ref);
  const profile = snap.exists() ? snap.data() : null;
  if (!profile || profile.active !== true || !['admin','user'].includes(profile.role)
      || !usernameRE.test(String(profile.username || '')))
    throw Error('Tu cuenta no está autorizada en Gestark.');
  return {
    username:profile.username,
    name:cleanName(profile.name) || profile.username,
    role:profile.role,
    provider:'firebase',
    uid:firebaseUser.uid
  };
}
function css() {
  const style = document.createElement('style');
  style.textContent = `
html:not(.gestark-unlocked) body>*:not(#gestark-login):not(noscript){display:none!important}
#gestark-login{min-height:100dvh;display:flex;align-items:center;justify-content:center;background:linear-gradient(155deg,#0d3d37,#106b59);padding:24px 18px;font-family:system-ui,-apple-system,sans-serif;color:#203d38;position:relative;z-index:99999}
.ga-card{width:100%;max-width:390px;text-align:center;background:#fff;border-radius:25px;padding:30px 24px 27px;box-shadow:0 18px 45px #001f1a35}
.ga-logo{width:73px;height:73px;object-fit:cover;border-radius:18px}.ga-title{font-size:28px;font-weight:800;letter-spacing:-.8px;margin-top:10px}.ga-sub{font-size:13px;color:#6a7f78;margin-top:2px}
.ga-form{text-align:left;margin-top:25px;display:grid;gap:9px}.ga-form[hidden]{display:none}.ga-form label{font-size:12px;font-weight:740;color:#3d6559}.ga-form input{width:100%;min-height:47px;border:1px solid #d6e4df;border-radius:11px;padding:12px;font-size:16px;background:#f8fbfa;color:#173b33;outline-offset:2px}
.ga-form button,.ga-button{margin-top:9px;min-height:45px;border-radius:11px;border:0;background:#137a59;color:#fff;font:750 15px system-ui,sans-serif;cursor:pointer;padding:10px}.ga-form button:disabled,.ga-button:disabled{opacity:.6}.ga-err{min-height:19px;color:#b72828;font-size:12px}.ga-foot{font-size:11px;color:#6d827b;margin-top:14px;line-height:1.5}
.ga-link{margin-top:12px;border:0;background:none;color:#146b4f;font:700 12px system-ui,sans-serif;text-decoration:underline;cursor:pointer;min-height:30px}
.gestark-account-bar{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;max-width:790px;margin:0 auto;padding:11px 18px;background:#e7f3ed;color:#1b5848;font:600 12px system-ui,sans-serif}.gestark-account-bar strong{font-weight:800}.gestark-account-buttons{display:flex;gap:12px;align-items:center}.gestark-account-buttons a,.gestark-account-buttons button{border:0;background:none;color:#126149;text-decoration:underline;cursor:pointer;font-size:12px;font-weight:740;padding:2px}
.gestark-greeting{font-weight:700;font-size:13px;letter-spacing:0;color:#c6f6df;margin:10px 0 -5px}
.ga-spinner[hidden]{display:none}.ga-spinner{width:29px;height:29px;display:block;margin:15px auto 11px;border:3px solid #d0eadd;border-top-color:#137a59;border-radius:50%;animation:ga-wait-spin 1s linear infinite}
@keyframes ga-wait-spin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.ga-spinner{animation:none}}
`;document.head.append(style);
}
function mountShell() {
  screen = document.createElement('div');
  screen.id = 'gestark-login';
  screen.innerHTML = `<div class="ga-card">
    <img class="ga-logo" src="./icon-192.png" alt="">
    <div class="ga-title">Gestark</div>
    <div class="ga-sub">Greenbox · Acceso de trabajadores</div>
    <div class="ga-spinner" aria-hidden="true"></div>
    <div class="ga-sub" id="ga-loading" role="status">Verificando sesión segura…</div>
    <form class="ga-form" id="ga-form" autocomplete="on" hidden>
      <label for="ga-email">Correo de Firebase</label>
      <input id="ga-email" type="email" autocomplete="username" inputmode="email" placeholder="correo@empresa.cl" required>
      <label for="ga-pass">Contraseña</label>
      <input id="ga-pass" type="password" autocomplete="current-password" required>
      <button type="submit" id="ga-submit">Iniciar sesión</button>
      <div class="ga-err" id="ga-error" role="alert" aria-live="polite"></div>
    </form>
    <button type="button" class="ga-link" id="ga-reset" hidden>¿Olvidaste tu contraseña?</button>
    <div class="ga-foot" id="ga-foot" hidden>Acceso protegido con Firebase Authentication.</div>
  </div>`;
  document.body.append(screen);
  $('#ga-form').addEventListener('submit',handleSubmit);
  $('#ga-reset').addEventListener('click',resetPassword);
}
function showLogin(message='') {
  if (!screen) return;
  $('.ga-spinner').hidden = true;
  $('#ga-loading').hidden = true;
  $('#ga-form').hidden = false;
  $('#ga-reset').hidden = false;
  $('#ga-foot').hidden = false;
  $('#ga-error').textContent = message;
}
async function handleSubmit(event) {
  event.preventDefault();
  const button=$('#ga-submit');
  button.disabled = true;
  $('#ga-error').textContent='';
  button.textContent='Comprobando Firebase…';
  const email=$('#ga-email').value.trim();
  const password=$('#ga-pass').value;
  try {
    const client=await firebaseClient();
    const credentials=await client.authSDK.signInWithEmailAndPassword(client.auth,email,password);
    const profile=await authorizedIdentity(client,credentials.user);
    $('#ga-pass').value='';
    showAuthenticated(profile);
  } catch (error) {
    $('#ga-pass').value='';
    $('#ga-error').textContent=errorMessage(error);
    // Si el inicio de sesión se completó pero falta el perfil, evitar dejar un usuario no autorizado.
    try {
      const client=await firebaseClient();
      if(client.auth.currentUser)await client.authSDK.signOut(client.auth);
    } catch (_) {}
  } finally {
    button.disabled=false;
    button.textContent='Iniciar sesión';
  }
}
async function resetPassword() {
  const email=$('#ga-email')?.value.trim() || '';
  if(!email){$('#ga-error').textContent='Escribe primero tu correo Firebase.';return;}
  try {
    const client=await firebaseClient();
    await client.authSDK.sendPasswordResetEmail(client.auth,email);
    $('#ga-error').textContent='Si el correo está registrado, recibirás las instrucciones para restablecer la contraseña.';
  } catch (error) {$('#ga-error').textContent=errorMessage(error);}
}
async function logOut() {
  activeUser = null;
  clearOldLocalCredentials();
  try {const client=await firebaseClient();await client.authSDK.signOut(client.auth);} catch (_) {}
  location.href='./';
}
function showAuthenticated(user) {
  if (activeUser) return;
  clearOldLocalCredentials();
  activeUser = user;
  if (screen) {screen.remove();screen=null;}
  if (location.pathname.endsWith('/admin.html') && user.role!=='admin') {
    document.body.replaceChildren();
    const note = document.createElement('main');
    note.style.cssText='padding:40px;font-family:system-ui';
    note.textContent='No tienes permiso para administrar usuarios. ';
    const link=document.createElement('a');link.href='./';link.textContent='Volver a Gestark';note.append(link);
    document.body.append(note);
    document.documentElement.classList.add('gestark-unlocked');
    return;
  }
  document.documentElement.classList.add('gestark-unlocked');
  const bar=document.createElement('section');
  bar.className='gestark-account-bar';
  bar.setAttribute('aria-label','Sesión de Gestark');
  const name=document.createElement('span');
  name.append(document.createTextNode('Sesión: '));
  const strong=document.createElement('strong');strong.textContent=user.name;name.append(strong,document.createTextNode(' · Firebase'));
  bar.append(name);
  const buttons=document.createElement('div');buttons.className='gestark-account-buttons';
  if(user.role==='admin') {
    const adminLink=document.createElement('a');adminLink.href='./admin.html';adminLink.textContent='Administración Firebase';buttons.append(adminLink);
  }
  const exit=document.createElement('button');exit.type='button';exit.textContent='Salir';exit.addEventListener('click',()=>{void logOut();});buttons.append(exit);
  bar.append(buttons);document.body.prepend(bar);
  const brand=document.querySelector('.header-inner .brand')||document.querySelector('header.hero .brand');
  if (brand) {
    const greet=document.createElement('div');greet.className='gestark-greeting';
    greet.textContent='Bienvenido/a, '+user.name;
    brand.insertAdjacentElement('afterend',greet);
  }
  document.dispatchEvent(new CustomEvent('gestark:ready',{detail:user}));
}
async function start() {
  css();mountShell();
  try {
    const client=await firebaseClient();
    const firebaseUser=await new Promise((resolve,reject)=>{
      let finished=false;let unsubscribe=()=>{};
      unsubscribe=client.authSDK.onAuthStateChanged(client.auth,user=>{
        if(finished)return;finished=true;unsubscribe();resolve(user);
      },err=>{if(finished)return;finished=true;unsubscribe();reject(err);});
    });
    if (!firebaseUser) {showLogin();return;}
    const profile=await authorizedIdentity(client,firebaseUser);
    showAuthenticated(profile);
  } catch(error) {
    showLogin(errorMessage(error));
  }
}
// API mínima para compatibilidad con módulos que consultan la sesión.
window.GestarkAuth = {
  getUser:()=>activeUser,
  logout:logOut,
  firebaseStatus:()=>activeUser ? 'firebase' : 'not-ready',
  users:()=>activeUser?[activeUser]:[],
  getById:id=>activeUser?.username===String(id||'').trim().toUpperCase()?activeUser:null
};
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>{void start();},{once:true});
else void start();
})();
