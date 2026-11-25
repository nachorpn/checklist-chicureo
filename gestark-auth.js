/* Gestark · Firebase Auth + acceso por usuario (v2026.11.25.33 — acceso inicial en Inicio y sesión persistente)
 * Sin autenticar contra usuarios.js ni contraseñas locales.
 * El usuario/alias se vincula solamente DESPUES de autenticar y autorizar Firebase.
 * Las asociaciones usuario->correo se guardan SOLO en el navegador actual.
 * En un navegador nuevo se requiere correo Firebase una vez; no se publica un directorio de correos.
 */
(() => {
'use strict';
const SDK = 'https://www.gstatic.com/firebasejs/12.11.0/';
const OLD_SESSION = 'gestark:session:v1';
const OLD_OVERRIDES = 'gestark:users:overrides:v1';
const OLD_PAUSE = 'gestark:firebase:automatic-login-paused:v1';
const LOGIN_ALIAS_KEY = 'gestark:firebase:login-alias:v1';
const usernameRE = /^[A-Z0-9_-]{2,30}$/;
// El documento principal y exclusivamente el iframe Inicio pueden mostrar el acceso.
// Los demás módulos embebidos esperan que Firebase restaure la sesión existente.
function embeddedInNative() {
  try { return window.parent!==window && window.parent.location.origin===location.origin &&
    window.parent.location.pathname.endsWith('/gestark-app.html'); }
  catch (_) { return false; }
}
const EMBEDDED = embeddedInNative();
const HOME_LOGIN = EMBEDDED && window.frameElement?.id === 'frame-home';
let activeUser = null;
let clientPromise = null;
let screen = null;
let topSessionMonitor = null;
const $ = selector => screen?.querySelector(selector) || null;

function cleanName(value) { return String(value || '').trim().replace(/\s+/g,' ').slice(0,80); }

// Cache no-autoritativa: nunca autoriza usuarios; solo resuelve una dirección de correo
// para que Firebase Authentication compruebe la contraseña y Firestore valide el perfil.
function readAliases() {
  try {
    const raw=JSON.parse(localStorage.getItem(LOGIN_ALIAS_KEY) || '{}');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const result={};
    for(const [name,email] of Object.entries(raw)) {
      if(usernameRE.test(name) && typeof email==='string' &&
        email.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) result[name]=email;
    }
    return result;
  } catch(_) { return {}; }
}
function rememberAlias(profile, firebaseUser) {
  const name=String(profile?.username || '').toUpperCase();
  const email=String(firebaseUser?.email || '').trim();
  if(!usernameRE.test(name) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
  try {
    const aliases=readAliases();
    aliases[name]=email;
    localStorage.setItem(LOGIN_ALIAS_KEY,JSON.stringify(aliases));
  } catch(_) { /* En modo privado la memoria local puede estar restringida. */ }
}
function resolveEmail(input) {
  const value=String(input || '').trim();
  if(value.includes('@')) return value;
  const username=value.toUpperCase();
  if(!usernameRE.test(username)) throw Error('Escribe tu usuario o correo de Firebase.');
  const email=readAliases()[username];
  if(!email) throw Error('Primera vez con '+username+' en este navegador: ingresa tu correo Firebase una vez. Después podrás usar solo '+username+'.');
  return email;
}
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
    // No reescribir IndexedDB en cada iframe. La persistencia local se configura
    // exclusivamente cuando se envía el formulario de inicio de sesión.
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
    name:(profile.role === 'admin' && String(profile.username).toUpperCase() === 'CIBC') ? 'Ignacio Burgos' : (cleanName(profile.name) || profile.username),
    role:profile.role,
    provider:'firebase',
    uid:firebaseUser.uid
  };
}
function css() {
  // Un módulo dentro de gestark-app.html nunca muestra su barra inferior;
  // la barra única pertenece al contenedor, no al iframe.
  if(EMBEDDED) document.documentElement.classList.add('gestark-native-embedded');
  const style = document.createElement('style');
  style.textContent = `
html.gestark-native-embedded .bottom-nav,html.gestark-native-embedded .gestark-account-bar{display:none!important;visibility:hidden!important}
html:not(.gestark-unlocked) body>*:not(#gestark-login):not(#gestark-native-retry):not(#gestark-native-error):not(noscript){display:none!important}
/* No se muestra el modal de verificación al entrar a cada sección. */
html.gestark-checking,html.gestark-checking body{background:#f3f7f5!important}
html.gestark-checking body::before{content:'';position:fixed;top:0;left:0;height:2px;width:32%;background:#19805d;z-index:99998;opacity:0;pointer-events:none;animation:gestark-quiet-progress 1.3s ease-in-out .45s infinite}
@keyframes gestark-quiet-progress{0%{opacity:0;transform:translateX(-110%)}20%{opacity:.7}80%{opacity:.7}100%{opacity:0;transform:translateX(340%)}}
@media(prefers-reduced-motion:reduce){html.gestark-checking body::before{animation:none}}
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
      <label for="ga-email">Usuario o correo Firebase</label>
      <input id="ga-email" type="text" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="254" placeholder="Ej.: MJXM" required>
      <label for="ga-pass">Contraseña</label>
      <input id="ga-pass" type="password" autocomplete="current-password" required>
      <button type="submit" id="ga-submit">Iniciar sesión</button>
      <div class="ga-err" id="ga-error" role="alert" aria-live="polite"></div>
    </form>
    <button type="button" class="ga-link" id="ga-reset" hidden>¿Olvidaste tu contraseña?</button>
    <div class="ga-foot" id="ga-foot" hidden>Usa tu usuario habitual. En un dispositivo nuevo, escribe tu correo Firebase una sola vez. Acceso protegido con Firebase.</div>
  </div>`;
  document.body.append(screen);
  $('#ga-form').addEventListener('submit',handleSubmit);
  $('#ga-reset').addEventListener('click',resetPassword);
}
function showLogin(message='') {
  // Construir el login solo cuando Firebase confirma que no hay sesión
  // o cuando la verificación del servidor falla.
  if (!screen) mountShell();
  $('.ga-spinner').hidden = true;
  $('#ga-loading').hidden = true;
  $('#ga-form').hidden = false;
  $('#ga-reset').hidden = false;
  $('#ga-foot').hidden = false;
  $('#ga-error').textContent = message;
  $('#ga-start-retry')?.remove();
}
async function handleSubmit(event) {
  event.preventDefault();
  const button=$('#ga-submit');
  button.disabled = true;
  $('#ga-error').textContent='';
  button.textContent='Comprobando Firebase…';
  const login=$('#ga-email').value.trim();
  const password=$('#ga-pass').value;
  try {
    const email=resolveEmail(login);
    const client=await firebaseClient();
    await client.authSDK.setPersistence(client.auth,client.authSDK.browserLocalPersistence);
    const credentials=await client.authSDK.signInWithEmailAndPassword(client.auth,email,password);
    const profile=await authorizedIdentity(client,credentials.user);
    if (!login.includes('@') && profile.username !== login.toUpperCase())
      throw Error('El usuario ingresado no coincide con la cuenta Firebase. Usa tu correo una vez para actualizar el acceso.');
    rememberAlias(profile,credentials.user);
    $('#ga-pass').value='';
    showAuthenticated(profile);
    monitorTopSession(client);
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
  const login=$('#ga-email')?.value.trim() || '';
  if(!login){$('#ga-error').textContent='Escribe tu usuario o correo Firebase.';return;}
  try {
    const email=resolveEmail(login);
    const client=await firebaseClient();
    await client.authSDK.sendPasswordResetEmail(client.auth,email);
    $('#ga-error').textContent='Si el correo está registrado, recibirás las instrucciones para restablecer la contraseña.';
  } catch (error) {$('#ga-error').textContent=errorMessage(error);}
}
function sessionLost() {
  if(!activeUser)return;
  activeUser=null;
  document.documentElement.classList.remove('gestark-unlocked');
  document.dispatchEvent(new CustomEvent('gestark:sessionlost'));
  if(!EMBEDDED)location.replace('./');
}
function monitorTopSession(client) {
  if((EMBEDDED&&!HOME_LOGIN)||topSessionMonitor)return;
  topSessionMonitor=client.authSDK.onAuthStateChanged(client.auth,user=>{
    if(activeUser && (!user || user.uid!==activeUser.uid))sessionLost();
  },error=>console.warn('Gestark: fallo observando sesión Firebase',error?.code||'sin código'));
}
async function logOut() {
  // No ocultar errores: si Firebase no confirma el cierre, el usuario debe saberlo.
  const client=await firebaseClient();
  await client.authSDK.signOut(client.auth);
  activeUser=null;
  clearOldLocalCredentials();
  document.documentElement.classList.remove('gestark-unlocked');
  document.dispatchEvent(new CustomEvent('gestark:sessionlost'));
  if(!EMBEDDED)location.href='./';
  return true;
}
function showAuthenticated(user) {
  if (activeUser) return;
  clearOldLocalCredentials();
  activeUser = user;
  // Al restablecer una sesión, no duplicar la barra ni el saludo anterior.
  document.querySelectorAll('.gestark-account-bar,.gestark-greeting').forEach(node=>node.remove());
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
  const exit=document.createElement('button');exit.type='button';exit.textContent='Salir';exit.addEventListener('click',()=>{void logOut().catch(error=>alert('No se pudo cerrar la sesión Firebase: '+errorMessage(error)));});buttons.append(exit);
  bar.append(buttons);document.body.prepend(bar);
  const brand=document.querySelector('.header-inner .brand')||document.querySelector('header.hero .brand');
  if (brand) {
    const greet=document.createElement('div');greet.className='gestark-greeting';
    greet.textContent='Bienvenido/a, '+user.name;
    brand.insertAdjacentElement('afterend',greet);
  }
  document.dispatchEvent(new CustomEvent('gestark:ready',{detail:user}));
}
// En Safari instalado los iframes pueden restaurar Firebase en distintos momentos.
// Una respuesta inicial «sin usuario» NO es una razón para pedir otra contraseña:
// se mantiene activo el observador para aceptar la sesión cuando se sincronice.
async function waitForNativeSession(client) {
  let change=0;
  let retryTimer=null;
  const retryId='gestark-native-retry';
  function clearWarning(){
    const box=document.getElementById(retryId);
    if(box)box.remove();
  }
  function warning(message){
    if(activeUser)return;
    let box=document.getElementById(retryId);
    if(!box){
      box=document.createElement('main');
      box.id=retryId;
      box.setAttribute('role','status');
      box.style.cssText='min-height:65dvh;display:flex;flex-direction:column;gap:15px;align-items:center;justify-content:center;padding:22px;text-align:center;color:#285847;background:#f3f7f5;font:600 13px/1.5 system-ui';
      const label=document.createElement('p');label.id='gestark-native-retry-message';
      const button=document.createElement('button');button.type='button';button.textContent='Reintentar conexión';
      button.style.cssText='border:0;background:#167453;color:white;border-radius:11px;padding:12px 17px;font:700 13px system-ui';
      button.addEventListener('click',()=>location.reload());
      box.append(label,button);
      document.body.append(box);
    }
    box.querySelector('#gestark-native-retry-message').textContent=message;
  }
  // Cuando Inicio no tiene sesión propia (p. ej. PWA recién instalada),
  // detener el observador antes de mostrar el acceso: handleSubmit valida
  // también el alias y el perfil antes de desbloquear cualquier dato.
  let unsub=()=>{};
  let handedOff=false;
  function offerHomeLogin(message=''){
    if(!HOME_LOGIN||activeUser||handedOff)return false;
    handedOff=true;++change;
    if(retryTimer){clearTimeout(retryTimer);retryTimer=null;}
    clearWarning();unsub();showLogin(message);return true;
  }
  unsub=client.authSDK.onAuthStateChanged(client.auth,async firebaseUser=>{
    if(handedOff)return;
    const current=++change;
    if(retryTimer){clearTimeout(retryTimer);retryTimer=null;}
    if(!firebaseUser){
      // Esperar la sincronización entre ventanas; jamás mostrar login en un módulo.
      if(activeUser)sessionLost();
      retryTimer=setTimeout(()=>{if(!offerHomeLogin())warning('No se ha podido recuperar la sesión de esta sección. Puedes reintentar sin volver a escribir tu contraseña.');},6500);
      return;
    }
    clearWarning();
    try {
      const profile=await authorizedIdentity(client,firebaseUser);
      if(current!==change)return;
      rememberAlias(profile,firebaseUser);
      showAuthenticated(profile);
      document.documentElement.classList.remove('gestark-checking');
    } catch(error) {
      if(current!==change)return;
      if(!offerHomeLogin(errorMessage(error)))warning(errorMessage(error));
    }
  },error=>{if(!offerHomeLogin(errorMessage(error)))warning(errorMessage(error));});
  window.addEventListener('pagehide',()=>{unsub();if(retryTimer)clearTimeout(retryTimer);},{once:true});
}
async function start() {
  css();
  // Cada documento HTML restaura Firebase por separado. Mantener la vista
  // cerrada hasta validar el perfil; no abrir una pantalla de login transitoria.
  document.documentElement.classList.add('gestark-checking');
  // Solo Inicio: indicar progreso si la restauración tarda, sin tocar
  // la navegación silenciosa de módulos ni la ruta rápida de sesión válida.
  if(HOME_LOGIN){
    setTimeout(()=>{if(!activeUser&&!screen)mountShell();},900);
    setTimeout(()=>{
      if(activeUser||!screen||$('#ga-loading')?.hidden)return;
      $('#ga-loading').textContent='La conexión está tardando. Puedes reintentar sin borrar tus datos.';
      const retry=document.createElement('button');retry.id='ga-start-retry';retry.type='button';retry.className='ga-link';
      retry.textContent='Reintentar conexión';retry.addEventListener('click',()=>location.reload());
      $('#ga-loading').after(retry);
    },15000);
  }
  try {
    const client=await firebaseClient();
    if(EMBEDDED){
      await waitForNativeSession(client);
      return;
    }
    const firebaseUser=await new Promise((resolve,reject)=>{
      let finished=false;let unsubscribe=()=>{};
      unsubscribe=client.authSDK.onAuthStateChanged(client.auth,user=>{
        if(finished)return;finished=true;unsubscribe();resolve(user);
      },err=>{if(finished)return;finished=true;unsubscribe();reject(err);});
    });
    if (!firebaseUser) {showLogin();return;}
    const profile=await authorizedIdentity(client,firebaseUser);
    rememberAlias(profile,firebaseUser);
    showAuthenticated(profile);
    monitorTopSession(client);
  } catch(error) {
    if(EMBEDDED&&!HOME_LOGIN) {
      // Si falla Firebase aquí, la pantalla permanece cerrada y el módulo
      // no permite operaciones. La app sigue disponible en las otras pestañas.
      const box=document.createElement('div');box.id='gestark-native-error';
      box.style.cssText='padding:25px;font:600 13px system-ui;color:#8b3333';
      box.textContent='No se pudo conectar esta sección con Firebase: '+errorMessage(error);
      document.body.append(box);
    } else showLogin(errorMessage(error));
  } finally {
    document.documentElement.classList.remove('gestark-checking');
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
