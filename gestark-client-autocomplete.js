/* Gestark v25 · Predictor opcional para Entregas clientes y Transferencias.
 * Lee contactos del Directorio en Firestore, sin modificarlos ni copiarlos a localStorage.
 * Encuentra nombre principal y alternativo; al seleccionar usa el principal.
 * Escribir manualmente continua disponible, incluso sin conexion al Directorio.
 */
(()=>{
'use strict';
if(!/(?:\/entregas-clientes|\/notas-transferencias)\.html$/.test(location.pathname))return;
if(window.__gestarkClientAutocompleteLoaded)return;
window.__gestarkClientAutocompleteLoaded=true;
const SDK='https://www.gstatic.com/firebasejs/12.11.0/';
const COLLECTION='gestark_directorio_clientes_v1';
const input=document.getElementById('client');
if(!input)return;
const normalize=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-CL').replace(/\s+/g,' ').trim();
const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
let started=false,contacts=[],ready=false,active=-1,items=[],visible=false,unsubscribe=null,suppressInput=false;
const list=document.createElement('div');
list.id='gs-client-predict-list';list.className='gs-client-predict-list';
list.setAttribute('role','listbox');
list.setAttribute('aria-label','Clientes sugeridos desde el Directorio');
list.hidden=true;
const style=document.createElement('style');
style.textContent=[
 '.gs-client-predict-list{position:fixed;z-index:2147483000;background:#fff;border:1px solid #bdd7c6;border-radius:13px;box-shadow:0 13px 32px #153d2a35;overflow:auto;overscroll-behavior:contain;max-height:270px;padding:4px;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#173d2c}',
 '.gs-client-predict-list[hidden]{display:none!important}',
 '.gs-client-predict-option{display:block;box-sizing:border-box;width:100%;border:0;background:#fff;text-align:left;padding:10px 12px;border-radius:9px;cursor:pointer;min-height:48px;color:#164c35}',
 '.gs-client-predict-option:hover,.gs-client-predict-option.is-active{background:#e7f5ec}',
 '.gs-client-predict-main{display:block;font-size:14px;font-weight:760;line-height:1.3;overflow-wrap:anywhere}',
 '.gs-client-predict-alt{display:block;font-size:12px;color:#5e7a68;margin-top:2px;overflow-wrap:anywhere}',
 '.gs-client-predict-empty{padding:11px 12px;font-size:12px;color:#647b6e}',
 '.gs-client-predict-help{font-size:11px;color:#738879;margin:5px 0 0;line-height:1.35}'
].join('');
document.head.append(style);document.body.append(list);
input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');
input.setAttribute('aria-controls',list.id);input.setAttribute('aria-expanded','false');
input.setAttribute('autocomplete','off');
const hint=document.createElement('p');hint.className='gs-client-predict-help';
hint.textContent='Busca por nombre o alias del Directorio, o escribe manualmente.';
input.insertAdjacentElement('afterend',hint);
function close(){
 visible=false;active=-1;items=[];list.hidden=true;list.replaceChildren();
 input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');
}
function position(){
 if(!visible)return;
 const rect=input.getBoundingClientRect(),width=Math.max(160,Math.min(rect.width,innerWidth-16));
 list.style.left=Math.max(8,Math.min(rect.left,innerWidth-width-8))+'px';
 list.style.width=width+'px';
 if(innerHeight-rect.bottom<180&&rect.top>220){
  list.style.bottom=Math.max(8,innerHeight-rect.top+4)+'px';
  list.style.top='auto';list.style.maxHeight=Math.min(260,Math.max(120,rect.top-18))+'px';
 }else{
  list.style.top=Math.max(8,rect.bottom+4)+'px';
  list.style.bottom='auto';list.style.maxHeight=Math.min(270,Math.max(100,innerHeight-rect.bottom-12))+'px';
 }
}
function score(c,q){
 const n=c.searchName,a=c.searchAlias;
 if(n===q)return 0;if(a===q)return 1;
 if(n.startsWith(q))return 2;if(a.startsWith(q))return 3;
 if(n.split(' ').some(w=>w.startsWith(q)))return 4;
 if(a.split(' ').some(w=>w.startsWith(q)))return 5;
 if(n.includes(q))return 6;if(a.includes(q))return 7;
 return 100;
}
function select(contact){
 input.value=contact.nombre.slice(0,input.maxLength>0?input.maxLength:80);
 // En Entregas, el evento input guarda el nombre en el borrador existente.
 // Evitar volver a mostrar la lista durante este evento programatico.
 suppressInput=true;
 input.dispatchEvent(new Event('input',{bubbles:true}));
 input.dispatchEvent(new Event('change',{bubbles:true}));
 suppressInput=false;
 input.focus();close();
}
function activate(index){
 active=index;const buttons=[...list.querySelectorAll('[role="option"]')];
 buttons.forEach((b,i)=>{b.classList.toggle('is-active',i===active);b.setAttribute('aria-selected',String(i===active))});
 if(active>=0&&buttons[active]){
  input.setAttribute('aria-activedescendant',buttons[active].id);
  buttons[active].scrollIntoView({block:'nearest'});
 }else input.removeAttribute('aria-activedescendant');
}
function render(){
 if(suppressInput)return;
 const q=normalize(input.value);
 if(!ready||document.activeElement!==input||!q){close();return}
 const ranked=contacts.map(c=>({c,rank:score(c,q)})).filter(x=>x.rank<100);
 ranked.sort((a,b)=>a.rank-b.rank||a.c.nombre.localeCompare(b.c.nombre,'es-CL'));
 items=ranked.slice(0,7).map(x=>x.c);active=-1;list.replaceChildren();
 if(items.length){
  items.forEach((c,i)=>{
   const b=document.createElement('button');b.type='button';b.id='gs-client-option-'+i;
   b.className='gs-client-predict-option';b.setAttribute('role','option');b.setAttribute('aria-selected','false');
   const main=document.createElement('span');main.className='gs-client-predict-main';main.textContent=c.nombre;b.append(main);
   if(c.nombreAlternativo&&normalize(c.nombreAlternativo)!==normalize(c.nombre)){
    const alt=document.createElement('span');alt.className='gs-client-predict-alt';
    alt.textContent='También: '+c.nombreAlternativo;b.append(alt);
   }
   b.addEventListener('pointerdown',e=>e.preventDefault());
   b.addEventListener('click',()=>select(c));list.append(b);
  });
 }else{
  const empty=document.createElement('div');empty.className='gs-client-predict-empty';
  empty.textContent='Sin coincidencias. Puedes continuar escribiendo manualmente.';list.append(empty);
 }
 visible=true;list.hidden=false;input.setAttribute('aria-expanded','true');position();
}
input.addEventListener('input',render);
input.addEventListener('focus',render);
input.addEventListener('keydown',e=>{
 if(e.key==='Escape'&&visible){close();e.preventDefault();e.stopImmediatePropagation();return}
 if(e.key==='Tab'){close();return}
 if((e.key==='ArrowDown'||e.key==='ArrowUp')&&visible&&items.length){
  e.preventDefault();e.stopImmediatePropagation();
  activate(e.key==='ArrowDown'?(active+1)%items.length:(active<=0?items.length-1:active-1));return;
 }
 if(e.key==='Enter'&&visible&&active>=0&&items[active]){
  e.preventDefault();e.stopImmediatePropagation();select(items[active]);
 }
},true);
input.addEventListener('blur',()=>setTimeout(()=>{
 if(document.activeElement!==input)close();
},170));
document.addEventListener('pointerdown',e=>{
 if(visible&&e.target!==input&&!list.contains(e.target))close();
},true);
window.addEventListener('resize',position);
document.addEventListener('scroll',position,true);
document.addEventListener('gestark:sessionlost',()=>{
 unsubscribe?.();unsubscribe=null;contacts=[];ready=false;close();
});
async function loadConfig(){
 if(window.GestarkFirebaseConfig)return window.GestarkFirebaseConfig;
 return new Promise((resolve,reject)=>{
  const s=document.createElement('script');s.src='./gestark-firebase-config.js';
  s.onload=()=>resolve(window.GestarkFirebaseConfig);
  s.onerror=()=>reject(Error('No se pudo cargar configuración Firebase'));
  document.head.append(s);
 });
}
async function start(identity){
 if(started||identity?.provider!=='firebase'||!identity.uid)return;
 started=true;
 try{
  const cfg=await loadConfig();if(!cfg?.enabled)throw Error('Firebase no habilitado');
  const [apps,authSDK,fs]=await Promise.all([
   import(SDK+'firebase-app.js'),import(SDK+'firebase-auth.js'),import(SDK+'firebase-firestore.js')
  ]);
  const app=apps.getApps().find(a=>a.name==='[DEFAULT]')||apps.initializeApp(cfg);
  const auth=authSDK.getAuth(app);await auth.authStateReady();
  if(auth.currentUser?.uid!==identity.uid)throw Error('Sesión Firebase no coincide');
  const db=fs.getFirestore(app);
  unsubscribe=fs.onSnapshot(fs.collection(db,COLLECTION),snapshot=>{
   contacts=snapshot.docs.map(doc=>{
    const x=doc.data(),nombre=clean(x.nombre),nombreAlternativo=clean(x.nombreAlternativo);
    return {nombre,nombreAlternativo,searchName:normalize(nombre),searchAlias:normalize(nombreAlternativo)};
   }).filter(c=>c.nombre);
   ready=true;if(document.activeElement===input)render();
  },err=>{
   ready=false;close();
   console.warn('Gestark: predictor no disponible; ingreso manual operativo',err?.code||err?.message);
  });
 }catch(err){
  ready=false;close();
  console.warn('Gestark: sugerencias no disponibles; ingreso manual operativo',err?.message||err);
 }
}
document.addEventListener('gestark:ready',e=>void start(e.detail));
const existing=window.GestarkAuth?.getUser?.();
if(existing)void start(existing);
})();
