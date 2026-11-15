/* Gestark · acceso local simple para GitHub Pages (no autenticación de servidor). */
(()=>{
'use strict';
const SESSION='gestark:session:v1',OVERRIDES='gestark:users:overrides:v1';
const cleanName=x=>String(x||'').trim().replace(/\s+/g,' ').slice(0,80);
const normalized=x=>String(x||'').toUpperCase().trim();
const hexToBytes=h=>new Uint8Array((h.match(/.{2}/g)||[]).map(i=>parseInt(i,16)));
const bytesToHex=u=>Array.from(u,b=>b.toString(16).padStart(2,'0')).join('');
const baseUsers=Array.isArray(window.GESTARK_USERS)?window.GESTARK_USERS:[];
function overrides(){try{const d=JSON.parse(localStorage.getItem(OVERRIDES)||'{}');return d&&typeof d==='object'&&!Array.isArray(d)?d:{}}catch{return {}}}
function users(){const a=new Map();baseUsers.forEach(u=>a.set(u.username,u));Object.values(overrides()).forEach(u=>{if(u&&u.username)a.set(u.username,u)});return [...a.values()].sort((a,b)=>a.role==='admin'?-1:b.role==='admin'?1:a.username.localeCompare(b.username));}
function getById(id){return users().find(u=>u.username===normalized(id))||null}
function getSession(){try{return JSON.parse(localStorage.getItem(SESSION)||'null')}catch{return null}}
function getUser(){const s=getSession();if(!s)return null;const u=getById(s.username);if(!u||!u.enabled||s.sig!==u.hash)return null;return {username:u.username,name:u.name,role:u.role};}
function loggedOut(){try{localStorage.removeItem(SESSION)}catch{}window.location.href='./';}
async function derive(password,salt,iterations){if(!window.crypto?.subtle)throw new Error('Necesitas abrir Gestark mediante HTTPS desde GitHub Pages.');const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:hexToBytes(salt),iterations:iterations||120000,hash:'SHA-256'},key,256);return bytesToHex(new Uint8Array(bits));}
async function makeVerifier(password){const salt=bytesToHex(crypto.getRandomValues(new Uint8Array(16))),iterations=120000;return {salt,iterations,hash:await derive(password,salt,iterations)};}
function localSave(user){const d=overrides();d[user.username]=user;localStorage.setItem(OVERRIDES,JSON.stringify(d));}
function saveSession(user){localStorage.setItem(SESSION,JSON.stringify({username:user.username,sig:user.hash}));}
function htmlLogin(){
 const mount=document.createElement('div');mount.id='gestark-login';mount.innerHTML=`<div class="ga-card">
 <img src="./icon-192.png" alt="" class="ga-logo">
 <div class="ga-title">Gestark</div><div class="ga-sub">Greenbox · Acceso de trabajadores</div>
 <form class="ga-form" id="ga-login-form"><label for="ga-usr">Usuario</label><input id="ga-usr" autocapitalize="characters" autocomplete="username" spellcheck="false" required placeholder="Ej. CIBC" maxlength="30">
 <label for="ga-pass">Contraseña</label><input id="ga-pass" type="password" autocomplete="current-password" required placeholder="Ingresa tu contraseña">
 <button id="ga-submit" type="submit">Iniciar sesión</button><div class="ga-err" id="ga-error" role="alert" aria-live="polite"></div></form>
 <div class="ga-foot">Mantendremos tu sesión iniciada en este dispositivo.</div></div>`;
 document.body.append(mount);const form=mount.querySelector('#ga-login-form');
 form.addEventListener('submit',async e=>{
 e.preventDefault();const btn=mount.querySelector('#ga-submit');btn.disabled=true;btn.textContent='Comprobando…';
 const err=mount.querySelector('#ga-error');err.textContent='';
 try{const u=getById(mount.querySelector('#ga-usr').value);const pass=mount.querySelector('#ga-pass').value;
 if(!u||!u.enabled||await derive(pass,u.salt,u.iterations)!==u.hash){err.textContent='Usuario o contraseña incorrectos.';return}
 saveSession(u);window.location.reload();
 }catch(ex){err.textContent=ex.message||'No fue posible iniciar sesión.'}finally{btn.disabled=false;btn.textContent='Iniciar sesión'}
 });
}
function injectStyle(){const style=document.createElement('style');style.textContent=`
html:not(.gestark-unlocked) body>*:not(#gestark-login):not(noscript){display:none!important}
#gestark-login{min-height:100dvh;display:flex;align-items:center;justify-content:center;background:linear-gradient(155deg,#0d3d37,#106b59);padding:24px 18px;font-family:system-ui,-apple-system,sans-serif;color:#203d38}
.ga-card{width:100%;max-width:390px;text-align:center;background:#fff;border-radius:25px;padding:30px 24px 27px;box-shadow:0 18px 45px #001f1a35}
.ga-logo{width:73px;height:73px;object-fit:cover;border-radius:18px}
.ga-title{font-size:28px;font-weight:800;letter-spacing:-.8px;margin-top:10px}.ga-sub{font-size:13px;color:#6a7f78;margin-top:2px}
.ga-form{text-align:left;margin-top:27px;display:grid;gap:9px}.ga-form label{font-size:12px;font-weight:740;color:#3d6559}.ga-form input{width:100%;min-height:47px;border:1px solid #d6e4df;border-radius:11px;padding:12px;font-size:16px;background:#f8fbfa;color:#173b33;outline-offset:2px}
.ga-form button{margin-top:9px;min-height:47px;border-radius:11px;border:0;background:#137a59;color:white;font-size:15px;font-weight:750;cursor:pointer}.ga-form button:disabled{opacity:.6}
.ga-err{min-height:19px;color:#b72828;font-size:12px}.ga-foot{font-size:11px;color:#6d827b;margin-top:14px;line-height:1.5}
.gestark-account-bar{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;max-width:790px;margin:0 auto;padding:11px 18px;background:#e7f3ed;color:#1b5848;font:600 12px system-ui,sans-serif}
.gestark-account-bar strong{font-weight:800}.gestark-account-buttons{display:flex;gap:12px;align-items:center}
.gestark-account-buttons a,.gestark-account-buttons button{border:0;background:none;color:#126149;text-decoration:underline;cursor:pointer;font-size:12px;font-weight:740;padding:2px}
.gestark-greeting{font-weight:700;font-size:13px;letter-spacing:0;color:#c6f6df;margin:10px 0 -5px}
`;document.head.append(style)}
function addBar(user){const bar=document.createElement('section');bar.className='gestark-account-bar';bar.setAttribute('aria-label','Sesión de Gestark');const name=document.createElement('span');name.textContent='Sesión: ';const bold=document.createElement('strong');bold.textContent=user.name;name.append(bold);bar.append(name);
 const opts=document.createElement('div');opts.className='gestark-account-buttons';
 if(user.role==='admin'){const a=document.createElement('a');a.href='./admin.html';a.textContent='Administrar';opts.append(a)}
 const logout=document.createElement('button');logout.type='button';logout.textContent='Salir';logout.onclick=loggedOut;opts.append(logout);bar.append(opts);document.body.prepend(bar);
 const hdr=document.querySelector('.header-inner .brand')||document.querySelector('header.hero .brand');
 if(hdr){const greeting=document.createElement('div');greeting.className='gestark-greeting';greeting.textContent='Bienvenido/a, '+user.name;hdr.insertAdjacentElement('afterend',greeting)}
}
function init(){injectStyle();const u=getUser();if(!u){htmlLogin();return}if(window.location.pathname.endsWith('/admin.html')&&u.role!=='admin'){document.body.textContent='';const box=document.createElement('div');box.style.cssText='padding:40px;font-family:system-ui';box.textContent='No tienes permiso para administrar usuarios. ';const a=document.createElement('a');a.href='./';a.textContent='Volver a Gestark';box.append(a);document.body.append(box);document.documentElement.classList.add('gestark-unlocked');return}
 document.documentElement.classList.add('gestark-unlocked');addBar(u);document.dispatchEvent(new CustomEvent('gestark:ready',{detail:u}));}
window.GestarkAuth={users,getUser,getById,logout:loggedOut,derive,makeVerifier,localSave,overrides,baseUsers,saveSession};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();