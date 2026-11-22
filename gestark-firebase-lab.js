/* Gestark · Firebase piloto v2026.11.21.43 — sin tocar datos operativos.
   Modulos de Firebase por CDN oficial. No usar credenciales de servicio en el cliente. */
import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js';
import {getAuth, setPersistence, browserLocalPersistence, onAuthStateChanged,
        signInWithEmailAndPassword, signOut} from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js';
import {getFirestore, doc, collection, getDoc, addDoc, runTransaction,
        updateDoc, deleteDoc, query, orderBy, limit, onSnapshot,
        serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js';

const $=id=>document.getElementById(id);
const currency=new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0});
const config=window.GestarkFirebaseConfig;
let auth,db,current=null,gestarkUser=null,profile=null,isAdmin=false,unsubscribe=[],transfers=[],orders=[];
const clean=x=>String(x||'').replace(/\s+/g,' ').trim();
function badge(message,kind='warn') {const el=$('connection-badge');el.textContent=message;el.className='pill '+kind}
function feedback(id,message='',error=false){const el=$(id);el.textContent=message;el.classList.toggle('error',error)}
function formatError(err){
 const code=err?.code||'';
 const known={
   'auth/invalid-credential':'Correo o contraseña incorrectos.',
   'auth/invalid-email':'Revisa el correo electrónico.',
   'auth/too-many-requests':'Demasiados intentos. Prueba más tarde.',
   'permission-denied':'Sin permisos. Comprueba authorized_users y las reglas de Firestore.',
   'unavailable':'Sin conexión al servidor. Revisa internet.'
 };
 return known[code]||((err?.message||'No fue posible completar la operación').slice(0,160));
}
function text(tag,value,cls=''){const el=document.createElement(tag);if(cls)el.className=cls;el.textContent=String(value);return el}
function setSignedOut(){current=null;profile=null;isAdmin=false;unsubscribe.forEach(fn=>fn());unsubscribe=[];transfers=[];orders=[];
 $('data-panel').hidden=true;$('login-panel').hidden=false;badge('Esperando acceso Firebase','warn')}
function setSignedIn(user,memberProfile){current=user;profile=memberProfile;isAdmin=profile.role==='admin';$('who').textContent=profile.name||user.email||'Usuario autorizado';$('login-panel').hidden=true;$('data-panel').hidden=false;badge('Conectado · Firebase','');
 subscribeRealtime()}
function subscribeRealtime(){
 unsubscribe.forEach(fn=>fn());unsubscribe=[];
 const options=[
  ['pilot_transfers','createdAt','transfer-count','transfer-feedback',items=>{transfers=items;renderTransfers()}],
  ['pilot_orders','createdAt','orders-count','order-feedback',items=>{orders=items;renderOrders()}]
 ];
 for(const [table,field,countId,errorId,apply] of options){
  let stop;
  try{stop=onSnapshot(query(collection(db,table),orderBy(field,'desc'),limit(200)),{includeMetadataChanges:true},snap=>{
   if(!current)return;
   const items=snap.docs.map(d=>({id:d.id,...d.data()}));apply(items);
   const pending=snap.metadata.hasPendingWrites,offline=snap.metadata.fromCache;
   $(countId).textContent=items.length+(items.length===200?' (últimos 200)':'');
   if(pending)badge('Guardando cambios…','warn');else if(offline)badge('Sincronizando al reconectar','warn');else badge('En tiempo real · Conectado','');
  },err=>{feedback(errorId,formatError(err),true);badge('Error de sincronización','bad')});unsubscribe.push(stop)}
  catch(err){feedback(errorId,formatError(err),true)}
 }
}
function renderTransfers(){const root=$('transfers-list');root.replaceChildren();
 if(!transfers.length){const row=text('tr','');const cell=text('td','No hay transferencias de prueba todavía.');cell.colSpan=4;row.append(cell);root.append(row);return}
 for(const item of transfers){const tr=document.createElement('tr');const name=text('td',item.name||'—');const amount=text('td',currency.format(Number(item.amount)||0),'amount');
  const td=document.createElement('td'),sel=document.createElement('select');sel.setAttribute('aria-label','¿Transfirió? '+item.name);
  for(const [value,label]of [['no','No'],['si','Sí']]){const opt=text('option',label);opt.value=value;sel.append(opt)}
  sel.value=item.status==='si'?'si':'no';sel.addEventListener('change',async()=>{
   sel.disabled=true;try{await updateDoc(doc(db,'pilot_transfers',item.id),{status:sel.value,updatedBy:current.uid,updatedAt:serverTimestamp()});feedback('transfer-feedback','Estado guardado ✓')}
   catch(e){sel.value=item.status;feedback('transfer-feedback',formatError(e),true)}finally{sel.disabled=false}
  });td.append(sel);const action=document.createElement('td');
  if(isAdmin){const btn=text('button','Borrar','delete');btn.type='button';btn.setAttribute('aria-label','Eliminar transferencia de '+item.name);btn.addEventListener('click',async()=>{
    if(!window.confirm('¿Eliminar esta transferencia de prueba de '+item.name+'?'))return;
    btn.disabled=true;try{await deleteDoc(doc(db,'pilot_transfers',item.id));feedback('transfer-feedback','Transferencia de prueba eliminada')}
    catch(e){feedback('transfer-feedback',formatError(e),true)}finally{btn.disabled=false}
  });action.append(btn)}else action.append(text('span','—','tiny'));
  tr.append(name,amount,td,action);root.append(tr)
 }
}
function renderOrders(){const root=$('orders-list');root.replaceChildren();
 if(!orders.length){const row=document.createElement('tr');const cell=text('td','No hay O.F. de prueba todavía.');cell.colSpan=4;row.append(cell);root.append(row);return}
 for(const item of orders){const tr=document.createElement('tr');const of=text('td',item.of||item.id,'of');const name=text('td',item.client||'—');const td=document.createElement('td'),sel=document.createElement('select');sel.setAttribute('aria-label','Cierre O.F. '+item.id);
  for(const [v,label]of [['pendiente','Pendiente'],['cerrada','Cerrada']]){const opt=text('option',label);opt.value=v;sel.append(opt)}sel.value=item.status==='cerrada'?'cerrada':'pendiente';
  sel.addEventListener('change',async()=>{sel.disabled=true;try{await updateDoc(doc(db,'pilot_orders',item.id),{status:sel.value,updatedAt:serverTimestamp(),updatedBy:current.uid});feedback('order-feedback','Estado sincronizado ✓')}
   catch(e){sel.value=item.status;feedback('order-feedback',formatError(e),true)}finally{sel.disabled=false}});td.append(sel);
  const action=document.createElement('td');if(isAdmin){const btn=text('button','Borrar','delete');btn.type='button';btn.setAttribute('aria-label','Eliminar O.F. '+item.id);btn.addEventListener('click',async()=>{
   if(!window.confirm('¿Eliminar O.F. de prueba '+item.id+' de '+item.client+'?'))return;
   btn.disabled=true;try{await deleteDoc(doc(db,'pilot_orders',item.id));feedback('order-feedback','O.F. de prueba eliminada')}
   catch(e){feedback('order-feedback',formatError(e),true)}finally{btn.disabled=false}
  });action.append(btn)}else action.append(text('span','—','tiny'));
  tr.append(of,name,td,action);root.append(tr)
 }
}

$('firebase-login').addEventListener('submit',async e=>{
 e.preventDefault();if(!auth)return;const btn=e.currentTarget.querySelector('button');btn.disabled=true;feedback('auth-feedback','Conectando…');
 try{await signInWithEmailAndPassword(auth,$('auth-email').value.trim(),$('auth-pass').value);$('auth-pass').value='';feedback('auth-feedback','')}
 catch(err){feedback('auth-feedback',formatError(err),true)}finally{btn.disabled=false}
});
$('firebase-logout').addEventListener('click',async()=>{if(auth)await signOut(auth)});
$('transfer-form').addEventListener('submit',async e=>{
 e.preventDefault();if(!current)return;const name=clean($('transfer-name').value),amount=Number($('transfer-amount').value),btn=e.currentTarget.querySelector('button');
 if(!name||name.length>80||!Number.isSafeInteger(amount)||amount<1||amount>999999999){feedback('transfer-feedback','Cliente o monto inválido.',true);return}
 btn.disabled=true;try{await addDoc(collection(db,'pilot_transfers'),{name,amount,status:'no',createdAt:serverTimestamp(),createdBy:current.uid,operator:profile.username,schemaVersion:1});
  $('transfer-form').reset();feedback('transfer-feedback','Transferencia registrada y sincronizada ✓')}
 catch(err){feedback('transfer-feedback',formatError(err),true)}finally{btn.disabled=false}
});
$('order-form').addEventListener('submit',async e=>{
 e.preventDefault();if(!current)return;const of=$('order-of').value.trim(),client=clean($('order-client').value),btn=e.currentTarget.querySelector('button');
 if(!/^\d{9}$/.test(of)||!client||client.length>80){feedback('order-feedback','La O.F. debe tener 9 dígitos y el cliente un nombre válido.',true);return}
 btn.disabled=true;
 try{await runTransaction(db,async tx=>{const ref=doc(db,'pilot_orders',of),exists=await tx.get(ref);
  if(exists.exists())throw new Error('La O.F. '+of+' ya existe en la base de prueba.');
  tx.set(ref,{of,client,status:'pendiente',createdAt:serverTimestamp(),createdBy:current.uid,operator:profile.username,schemaVersion:1});
 });$('order-form').reset();feedback('order-feedback','O.F. registrada y sincronizada ✓')}
 catch(err){feedback('order-feedback',formatError(err),true)}finally{btn.disabled=false}
});

async function start(){
 gestarkUser=window.GestarkAuth?.getUser();
 if(!gestarkUser){badge('Inicia sesión en Gestark','warn');return}
 if(!config?.enabled||!config.apiKey||!config.authDomain||!config.projectId||!config.appId){
  $('setup-panel').hidden=false;badge('Proyecto Firebase pendiente','warn');return
 }
 try{const app=initializeApp({apiKey:config.apiKey,authDomain:config.authDomain,projectId:config.projectId,storageBucket:config.storageBucket,messagingSenderId:config.messagingSenderId,appId:config.appId});
  auth=getAuth(app);db=getFirestore(app);await setPersistence(auth,browserLocalPersistence);
  onAuthStateChanged(auth,async user=>{
   unsubscribe.forEach(fn=>fn());unsubscribe=[];current=null;
   if(!user){setSignedOut();return}
   try{const allowed=await getDoc(doc(db,'authorized_users',user.uid));
    if(!allowed.exists()||allowed.data()?.active!==true){await signOut(auth);setSignedOut();feedback('auth-feedback','Usuario aún no autorizado. Crea authorized_users/'+user.uid+' en Firestore.',true);return}
    if(allowed.data()?.username !== gestarkUser.username){await signOut(auth);setSignedOut();feedback('auth-feedback','La cuenta Firebase no corresponde al usuario de Gestark que inició sesión.',true);return}
    setSignedIn(user,allowed.data());
   }catch(err){setSignedOut();feedback('auth-feedback',formatError(err),true)}
  });
 }catch(err){badge('Error de configuración','bad');$('setup-panel').hidden=false;$('setup-panel').querySelector('p').textContent=formatError(err)}
}
window.addEventListener('online',()=>{if(current)badge('Reconectando…','warn')});
window.addEventListener('offline',()=>{if(current)badge('Sin conexión','warn')});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
