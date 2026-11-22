/* Gestark · Directorio de clientes · v2026.11.22.23
 * Fuente única: Firestore. No guarda los datos del directorio en GitHub ni localStorage.
 * RUT módulo 11; móvil Chile +56 9 XXXXXXXX; XLSX auténtico autocontenido.
 */
(() => {
'use strict';
const SDK='https://www.gstatic.com/firebasejs/12.11.0/';
const COLLECTION='gestark_directorio_clientes_v1';
const FIELDS=[
  ['nombre','Nombre'],['nombreAlternativo','Nombre alternativo'],['rut','RUT'],['telefono','Teléfono'],['factura','Factura'],
  ['razonSocial','Razón social'],['rutFactura','RUT facturación'],['giro','Giro'],
  ['direccion','Dirección tributaria'],['comuna','Comuna'],['correoFactura','Correo facturación']
];
const $=id=>document.getElementById(id);
const t=(id,v)=>{$(id).textContent=v};
const clean=value=>String(value||'').trim().replace(/\s+/g,' ');
const fold=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-CL');
const collator=new Intl.Collator('es-CL',{sensitivity:'base',numeric:true});
let contacts=[],user=null,client=null,unsub=null,editingId=null,loaded=false,serverReady=false;
let renderQueued=false;

function rutParts(value){
 const compact=String(value||'').toUpperCase().replace(/[^0-9K]/g,'').slice(0,9);
 if(compact.length<2)return null;
 const body=compact.slice(0,-1),dv=compact.slice(-1);
 if(!/^\d{1,8}$/.test(body)||!/^[0-9K]$/.test(dv)||Number(body)===0)return null;
 let sum=0,weight=2;
 for(let i=body.length-1;i>=0;i--){sum+=Number(body[i])*weight;weight=weight===7?2:weight+1;}
 const rest=11-sum%11;
 const actual=rest===11?'0':rest===10?'K':String(rest);
 return {body,dv,valid:actual===dv,id:body+'-'+dv,formatted:body.replace(/\B(?=(\d{3})+(?!\d))/g,'.')+'-'+dv};
}
function formatRutInput(input){
 const v=String(input.value||'').toUpperCase().replace(/[^0-9K]/g,'').slice(0,9);
 if(v.length<2){input.value=v;return}
 const body=v.slice(0,-1),dv=v.slice(-1);
 input.value=body.replace(/\B(?=(\d{3})+(?!\d))/g,'.')+'-'+dv;
}
function rutFeedback(id,hint){const part=rutParts($(id).value);const isValid=part&&part.valid;
 t(hint,$(id).value?(isValid?'✓ RUT válido':'RUT sin verificar o inválido'):'');
 $(hint).style.color=isValid?'#15805b':'#b03439';
 return isValid?part:null;
}
// Admite formato chileno completo, +569..., 569..., 9XXXXXXXX y
// XXXXXXXX (ocho dígitos locales, se antepone 9 automáticamente).
// Ignora separadores de WhatsApp, pero jamás trunca dígitos sobrantes.
function mobile(value){
 let d=String(value||'').replace(/\D/g,'');
 if(d.startsWith('0056'))d=d.slice(4);
 else if(d.startsWith('56'))d=d.slice(2);
 if(d.startsWith('09')&&d.length===10)d=d.slice(1);
 if(d.length===8)d='9'+d;
 if(!/^9[0-9]{8}$/.test(d))return null;
 return '+56 9 '+d.slice(1);
}
function phoneHint(message,valid=false){
 const field=$('phone'),hint=$('phone-hint');
 hint.textContent=message;
 hint.dataset.invalid=String(!valid&&!!field.value.trim());
 hint.style.color=valid?'#147c56':'#b03439';
 field.setAttribute('aria-invalid',String(!valid&&!!field.value.trim()));
}
function phoneChanged(fromPaste=false,final=false){
 const input=$('phone'),value=input.value.trim();
 if(!value){phoneHint('Escribe o pega desde WhatsApp; se adaptará automáticamente.');return}
 // No anteponer el 9 a los ocho primeros dígitos mientras el usuario escribe:
 // puede estar ingresando un móvil de nueve dígitos, aún incompleto.
 if(!fromPaste&&!final&&/^\d{8}$/.test(value)){
  phoneHint('Completa los 9 dígitos o sal del campo para adaptar 8 dígitos.',true);
  return;
 }
 const formatted=mobile(value);
 if(formatted){
  input.value=formatted;
  phoneHint(fromPaste?'✓ Número de WhatsApp adaptado al formato Gestark.':'✓ Teléfono válido',true);
 }else{
  phoneHint('Revisa el número: se requiere un móvil chileno de 9 dígitos (9 + 8 dígitos).');
 }
}
function phonePasted(event){
 const incoming=event.clipboardData?.getData('text/plain');
 if(!incoming)return;
 event.preventDefault();
 // En un campo de teléfono el pegado sustituye el contenido anterior.
 // Si llega más de un número o uno mal formado, se deja visible para corregir.
 const text=incoming.trim();
 $('phone').value=mobile(text)||text.slice(0,90);
 phoneChanged(true);
}
function normalizeContact(x,id){
 const invoice=x?.facturacion&&typeof x.facturacion==='object'?x.facturacion:null;
 return {id,nombre:clean(x?.nombre),nombreAlternativo:clean(x?.nombreAlternativo),rut:clean(x?.rut),telefono:clean(x?.telefono),
   factura:!!invoice,razonSocial:clean(invoice?.razonSocial),rutFactura:clean(invoice?.rut),
   giro:clean(invoice?.giro),direccion:clean(invoice?.direccion),comuna:clean(invoice?.comuna),
   correoFactura:clean(invoice?.correo)};
}
function matched(){
 const words=fold($('filter').value).split(/\s+/).filter(Boolean);
 return !words.length?contacts:contacts.filter(c=>{
  const line=fold(FIELDS.map(([key])=>key==='factura'?(c.factura?'sí factura':'no factura'):c[key]).join(' '));
  return words.every(w=>line.includes(w));
 });
}
function el(tag,className,text){const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e}
function render(){
 renderQueued=false;
 const matches=matched();t('total',contacts.length+' clientes');
 const host=$('list');host.replaceChildren();
 if(!matches.length){host.append(el('div','empty',loaded?'No hay clientes que coincidan.':'Cargando contactos…'));return}
 const head=el('div','head');['Nombre','RUT','Teléfono','Factura',''].forEach(s=>head.append(el('span','',s)));host.append(head);
 const frag=document.createDocumentFragment();
 for(const c of matches){
  const row=el('div',c.factura?'entry needs-invoice':'entry');
  const nameStack=el('div','name-stack cell');
  nameStack.append(el('div','person',c.nombre));
  if(c.nombreAlternativo)nameStack.append(el('div','alternate-name','También: '+c.nombreAlternativo));
  row.append(nameStack,el('div','rut cell',c.rut));
  const link=el('a','phone cell',c.telefono);link.href='tel:'+c.telefono.replace(/\s+/g,'');link.title='Llamar';row.append(link);
  const badge=el('div',c.factura?'tag is-invoice':'tag',c.factura?'⚠ Requiere factura':'—');
  if(c.factura)badge.title='Este cliente requiere factura. Comprueba sus datos tributarios antes de emitir.';
  row.append(badge);
  const actions=el('div','rowactions');
  const edit=el('button','iconbtn','Editar');edit.type='button';edit.dataset.edit=c.id;edit.setAttribute('aria-label','Editar '+c.nombre);
  const del=el('button','iconbtn','×');del.type='button';del.dataset.delete=c.id;del.title='Eliminar';del.setAttribute('aria-label','Eliminar '+c.nombre);
  actions.append(edit,del);row.append(actions);frag.append(row);
 }
 host.append(frag);
}
function queueRender(){if(renderQueued)return;renderQueued=true;requestAnimationFrame(render)}
function setStatus(msg,bad){t('status',msg);$('status').style.color=bad?'#ad4439':'#71887a'}
function openDialog(id){$(id).showModal()}
function closeDialog(id){$(id).close()}
function invoiceVisibility(){$('invoice-fields').hidden=!$('invoice-enabled').checked}
function editContact(id){
 const c=contacts.find(x=>x.id===id);if(!c)return;
 editingId=id;$('contact-form').reset();t('contact-heading','Editar contacto');t('contact-error','');
 $('name').value=c.nombre;$('alternate-name').value=c.nombreAlternativo;$('rut').value=c.rut;$('phone').value=c.telefono;
 $('invoice-enabled').checked=c.factura;invoiceVisibility();
 $('invoice-name').value=c.razonSocial;$('invoice-rut').value=c.rutFactura;
 $('invoice-business').value=c.giro;$('invoice-address').value=c.direccion;
 $('invoice-city').value=c.comuna;$('invoice-email').value=c.correoFactura;
 rutFeedback('rut','rut-hint');rutFeedback('invoice-rut','invoice-rut-hint');
 phoneChanged();openDialog('contact-dialog');
}
function addContact(){
 editingId=null;$('contact-form').reset();t('contact-heading','Agregar contacto');t('contact-error','');
 t('rut-hint','');t('invoice-rut-hint','');phoneHint('Escribe o pega desde WhatsApp; se adaptará automáticamente.');invoiceVisibility();
 openDialog('contact-dialog');$('name').focus();
}
function getFormData(){
 const nombre=clean($('name').value),nombreAlternativo=clean($('alternate-name').value);
 if(!nombre)throw Error('Ingresa el nombre del cliente.');
 if(nombreAlternativo.length>100)throw Error('El nombre alternativo admite hasta 100 caracteres.');
 const rut=rutFeedback('rut','rut-hint');if(!rut)throw Error('El RUT del cliente es inválido (módulo 11).');
 const telefono=mobile($('phone').value);if(!telefono)throw Error('El teléfono debe ser un móvil chileno: +56 9 91919191.');
 let facturacion=null;
 if($('invoice-enabled').checked){
  const razonSocial=clean($('invoice-name').value),invoiceRut=rutFeedback('invoice-rut','invoice-rut-hint');
  const giro=clean($('invoice-business').value),direccion=clean($('invoice-address').value),comuna=clean($('invoice-city').value);
  const correo=clean($('invoice-email').value).toLowerCase();
  if(!razonSocial||!giro||!direccion||!comuna||!correo)throw Error('Completa todos los datos de facturación.');
  if(!invoiceRut)throw Error('El RUT de facturación es inválido.');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo))throw Error('El correo de facturación no es válido.');
  facturacion={razonSocial,rut:invoiceRut.formatted,giro,direccion,comuna,correo};
 }
 return {id:rut.id,nombre,nombreAlternativo,rut:rut.formatted,telefono,facturacion};
}
async function saveContact(event){
 event.preventDefault();t('contact-error','');
 if(!client||!serverReady){t('contact-error','Conéctate a Firebase antes de guardar.');return}
 if(!navigator.onLine){t('contact-error','Sin conexión a internet; no se puede guardar en la nube.');return}
 let data;try{data=getFormData()}catch(e){t('contact-error',e.message);return}
 const save=$('save');save.disabled=true;save.textContent='Guardando…';
 try{
  const fs=client.fs,db=client.db,newRef=fs.doc(db,COLLECTION,data.id);
  const oldId=editingId;
  await fs.runTransaction(db,async tx=>{
   const existing=await tx.get(newRef);
   let oldRef=null,old=null;
   if(oldId&&oldId!==data.id){oldRef=fs.doc(db,COLLECTION,oldId);old=await tx.get(oldRef);if(!old.exists())throw Error('El contacto original ya no existe.');}
   if(existing.exists()&&oldId!==data.id)throw Error('Este RUT ya está registrado en el directorio.');
   if(oldId&&!existing.exists()&&oldId===data.id)throw Error('Este contacto fue eliminado por otro usuario.');
   const createdAt=(old||existing).exists()?(old||existing).data().createdAt:fs.serverTimestamp();
   tx.set(newRef,{nombre:data.nombre,nombreAlternativo:data.nombreAlternativo,rut:data.rut,telefono:data.telefono,facturacion:data.facturacion,
     createdAt,updatedAt:fs.serverTimestamp(),updatedBy:user.uid});
   if(oldRef)tx.delete(oldRef);
  });
  closeDialog('contact-dialog');setStatus('Contacto guardado en Firebase.',false);
 }catch(e){t('contact-error',e?.code==='permission-denied'?'Sin permiso en Firestore. Falta activar las reglas del directorio.':(e?.message||'No se pudo guardar en la nube.'));}
 finally{save.disabled=false;save.textContent='Guardar en la nube'}
}
async function deleteContact(id){
 const c=contacts.find(x=>x.id===id);if(!c||!client)return;
 if(!confirm('¿Eliminar a '+c.nombre+' ('+c.rut+') del directorio?'))return;
 if(!navigator.onLine){setStatus('Sin internet. No se eliminó el contacto.',true);return}
 try{await client.fs.deleteDoc(client.fs.doc(client.db,COLLECTION,id));setStatus('Contacto eliminado de Firebase.',false)}
 catch(e){setStatus('No se pudo eliminar: '+(e?.message||'error'),true)}
}
function buildExportFields(){
 const host=$('export-fields');host.replaceChildren();
 for(const [key,label] of FIELDS){const wrapper=el('label');const check=el('input');check.type='checkbox';check.value=key;check.checked=true;check.addEventListener('change',syncSelectAll);wrapper.append(check,document.createTextNode(label));host.append(wrapper)}
 syncSelectAll();
}
function syncSelectAll(){const checks=[...$('export-fields').querySelectorAll('input')];$('select-all-fields').checked=checks.every(x=>x.checked);$('select-all-fields').indeterminate=!checks.every(x=>x.checked)&&checks.some(x=>x.checked)}
function openExport(){buildExportFields();document.querySelector('input[name=export-scope][value=all]').checked=true;t('export-error','');openDialog('export-dialog')}

// XLSX real, sin dependencias externas: Office Open XML + ZIP no comprimido.
function xml(value){return String(value??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')}
function excelCol(n){let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s}
function makeXlsx(items,columns){
 const rows=[columns.map(x=>x[1]),...items.map(c=>columns.map(([key])=>key==='factura'?(c.factura?'Sí':'No'):c[key]||''))];
 let sheet='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>';
 sheet+='<cols>'+columns.map((v,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+Math.min(43,Math.max(15,v[1].length+7))+'" customWidth="1"/>').join('')+'</cols><sheetData>';
 rows.forEach((row,ri)=>{
  sheet+='<row r="'+(ri+1)+'">';
  row.forEach((value,ci)=>{sheet+='<c r="'+excelCol(ci)+(ri+1)+'" t="inlineStr"'+(ri===0?' s="1"':'')+'><is><t xml:space="preserve">'+xml(value)+'</t></is></c>'});
  sheet+='</row>';
 });
 sheet+='</sheetData><autoFilter ref="A1:'+excelCol(columns.length-1)+rows.length+'"/></worksheet>';
 const files={
  '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
  '_rels/.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  'xl/workbook.xml':'<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Clientes" sheetId="1" r:id="rId1"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
  'xl/styles.xml':'<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0B8057"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
  'xl/worksheets/sheet1.xml':sheet
 };
 return makeZip(files);
}
function crc32(bytes){let crc=-1;for(const b of bytes){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}return(crc^(-1))>>>0}
function makeZip(files){
 const encoder=new TextEncoder(),parts=[],central=[];let offset=0;
 const little=(view,at,num,size)=>{if(size===2)view.setUint16(at,num,true);else view.setUint32(at,num,true)};
 for(const [name,body] of Object.entries(files)){
  const file=encoder.encode(body),fname=encoder.encode(name),crc=crc32(file);
  const header=new Uint8Array(30+fname.length),v=new DataView(header.buffer);
  little(v,0,0x04034b50,4);little(v,4,20,2);little(v,6,0,2);little(v,8,0,2);
  little(v,14,crc,4);little(v,18,file.length,4);little(v,22,file.length,4);little(v,26,fname.length,2);header.set(fname,30);
  parts.push(header,file);
  const c=new Uint8Array(46+fname.length),cv=new DataView(c.buffer);
  little(cv,0,0x02014b50,4);little(cv,4,20,2);little(cv,6,20,2);little(cv,16,crc,4);little(cv,20,file.length,4);little(cv,24,file.length,4);
  little(cv,28,fname.length,2);little(cv,42,offset,4);c.set(fname,46);central.push(c);
  offset+=header.length+file.length;
 }
 const centralSize=central.reduce((n,x)=>n+x.length,0),end=new Uint8Array(22),v=new DataView(end.buffer);
 little(v,0,0x06054b50,4);little(v,8,central.length,2);little(v,10,central.length,2);little(v,12,centralSize,4);little(v,16,offset,4);
 return new Blob([...parts,...central,end],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
function downloadExcel(){
 t('export-error','');const selected=[...$('export-fields').querySelectorAll('input:checked')].map(x=>x.value);
 const columns=FIELDS.filter(([k])=>selected.includes(k));
 if(!columns.length){t('export-error','Selecciona al menos un campo.');return}
 if(!loaded){t('export-error','Todavía no se han cargado los datos desde Firebase.');return}
 if(!serverReady){t('export-error','No se ha confirmado conexión al servidor. Reconéctate antes de exportar.');return}
 const scope=document.querySelector('input[name=export-scope]:checked')?.value;
 const rows=scope==='filtered'?matched():contacts;
 if(!rows.length){t('export-error','No hay contactos para exportar.');return}
 try{
  const blob=makeXlsx(rows,columns),href=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=href;a.download='gestark-directorio-'+new Date().toLocaleDateString('en-CA')+'.xlsx';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),2000);
  closeDialog('export-dialog');
 }catch(e){t('export-error','No se pudo generar el Excel: '+(e?.message||'error'))}
}
async function firebaseClient(){
 let cfg=window.GestarkFirebaseConfig;
 if(!cfg){cfg=await new Promise((resolve,reject)=>{
  const s=document.createElement('script');s.src='./gestark-firebase-config.js?v=2026.11.21.43';s.onload=()=>resolve(window.GestarkFirebaseConfig);s.onerror=()=>reject(Error('No se pudo cargar Firebase.'));document.head.append(s)
 });}
 if(!cfg?.enabled)throw Error('Firebase no está configurado.');
 const [apps,authSDK,fs]=await Promise.all([import(SDK+'firebase-app.js'),import(SDK+'firebase-auth.js'),import(SDK+'firebase-firestore.js')]);
 const app=apps.getApps().find(a=>a.name==='[DEFAULT]')||apps.initializeApp(cfg);
 const auth=authSDK.getAuth(app),db=fs.getFirestore(app);
 await auth.authStateReady();
 if(auth.currentUser?.uid!==user.uid)throw Error('La sesión de Firebase no coincide con el usuario autorizado.');
 return {auth,db,fs};
}
async function init(profile){
 if(!profile?.uid||profile.provider!=='firebase'||user)return;
 user=profile;
 try{
  client=await firebaseClient();
  unsub=client.fs.onSnapshot(client.fs.collection(client.db,COLLECTION),{includeMetadataChanges:true},snap=>{
   const list=snap.docs.map(d=>normalizeContact(d.data(),d.id));
   list.sort((a,b)=>collator.compare(a.nombre,b.nombre));contacts=list;loaded=true;
   serverReady=!snap.metadata.fromCache;
   setStatus(serverReady?'Firebase sincronizado':('Datos en caché · reconectando con Firebase'),!serverReady);
   queueRender();
  },err=>{
   loaded=false;serverReady=false;setStatus(err.code==='permission-denied'?'Faltan permisos de Firestore para el directorio.':'No se pudo leer Firebase: '+(err.message||'error'),true);
  });
 }catch(e){setStatus('No se pudo abrir el directorio: '+(e.message||'error'),true)}
}
function setup(){
 $('open-add').addEventListener('click',addContact);
 $('open-export').addEventListener('click',openExport);
 $('filter').addEventListener('input',queueRender);
 $('contact-form').addEventListener('submit',saveContact);
 $('invoice-enabled').addEventListener('change',invoiceVisibility);
 for(const [input,hint] of [['rut','rut-hint'],['invoice-rut','invoice-rut-hint']]){
  $(input).addEventListener('input',()=>{formatRutInput($(input));rutFeedback(input,hint)});
  $(input).addEventListener('blur',()=>{formatRutInput($(input));rutFeedback(input,hint)});
 }
 $('phone').addEventListener('paste',phonePasted);
 $('phone').addEventListener('input',()=>phoneChanged(false));
 $('phone').addEventListener('change',()=>phoneChanged(false,true));
 $('phone').addEventListener('blur',()=>phoneChanged(false,true));
 $('list').addEventListener('click',ev=>{const edit=ev.target.closest('[data-edit]'),del=ev.target.closest('[data-delete]');if(edit)editContact(edit.dataset.edit);else if(del)void deleteContact(del.dataset.delete)});
 document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>closeDialog(b.dataset.close)));
 $('select-all-fields').addEventListener('change',e=>{for(const c of $('export-fields').querySelectorAll('input'))c.checked=e.target.checked;syncSelectAll()});
 $('download').addEventListener('click',downloadExcel);
 document.addEventListener('gestark:ready',event=>{void init(event.detail)});
 document.addEventListener('gestark:sessionlost',()=>{unsub?.();unsub=null;user=null;contacts=[];loaded=false;serverReady=false;queueRender();setStatus('Sesión finalizada.',true)});
 window.addEventListener('pagehide',()=>{unsub?.()},{once:true});
 window.addEventListener('online',()=>{if(client&&!serverReady)setStatus('Reconectando Firebase…',false)});
 const existing=window.GestarkAuth?.getUser?.();if(existing)void init(existing);
 render();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();
