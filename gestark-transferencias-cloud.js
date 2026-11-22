/* Gestark · Transferencias Firebase · Etapa controlada v2026.11.22.4
 * Usa una colección real, independiente del módulo local.
 * No borra ni reemplaza registros existentes. Requiere reglas de seguridad propias.
 */
import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js';
import {getFirestore,collection,doc,getDocFromServer,runTransaction,addDoc,
  updateDoc,deleteDoc,query,orderBy,limit,onSnapshot,serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js';

const COLLECTION='gestark_transfers_v1';
const LOCAL_MANUAL='gestark:notas-transferencias:v1:CIBC';
const LOCAL_QUEUE='gestark:contingency:payments:v1';
const LOCAL_STATUS='gestark:notas-transferencias:confirmacion:v1';
const IMPORT_PROGRESS='gestark:transferencias:firebase-imported:v1:';
const $=id=>document.getElementById(id);
const money=new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0});
let user=null,appProfile=null,profile=null,db=null,unsubscribe=null,documents=[],busy=false,started=false,editingId=null;

function clean(s){return String(s??'').replace(/\s+/g,' ').trim()}
function nameKey(s){return clean(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-CL')}
function amountParse(s){
 const str=String(s??'').trim(),digits=str.replace(/[^0-9]/g,'');
 const n=Number(digits);
 return /^[\d\s.$]+$/.test(str)&&digits&&Number.isSafeInteger(n)&&n>0&&n<=999999999?n:null;
}
function today(){const p=new Intl.DateTimeFormat('en-US',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const f=k=>p.find(x=>x.type===k)?.value;return `${f('year')}-${f('month')}-${f('day')}`}
function notify(text,isError=false){$('feedback').textContent=text;$('feedback').classList.toggle('error',isError)}
function status(text,kind=''){const b=$('connection');b.textContent=text;b.className='badge'+(kind?' '+kind:'')}
function errMessage(e){return ({'permission-denied':'Permiso denegado. Primero revisa las reglas de gestark_transfers_v1 en Firebase.','unavailable':'Sin conexión. Conéctate a internet para confirmar la operación.','failed-precondition':'Operación no disponible, revisa la conexión y las reglas.'})[e?.code]||e?.message||'No se pudo completar la operación.'}
function el(tag,text,cls){const x=document.createElement(tag);if(text!==undefined)x.textContent=String(text);if(cls)x.className=cls;return x}
function requireAdmin(){if(profile?.role!=='admin')throw Error('La importación histórica está reservada al administrador durante el piloto.')}
function localArray(key){try{const a=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(a)?a:[]}catch{return []}}
function localObject(key){try{const a=JSON.parse(localStorage.getItem(key)||'{}');return a&&typeof a==='object'&&!Array.isArray(a)?a:{}}catch{return {}}}
function localItems(){
 const manual=localArray(LOCAL_MANUAL).filter(x=>x&&typeof x.name==='string'&&typeof x.id==='string'&&Number.isSafeInteger(x.amount)&&x.amount>0&&x.amount<=999999999).slice(-1500);
 const queue=localArray(LOCAL_QUEUE).filter(x=>x&&typeof x.id==='string'&&/^\d{9}$/.test(x.of||'')&&x.method==='transfer'&&Number.isSafeInteger(x.amount)&&x.amount>0&&x.amount<=999999999).slice(-3000);
 const status=localObject(LOCAL_STATUS);
 const linked=new Set(manual.flatMap(x=>[x.sourceOF,...(Array.isArray(x.sources)?x.sources.map(y=>y?.of):[])]).filter(Boolean));
 const items=[];
 for(const x of manual){const name=clean(x.name);if(!name||name.length>80)continue;items.push({localId:x.id,client:name,amount:x.amount,source:'import_manual',of:'',date:/^\d{4}-\d{2}-\d{2}$/.test(x.date)?x.date:today(),status:status[nameKey(name)]==='si'?'si':'no'})}
 for(const x of queue){if(linked.has(x.of))continue;const name=clean(x.payer);if(!name||name.length>80)continue;items.push({localId:x.id,client:name,amount:x.amount,source:'import_contingency',of:x.of,date:today(),status:status[nameKey(name)]==='si'?'si':'no'})}
 return items;
}
function refreshLocal(){
 const arr=localItems();const sum=arr.reduce((a,b)=>a+b.amount,0);
 const recorded=new Set(localArray(IMPORT_PROGRESS+(user?.uid||'')));
 const pending=arr.filter(x=>!recorded.has(x.source+':'+x.localId)).length;
 $('local-preview').textContent=`${arr.length} registros locales elegibles · ${money.format(sum)} en este dispositivo · ${pending} pendientes de copiar según este navegador.`;
 $('import').disabled=!pending||profile?.role!=='admin'||busy;
 $('backup').disabled=!arr.length||busy;
}
function docData(item){return {client:item.client,amount:item.amount,status:item.status||'no',
 source:item.source||'manual',sourceKey:item.sourceKey||'',of:item.of||'',date:item.date||today(),
 createdBy:user.uid,createdByUsername:profile.username,createdAt:serverTimestamp(),
 updatedBy:user.uid,updatedAt:serverTimestamp(),schemaVersion:1};}
async function deterministicId(item){
 const value=`${user.uid}|${item.source}|${item.localId}`;
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
 return 'imp_'+Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('').slice(0,40);
}
function render(){
 const root=$('cloud-rows');root.replaceChildren();$('count').textContent=documents.length+' '+(documents.length===1?'registro':'registros');
 $('copy-excel').disabled=!documents.length;$('share-wa').disabled=!documents.length;
 if(!documents.length){const row=el('tr');const cell=el('td','Todavía no hay transferencias en Firebase.');cell.colSpan=5;row.append(cell);root.append(row);return}
 for(const record of documents){
  const tr=el('tr');tr.append(el('td',record.client),el('td',money.format(record.amount),'money'));
  const statusCell=el('td');const sel=document.createElement('select');sel.setAttribute('aria-label','¿Transfirió? '+record.client);
  for(const [value,label] of [['no','No'],['si','Sí']]){const opt=el('option',label);opt.value=value;sel.append(opt)}
  sel.value=record.status==='si'?'si':'no';sel.disabled=busy;
  sel.onchange=async()=>{sel.disabled=true;try{await updateDoc(doc(db,COLLECTION,record.id),{status:sel.value,updatedBy:user.uid,updatedAt:serverTimestamp()});notify('Estado guardado y sincronizado ✓')}catch(e){sel.value=record.status;notify(errMessage(e),true)}finally{sel.disabled=false}};
  statusCell.append(sel);tr.append(statusCell);
  const origin=record.source==='import_contingency'?'O.F. '+record.of:record.source==='import_manual'?'Importado':'Manual Firebase';
  tr.append(el('td',origin,'pill'));
  const actions=el('td');actions.className='table-actions';
  const edit=el('button','Editar','button ghost sm');edit.type='button';edit.disabled=busy;
  edit.onclick=()=>openEdit(record);
  const del=el('button','Eliminar','button danger sm');del.type='button';del.disabled=busy;
  del.onclick=async()=>{
   if(busy)return;
   if(!confirm('¿Eliminar definitivamente la transferencia de '+record.client+' por '+money.format(record.amount)+' de Firebase? Este cambio también se verá en los otros dispositivos.'))return;
   del.disabled=true;
   try{await deleteDoc(doc(db,COLLECTION,record.id));notify('Registro eliminado de Firebase. La copia local, si existe, permanece.')}
   catch(e){notify(errMessage(e),true)}finally{del.disabled=false}
  };
  actions.append(edit,del);
  tr.append(actions);root.append(tr);
 }
}
const editDialog=$('edit-dialog');
function openEdit(record){
 if(busy||!record)return;
 editingId=record.id;
 $('edit-client').value=record.client;
 $('edit-amount').value=String(record.amount);
 $('edit-date').value=record.date||today();
 $('edit-status').value=record.status==='si'?'si':'no';
 $('edit-error').textContent='';
 editDialog.showModal();
 $('edit-client').focus();
}
$('edit-cancel').addEventListener('click',()=>editDialog.close());
editDialog.addEventListener('close',()=>{editingId=null;$('edit-error').textContent=''});
$('edit-form').addEventListener('submit',async event=>{
 event.preventDefault();if(busy||!editingId||!user)return;
 const client=clean($('edit-client').value),amount=amountParse($('edit-amount').value);
 const date=$('edit-date').value,statusValue=$('edit-status').value;
 if(!client||client.length>80||amount===null||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!['si','no'].includes(statusValue)){
  $('edit-error').textContent='Revisa el nombre, monto, fecha y estado.';return;
 }
 busy=true;$('edit-save').disabled=true;$('edit-cancel').disabled=true;
 try{
  await updateDoc(doc(db,COLLECTION,editingId),{
   client,amount,date,status:statusValue,updatedBy:user.uid,updatedAt:serverTimestamp()
  });
  editDialog.close();notify('Transferencia modificada y sincronizada ✓');
 }catch(e){$('edit-error').textContent=errMessage(e)}
 finally{busy=false;$('edit-save').disabled=false;$('edit-cancel').disabled=false}
});
async function copyText(s){
 try{await navigator.clipboard.writeText(s);return true}catch{}
 const textarea=document.createElement('textarea');textarea.value=s;textarea.style.cssText='position:absolute;left:-9999px';document.body.append(textarea);textarea.select();let ok=false;try{ok=document.execCommand('copy')}catch{}textarea.remove();return ok;
}
function exportRows(){return documents.map(x=>x.client.replace(/[\t\n\r]/g,' ').replace(/^([=+\-@])/,'\'$1')+'\t'+x.amount+'\t'+(x.status==='si'?'si':'no')).join('\n')}
function exportMessage(){return ['*Transferencias Gestark (Firebase)*','',...documents.map(x=>'• '+x.client+' — '+money.format(x.amount)+' — '+(x.status==='si'?'Sí':'No'))].join('\n')}
$('copy-excel').addEventListener('click',async()=>{notify(await copyText(exportRows())?'Lista copiada para Excel.':'No se pudo copiar.',false)});
$('share-wa').addEventListener('click',async()=>{const message=exportMessage();const url='https://wa.me/?text='+encodeURIComponent(message);if(url.length>6000){notify(await copyText(message)?'Lista copiada para WhatsApp.':'No se pudo copiar.',false)}else window.location.href=url});
$('new-transfer').addEventListener('submit',async event=>{event.preventDefault();if(busy||!db||!user||!profile)return;
 const client=clean($('client').value),amount=amountParse($('amount').value);
 if(!client||client.length>80||amount===null){notify('Ingresa un cliente y monto válidos.',true);return}
 busy=true;$('add-button').disabled=true;refreshLocal();
 try{await addDoc(collection(db,COLLECTION),docData({client,amount,status:'no',source:'manual'}));$('new-transfer').reset();notify('Transferencia guardada en Firebase ✓')}
 catch(e){notify(errMessage(e),true)}finally{busy=false;$('add-button').disabled=false;refreshLocal()}
});
$('backup').addEventListener('click',()=>{
 const payload={exportedAt:new Date().toISOString(),manual:localArray(LOCAL_MANUAL),queue:localArray(LOCAL_QUEUE),status:localObject(LOCAL_STATUS)};
 const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='gestark-respaldo-transferencias-'+today()+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
 notify('Respaldo descargado. Guárdalo en un lugar privado: contiene nombres y montos.');
});
$('import').addEventListener('click',async()=>{
 if(busy||!db||!user||!profile)return;
 try{requireAdmin()}catch(e){notify(e.message,true);return}
 const progressKey=IMPORT_PROGRESS+user.uid;
 const recorded=new Set(localArray(progressKey));
 const items=localItems().filter(x=>!recorded.has(x.source+':'+x.localId)).slice(0,30);
 if(!items.length){notify('No quedan registros locales pendientes de importación en este dispositivo.',true);return}
 if(!confirm('¿Copiar hasta 30 registros locales a Firebase? No se borrarán los originales. Revisa primero que tus reglas de seguridad estén publicadas.'))return;
 busy=true;$('import').disabled=true;$('backup').disabled=true;let imported=0,skipped=0;
 try{
  for(const item of items){
   const id=await deterministicId(item),ref=doc(db,COLLECTION,id);
   const wasAdded=await runTransaction(db,async tx=>{
    const existing=await tx.get(ref);if(existing.exists())return false;
    tx.set(ref,docData({...item,sourceKey:id}));return true;
   });
   if(wasAdded)imported++;else skipped++;
   recorded.add(item.source+':'+item.localId);
   try{localStorage.setItem(progressKey,JSON.stringify([...recorded]))}catch{}
  }
  notify(`Importación completada: ${imported} agregados y ${skipped} ya existentes. Los originales permanecen en este dispositivo.`);
 }catch(e){notify(`Importación interrumpida (${imported} agregados). ${errMessage(e)} Puedes reintentar sin duplicar lo ya copiado.`,true)}
 finally{busy=false;refreshLocal()}
});
function connect(){
 if(started||!appProfile||!user)return;
 if(appProfile.provider!=='firebase'){$('who').textContent='Usa la opción «Usar Firebase» en Gestark antes de abrir esta pantalla.';status('Falta sesión Firebase','err');return}
 if(appProfile.uid!==user.uid){$('who').textContent='La sesión de Gestark y la de Firebase no coinciden. Cierra y vuelve a iniciar sesión.';status('Identidad diferente','err');return}
 started=true;void(async()=>{
  try{
   const member=await getDocFromServer(doc(db,'authorized_users',user.uid));
   if(!member.exists()||member.data().active!==true||member.data().username!==appProfile.username||!['admin','user'].includes(member.data().role))throw Error('Usuario Firebase no autorizado o desactivado.');
   profile=member.data();$('who').textContent=(profile.name||profile.username)+' · '+(profile.role==='admin'?'Administrador':'Colaborador');
   $('cloud-workspace').hidden=false;$('cloud-list-panel').hidden=false;$('import-panel').hidden=profile.role!=='admin';refreshLocal();
   status('Escuchando cambios','ok');
   unsubscribe=onSnapshot(query(collection(db,COLLECTION),orderBy('createdAt','desc'),limit(400)),{includeMetadataChanges:true},snap=>{
    documents=snap.docs.map(x=>({id:x.id,...x.data()}));render();
    status(snap.metadata.hasPendingWrites?'Guardando…':snap.metadata.fromCache?'Datos en caché':'Sincronizado en vivo',snap.metadata.fromCache?'':'ok');
    $('status-msg').textContent=snap.metadata.fromCache?'Los cambios todavía no están confirmados por el servidor.':'Conectado. Los cambios se compartirán con otros dispositivos autorizados.';
   },e=>{status('Error de permisos','err');$('status-msg').textContent=errMessage(e);notify(errMessage(e),true)});
  }catch(e){status('No conectado','err');$('status-msg').textContent=errMessage(e);started=false}
 })();
}
const conf=window.GestarkFirebaseConfig;
if(!conf?.enabled){status('Sin configurar','err');$('status-msg').textContent='Revisa gestark-firebase-config.js.'}
else {
 try{
  const app=getApps().length?getApp():initializeApp(conf);db=getFirestore(app);
  const auth=getAuth(app);
  onAuthStateChanged(auth,u=>{user=u;if(!u){status('Firebase no iniciado','err');$('who').textContent='Inicia sesión con Firebase en Gestark.';if(unsubscribe)unsubscribe();unsubscribe=null;started=false;return}connect()});
  document.addEventListener('gestark:ready',event=>{appProfile=event.detail;connect()});
  if(window.GestarkAuth?.getUser?.()){appProfile=window.GestarkAuth.getUser();connect()}
 }catch(e){status('Error de Firebase','err');$('status-msg').textContent=errMessage(e)}
}
window.addEventListener('storage',e=>{if([LOCAL_MANUAL,LOCAL_QUEUE,LOCAL_STATUS].includes(e.key)&&profile)refreshLocal()});
