/* Gestark · Entregas contingentes · Flujo compacto y pagos v2026.11.21.20.
   El motor de cámara/decodificación proviene de la versión aprobada 2026.11.21.15. */
(()=>{
 'use strict';
 const core=window.GestarkLabCore;
 const $=id=>document.getElementById(id);
 const PDF_LIB='https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js';
 const SCAN_LIB='https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';
 const DELIVERY_PREFIX='gestark:contingency:confirmed:v1:';
 const MAX=1000;
 let active=false, currentUser='', operatorName='', deliveryStorage='', records=[];
 let dbReady=false, dbBusy=false, dbProfile=null;
 let scanner=null, cameraOn=false, working=false, stopping=false, flashOn=false;
 let signed=false, signatureCanvas=null, sigCtx=null, penDown=false;
 let currentOF='', lastScanAt=0, resumeScanAt=0, confirmedRecord=null, confirmedSnapshot=null;
 let printQueue=[]; // Firmas y datos personales solo en memoria; nunca en localStorage.
 let toastTimer=null;
 let currentStep=0,currentView='form',paymentPhoto=null,paymentPhotoURL='',paymentPhotoHash='',resizeSignature=()=>{};
 const PERSONAL_TRANSFERS_KEY='gestark:notas-transferencias:v1:CIBC';
 const PHOTO_DB='gestark-contingency-evidence-v1';
 // Flujo por etapas: no se descartan campos al navegar.
 function setView(view){
   currentView=view;
   for(const name of ['form','pdf','history'])$('view-'+name).hidden=view!==name;
   document.querySelectorAll('.mode-tab').forEach(b=>{const on=b.dataset.view===view;b.classList.toggle('active',on);b.setAttribute('aria-selected',String(on))});
   if(view==='form')setStep(currentStep,false);
   if(view==='history'&&dbReady)loadDatabaseRecords();
   window.scrollTo({top:0,behavior:'instant'});
 }
 function setStep(step,scroll=true){
   if(step<0||step>3)return;
   currentStep=step;
   for(let i=0;i<4;i++)$('stage-'+i).hidden=i!==step;
   document.querySelectorAll('.step-tab').forEach(b=>{const idx=Number(b.dataset.step);b.classList.toggle('active',idx===step);b.classList.toggle('complete',idx<step);b.setAttribute('aria-selected',String(idx===step))});
   const titles=['Identificación','Receptor y pago','Recepción conforme','Confirmación'];
   $('flow-caption').textContent='Paso '+(step+1)+' de 4 · '+titles[step];
   $('flow-order').textContent=currentOF?'O.F. '+currentOF:'Sin O.F.';
   $('step-prev').disabled=step===0;
   $('step-next').textContent=step===3?'Revisar comprobantes':'Continuar';
   if(step===2)requestAnimationFrame(()=>resizeSignature());
   if(step===3)updateConfirmSummary();
   if(step!==0&&cameraOn)stopCamera();
   if(scroll)window.scrollTo({top:0,behavior:'smooth'});
 }
 function stepValid(step){
   const d=values();
   if(step===0){if(!/^\d{9}$/.test(d.order)||d.order!==currentOF){status('Identifica una O.F. de nueve dígitos antes de continuar.','bad');return false}return true}
   if(step===1){
     if(!d.name){paymentStatus('Indica el nombre del receptor.','bad');$('field-name').focus();return false}
     if(!core.validateRut(d.rut)){paymentStatus('El RUT del receptor debe ser válido.','bad');$('field-rut').focus();return false}
     return Boolean(readPayment(true));
   }
   if(step===2){if(!signed){toast('Solicita la firma del receptor antes de continuar');return false}return true}
   return true;
 }
 function nextStep(){
   if(confirmedRecord){setView('pdf');return}
   if(currentStep===3){setView('pdf');return}
   if(stepValid(currentStep))setStep(currentStep+1);
 }
 function updateConfirmSummary(){
   const el=$('confirm-summary');if(!el)return;
   const d=values(),pay=readPayment(false),state=pay?(pay.condition==='prepaid'?'Sin cobro en entrega':(pay.method==='transfer'?'Transferencia informada':'Efectivo recibido')+' · '+money(pay.amount)):'Pago sin completar';
   const p=el.querySelector('p');p.textContent='O.F. '+(d.order||'—')+'\nReceptor: '+(d.name||'—')+'\nPago: '+state+'\nFirma: '+(signed?'Capturada':'Pendiente');
 }
 function updateFlowCounters(){
   if($('history-badge'))$('history-badge').textContent=String(records.length);
   if($('queue-badge'))$('queue-badge').textContent=String(printQueue.length);
 }
 function paymentStatus(message='',kind=''){const el=$('payment-feedback');if(el){el.textContent=message;el.className='stat '+kind}}
 function money(amount){return new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(amount)}
 function parsePaymentAmount(value){
   const raw=String(value||'').trim();if(!raw||!/^[\d. $]+$/.test(raw))return null;
   const digits=raw.replace(/[^\d]/g,'');const num=Number(digits);
   return /^\d+$/.test(digits)&&Number.isSafeInteger(num)&&num>0&&num<=999999999?num:null;
 }
 function paymentChoice(name){return document.querySelector('input[name="'+name+'"]:checked')?.value||''}
 function updatePaymentUI(){
   const condition=paymentChoice('pay-condition'),method=paymentChoice('pay-method');
   $('payment-details').hidden=condition!=='due';
   $('transfer-fields').hidden=condition!=='due'||method!=='transfer';
   $('cash-fields').hidden=condition!=='due'||method!=='cash';
   paymentStatus('');
 }
 function readPayment(showError=true){
   const condition=paymentChoice('pay-condition');
   const fail=message=>{if(showError)paymentStatus(message,'bad');return null};
   if(!condition)return fail('Selecciona si la orden ya estaba pagada o requiere cobro.');
   if(condition==='prepaid')return {condition,method:'none',amount:0,status:'prepaid'};
   const amount=parsePaymentAmount($('pay-amount').value);
   if(amount===null)return fail('Ingresa un monto en pesos válido y mayor que cero.');
   const method=paymentChoice('pay-method');
   if(!method)return fail('Selecciona transferencia bancaria o efectivo.');
   if(method==='transfer'){
     const payer=$('pay-payer').value.replace(/\s+/g,' ').trim();
     if(!payer)return fail('Indica el nombre del titular que hizo la transferencia.');
     if(!paymentPhoto)return fail('Debes fotografiar o adjuntar el comprobante de transferencia.');
     if(!$('pay-transfer-declared').checked)return fail('Confirma que el cliente presentó el comprobante de transferencia.');
     return {condition,method,amount,status:'reported_unverified',payer,photoHash:paymentPhotoHash};
   }
   if(!$('pay-cash-received').checked)return fail('Confirma que recibiste el efectivo.');
   return {condition,method,amount,status:'cash_received'};
 }
 function dropPaymentPhoto(){
   paymentPhoto=null;paymentPhotoHash='';
   if(paymentPhotoURL){URL.revokeObjectURL(paymentPhotoURL);paymentPhotoURL=''}
   $('payment-preview-wrap').hidden=true;$('payment-preview').removeAttribute('src');
   $('payment-photo').value='';$('payment-photo-file').value='';
 }
 function resetPayment(){
   document.querySelectorAll('input[name="pay-condition"],input[name="pay-method"]').forEach(x=>x.checked=false);
   $('pay-amount').value='';$('pay-payer').value='';
   $('pay-transfer-declared').checked=false;$('pay-cash-received').checked=false;
   dropPaymentPhoto();updatePaymentUI();
 }
 async function captureEvidence(ev){
   const file=ev.target.files?.[0];if(!file)return;
   if(!file.type.startsWith('image/')&&!/\.(heic|heif|jpg|jpeg|png|webp)$/i.test(file.name||'')){paymentStatus('Selecciona una fotografía válida.','bad');return}
   if(file.size>18*1024*1024){paymentStatus('La imagen excede 18 MB. Intenta una foto de menor tamaño.','bad');return}
   paymentStatus('Preparando fotografía…');
   let url='';
   try{
     url=URL.createObjectURL(file);
     const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('Imagen no compatible'));img.src=url});
     const factor=Math.min(1,1400/Math.max(img.naturalWidth,img.naturalHeight));
     const w=Math.round(img.naturalWidth*factor),h=Math.round(img.naturalHeight*factor);
     if(!w||!h)throw Error('Imagen vacía');
     const cv=document.createElement('canvas');cv.width=w;cv.height=h;
     cv.getContext('2d').drawImage(img,0,0,w,h);
     const blob=await new Promise(resolve=>cv.toBlob(resolve,'image/jpeg',.76));
     if(!blob)throw Error('No fue posible comprimir la imagen');
     const hash=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());
     const digest=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
     dropPaymentPhoto();paymentPhoto=blob;paymentPhotoHash=digest;
     paymentPhotoURL=URL.createObjectURL(blob);
     $('payment-preview').src=paymentPhotoURL;$('payment-preview-wrap').hidden=false;
     $('payment-photo-meta').textContent=Math.round(blob.size/1024)+' KB · fotografía preparada';
     paymentStatus('Fotografía adjunta. Se guardará al confirmar la entrega.','ok');
   }catch(err){paymentStatus('No pudimos abrir esta imagen. Prueba con JPG o PNG.','bad')}
   finally{if(url)URL.revokeObjectURL(url);ev.target.value=''}
 }
 function photoDB(){return new Promise((resolve,reject)=>{
   if(!('indexedDB' in window))return reject(Error('El navegador no admite almacenamiento de fotografías'));
   const open=indexedDB.open(PHOTO_DB,1);
   open.onupgradeneeded=()=>{if(!open.result.objectStoreNames.contains('evidence'))open.result.createObjectStore('evidence',{keyPath:'id'})};
   open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error||Error('Almacenamiento no disponible'));
 })}
 async function writePhoto(id,blob,hash){
   const db=await photoDB();
   try{return await new Promise((resolve,reject)=>{
     const tx=db.transaction('evidence','readwrite');tx.objectStore('evidence').put({id,blob,hash,at:Date.now()});
     tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error||Error('No se guardó la imagen'));tx.onabort=()=>reject(tx.error||Error('Almacenamiento bloqueado'));
   })}finally{db.close()}
 }
 async function readPhoto(id){
   const db=await photoDB();
   try{return await new Promise((resolve,reject)=>{
     const rq=db.transaction('evidence','readonly').objectStore('evidence').get(id);
     rq.onsuccess=()=>resolve(rq.result||null);rq.onerror=()=>reject(rq.error||Error('No se pudo recuperar imagen'));
   })}finally{db.close()}
 }
 async function deletePhotos(ids){if(!ids.length)return;
   try{const db=await photoDB();await new Promise((resolve,reject)=>{
     const tx=db.transaction('evidence','readwrite');ids.forEach(id=>tx.objectStore('evidence').delete(id));
     tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
   });db.close()}catch(err){console.warn('Limpieza evidencia',err)}
 }
 let modalPhotoURL='';
 async function showPhoto(id,of){
   try{
     const item=await readPhoto(id);
     if(!item?.blob){toast('La fotografía no está disponible en este dispositivo');return}
     if(modalPhotoURL)URL.revokeObjectURL(modalPhotoURL);
     modalPhotoURL=URL.createObjectURL(item.blob);
     $('photo-dialog-img').src=modalPhotoURL;
     $('photo-dialog-meta').textContent='O.F. '+of+' · Respaldo local, pendiente de verificación bancaria';
     $('photo-dialog').showModal();
   }catch(err){toast('No se pudo abrir el comprobante local')}
 }
 function closePhoto(){if($('photo-dialog').open)$('photo-dialog').close();$('photo-dialog-img').removeAttribute('src');if(modalPhotoURL){URL.revokeObjectURL(modalPhotoURL);modalPhotoURL=''}}
 // En el módulo vigente de Transferencias solamente la cuenta CIBC está autorizada.
 // Esta integración usa el mismo almacenamiento LOCAL del mismo navegador; no sincroniza entre dispositivos.
 function linkToPersonalTransfers(record,payment){
   if(currentUser!=='CIBC'||payment.method!=='transfer')return false;
   const key=PERSONAL_TRANSFERS_KEY;
   try{
     const existing=JSON.parse(localStorage.getItem(key)||'[]');if(!Array.isArray(existing))return false;
     if(existing.some(x=>x.sourceOF===record.of||x.sources?.some(s=>s.of===record.of)))return true;
     const normalized=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
     const idx=existing.findIndex(x=>normalized(x.name)===normalized(payment.payer));
     if(idx>=0){
       const current=existing[idx],total=current.amount+payment.amount;
       if(!Number.isSafeInteger(total)||total>999999999)return false;
       const parts=Array.isArray(current.parts)&&current.parts.length?current.parts:[current.amount];
       existing[idx]={...current,amount:total,parts:[...parts,payment.amount],sources:[...(current.sources||[]),{of:record.of,id:record.id,amount:payment.amount}]};
     }else{
       if(existing.length>=1500)return false;
       const date=new Date(record.at).toLocaleDateString('en-CA',{timeZone:'America/Santiago'});
       existing.push({id:record.id,name:payment.payer,amount:payment.amount,date,sourceOF:record.of,sources:[{of:record.of,id:record.id,amount:payment.amount}]});
     }
     localStorage.setItem(key,JSON.stringify(existing));return true;
   }catch(err){console.warn('Vinculación local transferencias',err);return false}
 }
 function dbEnabled(){return window.GestarkDBConfig?.enabled===true}
 function dbAvailable(){return dbEnabled() && window.GestarkDB?.configured===true}
 function dbState(message,badge='Local',kind=''){
   if($('db-status')){$('db-status').textContent=message;$('db-status').className='stat '+kind}
   if($('db-badge'))$('db-badge').textContent=badge;
 }
 async function loadDatabaseRecords(){
   if(!dbReady)return;
   try{
     records=await window.GestarkDB.list();renderRecords();
     dbState('Sincronizado · '+records.length+' entrega(s) compartidas · acceso: '+dbProfile.display_name,'Conectada','ok');
   }catch(err){dbState('No se pudo consultar la base de datos: '+err.message,'Sin conexión','bad')}
 }
 function dbPanelUI(){
   $('db-login').hidden=!dbAvailable()||dbReady;
   $('db-actions').hidden=!dbEnabled()||!dbReady;
   $('db-help').textContent=!dbEnabled()? 'No hay servicio central configurado. El guardado continúa exclusivamente en este dispositivo; no existe sincronización.':
       'Los datos personales y la firma se envían solo a la base autorizada; el registro central no se elimina desde la app.';
 }
 async function setupDB(){
   if(!dbEnabled()){
     dbState('Modo local · las entregas no se sincronizan entre dispositivos.','Local');dbPanelUI();return;
   }
   if(!dbAvailable()){dbState('La base central está activada, pero falta una URL o llave pública válida. No se permitirán registros locales hasta corregirla.','Error configuración','bad');$('db-login').hidden=true;$('db-help').textContent='Revisa gestark-db-config.js. Nunca uses una llave secreta.';return}
   dbState('Verificando sesión segura de base de datos…','Conectando');
   try{
     dbProfile=await window.GestarkDB.authorize(currentUser);
     dbReady=!!dbProfile;
     if(dbReady){operatorName=dbProfile.display_name;$('reg-operator').value=operatorName;await loadDatabaseRecords()}
     else dbState('Base configurada. Ingresa con una cuenta de Supabase Auth autorizada para Gestark.','Sin sesión');
   }catch(err){dbReady=false;dbProfile=null;dbState('Acceso a base pendiente: '+err.message,'Sin sesión','bad')}
   dbPanelUI();
 }
 async function connectDB(event){
   event.preventDefault();
   const email=$('db-email').value.trim(),password=$('db-password').value;
   if(!email||!password)return;
   $('db-connect').disabled=true;
   dbState('Validando credenciales de base de datos…','Conectando');
   try{
     dbProfile=await window.GestarkDB.signIn(email,password,currentUser);
     dbReady=true;operatorName=dbProfile.display_name;$('reg-operator').value=operatorName;
     $('db-password').value='';dbPanelUI();await loadDatabaseRecords();
   }catch(err){dbReady=false;dbProfile=null;dbState('No se pudo conectar: '+err.message,'Sin sesión','bad')}
   finally{$('db-connect').disabled=false;dbPanelUI()}
 }
 async function disconnectDB(){
   if(dbBusy)return;
   if(printQueue.length && !confirm('Hay comprobantes preparados. ¿Desconectar de la base sin descargarlos?'))return;
   try{await window.GestarkDB.signOut()}catch(_){ }
   dbReady=false;dbProfile=null;records=[];renderRecords();dbPanelUI();
   dbState('Sesión de base cerrada. Los registros centralizados no están disponibles hasta reconectar.','Sin sesión');
 }
 async function recoverReceipt(id){
   if(!dbReady){regStatus('Conecta la base de datos para recuperar comprobantes.','bad');return}
   const rec=records.find(r=>r.id===id);if(!rec)return;
   if(printQueue.some(x=>x.record.id===id)){toast('Comprobante ya preparado');return}
   try{
     const ev=await window.GestarkDB.evidence(id);
     const entry={record:{...rec},data:{order:rec.of,name:ev.receiver_name,rut:ev.receiver_rut},
       operator:rec.operator||rec.user,signature:ev.signature_png,pdfGenerated:false};
     printQueue.push(entry);updatePrintQueue();toast('Comprobante preparado para PDF');
   }catch(err){regStatus('No fue posible recuperar el comprobante: '+err.message,'bad')}
 }
 function canUse(){return active && document.documentElement.classList.contains('gestark-unlocked')}
 function status(text,kind=''){const e=$('scan-status');if(e){e.textContent=text;e.className='stat '+kind}}
 function regStatus(text,kind=''){const e=$('reg-feedback');if(e){e.textContent=text;e.className='stat '+kind}}
 function pdfStatus(text,kind=''){const e=$('pdf-status');if(e){e.textContent=text;e.className='stat '+kind}}
 function toast(text){const e=$('toast');e.textContent=text;e.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>e.classList.remove('visible'),2250)}
 function fmtDate(t){return new Date(t).toLocaleString('es-CL',{timeZone:'America/Santiago'})}
 function values(){return {order:$('field-order').value.trim(),name:$('field-name').value.trim(),rut:$('field-rut').value.trim()}}
 function clearCurrent(){
   confirmedRecord=null;confirmedSnapshot=null;
   currentOF='';lastScanAt=0;resumeScanAt=Date.now()+1500;
   for(const id of ['field-order','field-name','field-rut','manual-code'])$(id).value='';
   $('lastread').hidden=true;
   $('reg-physical').checked=false;
   updatePrintQueue();$('reg-save').disabled=false;$('clear-sign').disabled=false;
   regStatus('Aún no se ha confirmado una entrega.');pdfStatus('');$('after-confirm-new').hidden=true;
   $('rut-warning').textContent='';
   clearSign();resetPayment();setView('form');setStep(0,false);status(cameraOn?'Apunta a una nueva O.F.':'Pulsa Iniciar cámara para continuar.','ok');
 }
 function newOrder(){
   if(confirmedRecord && !confirmedSnapshot?.pdfGenerated && !printQueue.includes(confirmedSnapshot)){
     if(!confirm('Esta entrega se confirmó, pero su firma no está en la cola de impresión. ¿Continuar?'))return;
   }else if(!confirmedRecord && ($('field-name').value||$('field-rut').value||signed||paymentPhoto||$('pay-amount').value)){
     if(!confirm('¿Descartar los datos y la firma de la orden actual?'))return;
   }
   clearCurrent();toast('Nueva orden preparada');
 }
 function validOF(read,source='cámara'){
   if(!canUse()||confirmedRecord||!read?.valid)return false;
   if(currentOF){if(currentOF===read.of)return false;status('Para otra O.F., pulsa Nueva orden. La orden actual está protegida.','ok');return false}
   currentOF=read.of;lastScanAt=Date.now();
   $('field-order').value=read.of; if($('flow-order'))$('flow-order').textContent='O.F. '+read.of;
   $('last-of').textContent=read.of;
   $('lastread').hidden=false;
   status('O.F. '+read.of+' identificada. Verifica el número y completa el receptor.','ok');
   if(source==='cámara'){
     playScanBeep();try{navigator.vibrate?.(50)}catch(_){}
   }
   return true;
 }
 function onDecode(raw){
   if(Date.now()<resumeScanAt||currentOF||confirmedRecord)return;
   const p=core.parseBarcode(raw);
   if(p.valid)validOF(p,'cámara');
 }
 const scriptCache=new Map();
 function loadScript(url,global){
   if(window[global])return Promise.resolve(window[global]);
   if(scriptCache.has(url))return scriptCache.get(url);
   const p=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=url;s.async=true;s.onload=()=>window[global]?resolve(window[global]):reject(Error('Motor no disponible'));s.onerror=()=>reject(Error('Sin conexión para cargar el motor'));document.head.append(s)});
   scriptCache.set(url,p);p.catch(()=>scriptCache.delete(url));return p;
 }
 let scanAudio=null;
 function armScanBeep(){
   const AudioClass=window.AudioContext||window.webkitAudioContext;
   if(!AudioClass)return;
   try{
     if(!scanAudio)scanAudio=new AudioClass();
     if(scanAudio.state==='suspended')scanAudio.resume().catch(()=>{});
     // Iniciar un sonido mudo durante la interacción ayuda a habilitar Web Audio en Safari.
     const osc=scanAudio.createOscillator(),gain=scanAudio.createGain();
     gain.gain.value=0;
     osc.connect(gain);gain.connect(scanAudio.destination);
     osc.start();osc.stop(scanAudio.currentTime+.015);
     osc.onended=()=>{try{osc.disconnect();gain.disconnect()}catch(_){}};
   }catch(_){/* Sin audio: conservar el escáner operativo. */}
 }
  // Doble bip agudo, con timbre rico en armónicos, como un lector portátil.
  // Un solo EVENTO sonoro por O.F.; el par de pulsos es parte del mismo aviso.
  function playScanBeep(){
    if(!scanAudio||scanAudio.state!=='running')return;
    try{
      const start=scanAudio.currentTime+.006;
      const notes=[
        {offset:0, duration:.073, hz:1760, level:.48},
        {offset:.101, duration:.096, hz:2110, level:.52}
      ];
      notes.forEach((note)=>{
        const t=start+note.offset;
        const osc=scanAudio.createOscillator(),gain=scanAudio.createGain();
        osc.type='square'; // Onda más nítida que el seno anterior.
        osc.frequency.setValueAtTime(note.hz,t);
        osc.frequency.linearRampToValueAtTime(note.hz*1.025,t+note.duration*.7);
        gain.gain.setValueAtTime(.0001,t);
        gain.gain.linearRampToValueAtTime(note.level,t+.003);
        gain.gain.setValueAtTime(note.level,t+note.duration-.017);
        gain.gain.exponentialRampToValueAtTime(.0001,t+note.duration);
        osc.connect(gain);gain.connect(scanAudio.destination);
        osc.start(t);osc.stop(t+note.duration+.004);
        osc.onended=()=>{try{osc.disconnect();gain.disconnect()}catch(_){}};
      });
    }catch(_){/* El sonido es opcional; la lectura sigue funcionando. */}
  }

 // HD+: una sola cámara y lector principal como respaldo permanente.
 // Las ausencias de código son normales: no deben apagar el motor complementario.
 const ZX_LIBS=[
   'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js',
   'https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js'
 ];
 let farScanToken=0,farScanTimer=null,farScanReader=null,farScanCanvas=null;
 let farScanAttempts=0,farScanRegion='',farScanIssues=0;
 function hdMessage(message){ /* diagnóstico disponible solo en Laboratorio */ }
 function stopFarScan(){
   farScanToken++;
   if(farScanTimer!==null)clearTimeout(farScanTimer);
   farScanTimer=null;farScanReader=null;farScanCanvas=null;
   farScanAttempts=0;farScanRegion='';farScanIssues=0;
 }
 function decodeErrorLabel(err){
   const name=String(err?.name||err?.constructor?.name||'Error');
   const message=String(err?.message||'');
   // Evitar imprimir datos del fotograma o valores del comprobante.
   return (name==='Error'&&message?message:name).slice(0,110);
 }
 function isNoBarcode(err){
   // ZXing UMD esta minificado: NotFoundException puede llegar como "N".
   // Comparar por tipo real evita pausar el lector por un fotograma sin barras.
   const Z=window.ZXing;
   for(const type of ['NotFoundException','ChecksumException','FormatException','ReaderException']){
     const Ctor=Z?.[type];
     if(typeof Ctor==='function' && err instanceof Ctor)return true;
   }
   // Respaldo para errores de otras bibliotecas o builds no minificados.
   const parts=[err?.name,err?.constructor?.name,err?.message,err?.type].map(x=>String(x||'')).join(' ');
   return /NotFound|Not Found|Checksum|FormatException|ReaderException|no (?:barcode|code|reader)|not detected|cannot find|not found/i.test(parts);
 }
 async function initNativeHD(){
   const Native=window.BarcodeDetector;
   if(typeof Native!=='function')return null;
   try{
     const all=typeof Native.getSupportedFormats==='function'?await Native.getSupportedFormats():['code_128','code_39','itf'];
     const formats=['code_128','code_39','itf'].filter(f=>all.includes(f));
     return formats.length?new Native({formats}):null;
   }catch(e){console.info('Gestark: BarcodeDetector no disponible',decodeErrorLabel(e));return null}
 }
 async function initZXingHD(){
   let lastError;
   for(const url of ZX_LIBS){
     try{
       await loadScript(url,'ZXing');
       const Z=window.ZXing;
       if(!Z?.MultiFormatReader||!Z?.DecodeHintType||!Z?.BarcodeFormat||
          !Z?.HTMLCanvasElementLuminanceSource||!Z?.BinaryBitmap||!Z?.HybridBinarizer){
         throw Error('ZXing incompleto: faltan componentes de imagen');
       }
       const hints=new Map();
       hints.set(Z.DecodeHintType.POSSIBLE_FORMATS,[Z.BarcodeFormat.CODE_128,Z.BarcodeFormat.CODE_39,Z.BarcodeFormat.ITF]);
       hints.set(Z.DecodeHintType.TRY_HARDER,true);
       const reader=new Z.MultiFormatReader();
       reader.setHints(hints);
       return {Z,reader,hints};
     }catch(e){lastError=e;console.warn('Gestark HD+ biblioteca',decodeErrorLabel(e))}
   }
   throw lastError||Error('No se cargó ZXing');
 }
 async function startFarScan(){
   stopFarScan();
   const token=farScanToken;
   hdMessage('HD+: preparando lector adicional…');
   let native=null,zxing=null;
   try{
     native=await initNativeHD();
     if(!cameraOn||token!==farScanToken)return;
     if(!native){
       hdMessage('HD+: cargando ZXing (lector adicional)…');
       zxing=await initZXingHD();
     }
     if(!cameraOn||token!==farScanToken)return;
     farScanReader=zxing?.reader||native;
     farScanCanvas=document.createElement('canvas');
     const ctx=farScanCanvas.getContext('2d',{willReadFrequently:true});
     if(!ctx)throw Error('La cámara no permite analizar fotogramas');
     const regions=[
       {name:'zona central',top:.15,height:.70},
       {name:'imagen completa',top:0,height:1},
       {name:'parte superior',top:0,height:.62},
       {name:'parte inferior',top:.35,height:.65}
     ];
     let regionIndex=0;
     function decodeZXing(){
       const Z=zxing.Z;
       const luminance=new Z.HTMLCanvasElementLuminanceSource(farScanCanvas);
       const decode=binarizer=>{
         const bitmap=new Z.BinaryBitmap(new binarizer(luminance));
         try{return zxing.reader.decode(bitmap,zxing.hints)}finally{zxing.reader.reset()}
       };
       try{return decode(Z.HybridBinarizer)}
       catch(e){
         if(!isNoBarcode(e))throw e;
         if(Z.GlobalHistogramBinarizer&&farScanAttempts%4===0)return decode(Z.GlobalHistogramBinarizer);
         throw e;
       }
     }
     async function tick(){
       if(!cameraOn||token!==farScanToken||document.hidden)return;
       let pendingError=null;
       try{
         const video=document.querySelector('#camera video');
         if(video&&video.readyState>=2&&video.videoWidth>=640&&video.videoHeight>=360){
           const sw=video.videoWidth,sh=video.videoHeight;
           const region=regions[regionIndex++%regions.length];
           const sy=Math.round(sh*region.top),ch=Math.min(sh-sy,Math.round(sh*region.height));
           const scale=Math.min(1,2048/sw);
           const w=Math.max(1,Math.round(sw*scale)),h=Math.max(1,Math.round(ch*scale));
           if(farScanCanvas.width!==w)farScanCanvas.width=w;
           if(farScanCanvas.height!==h)farScanCanvas.height=h;
           ctx.drawImage(video,0,sy,sw,ch,0,0,w,h);
           farScanAttempts++;
           farScanRegion=region.name;
           try{
             const results=native?await native.detect(farScanCanvas):[decodeZXing()];
             for(const result of results){
               const raw=typeof result.getText==='function'?result.getText():result.rawValue||result.text;
               if(raw){onDecode(raw,(native?'HD+ nativo':'HD+ ZXing')+' · '+region.name);break}
             }
             farScanIssues=0;
           }catch(e){
             if(isNoBarcode(e)){farScanIssues=0}
             else{farScanIssues++;pendingError=e;console.warn('Gestark HD+ fotograma',decodeErrorLabel(e))}
           }
           // Error real: contar fallos reiterados en vez de desactivar al primer fotograma.
           if(farScanIssues>=6){
             hdMessage('HD+ pausado: '+decodeErrorLabel(pendingError)+'; lector principal activo.');
             stopFarScan();return;
           }
           if(pendingError){
             hdMessage('HD+ comprobando lectura ('+farScanIssues+'/6): '+decodeErrorLabel(pendingError));
           }else if(farScanAttempts===1||farScanAttempts%4===0){
             hdMessage('HD+ activo ('+(native?'nativo':'ZXing')+') · vídeo '+sw+' × '+sh+' px · análisis '+w+' × '+h+' px · '+farScanRegion+' · '+farScanAttempts+' intentos');
           }
         }else if(farScanAttempts===0){hdMessage('HD+: esperando fotogramas de la cámara…')}
       }catch(e){
         // Una excepción inesperada debe quedar diagnosticada, no ocultarse.
         hdMessage('HD+ pausado: '+decodeErrorLabel(e)+'; lector principal activo.');
         console.warn('Gestark HD+ interrumpido',e);
         stopFarScan();return;
       }
       if(token===farScanToken&&cameraOn)farScanTimer=setTimeout(tick,560);
     }
     hdMessage('HD+ activo ('+(native?'nativo':'ZXing')+') · esperando primera imagen…');
     farScanTimer=setTimeout(tick,220);
   }catch(e){
     console.warn('Gestark HD+ inicio',e);
     
   }
 }

 function showCamera(on){
   cameraOn=on;
   $('camera').style.display=on?'block':'none';
   $('cam-placeholder').hidden=on;
   $('start-cam').disabled=on;
   $('stop-cam').disabled=!on;
   $('torch').hidden=!on||!flashOnSupported;
   $('cam-badge').textContent=on?'Activa':'Apagada';
 }
 let flashOnSupported=false;
 function formats(){const f=window.Html5QrcodeSupportedFormats;return ['CODE_128','CODE_39','ITF'].map(k=>f?.[k]).filter(x=>x!==undefined)}
 function cameraConfig(hd){
   const cfg={fps:14,disableFlip:true};
   if(hd)cfg.videoConstraints={facingMode:'environment',width:{ideal:1920},height:{ideal:1080},frameRate:{ideal:24,max:30}};
   return cfg;
 }
 function permissionIssue(err){return /denied|permission|notallowed|not.allowed|securityerror/i.test(String(err?.name||'')+' '+String(err?.message||err))}
 async function startCamera(){
   if(!canUse()||cameraOn||working)return;
   if(!navigator.mediaDevices?.getUserMedia){status('Cámara no disponible. Abre Gestark por HTTPS.','bad');return}
   armScanBeep();working=true;$('start-cam').disabled=true;status('Iniciando cámara…');
   try{
     await loadScript(SCAN_LIB,'Html5Qrcode');let lastErr=null;
     for(const hd of [true,false]){
       const candidate=new Html5Qrcode('camera',{formatsToSupport:formats(),useBarCodeDetectorIfSupported:true,verbose:false});
       try{await candidate.start({facingMode:'environment'},cameraConfig(hd),onDecode,()=>{});scanner=candidate;break}
       catch(err){lastErr=err;try{await candidate.clear()}catch(_){}if(permissionIssue(err))break}
     }
     if(!scanner)throw lastErr||Error('Sin cámara');
     if(document.hidden){await stopCamera();return}
     flashOnSupported=!!scanner.getRunningTrackCapabilities?.()?.torch;
     showCamera(true);status('Cámara activa. Enfoca el código de barras.','ok');
     // Segundo motor HD en paralelo. Sin controles de lente, zoom ni diagnóstico.
     startFarScan();
   }catch(err){
     console.warn('Entregas contingentes: cámara',err);
     stopFarScan();try{await scanner?.stop()}catch(_){}try{await scanner?.clear()}catch(_){}scanner=null;
     showCamera(false);status(permissionIssue(err)?'Permiso de cámara denegado. Revisa Ajustes.':'No fue posible iniciar la cámara. Puedes ingresar la O.F. manualmente.','bad');
   }finally{working=false;$('start-cam').disabled=cameraOn}
 }
 async function stopCamera(){
   if(stopping)return;stopping=true;stopFarScan();
   try{if(scanner){try{await scanner.stop()}catch(_){}try{await scanner.clear()}catch(_){}scanner=null}}
   finally{flashOn=false;flashOnSupported=false;showCamera(false);stopping=false;status('Cámara detenida. Los datos actuales se conservan.')}
 }
 async function toggleTorch(){
   if(!cameraOn||!scanner)return;
   try{await scanner.applyVideoConstraints({advanced:[{torch:!flashOn}]});flashOn=!flashOn;$('torch').textContent=flashOn?'Apagar luz':'Linterna'}
   catch(_){flashOnSupported=false;$('torch').hidden=true;toast('Linterna no disponible')}
 }
 function prepareSign(){signatureCanvas=$('signature');const resize=()=>{
   const url=signed?signatureCanvas.toDataURL('image/png'):null;
   const rect=signatureCanvas.getBoundingClientRect();const scale=Math.min(window.devicePixelRatio||1,2.5);
   signatureCanvas.width=Math.round(rect.width*scale);signatureCanvas.height=Math.round(rect.height*scale);
   sigCtx=signatureCanvas.getContext('2d');sigCtx.setTransform(scale,0,0,scale,0,0);sigCtx.lineWidth=2.1;sigCtx.lineCap='round';sigCtx.lineJoin='round';sigCtx.strokeStyle='#174b3b';
   if(url){const im=new Image();im.onload=()=>sigCtx.drawImage(im,0,0,rect.width,rect.height);im.src=url}
 };
   resizeSignature=resize;requestAnimationFrame(resize);
   let rr;window.addEventListener('resize',()=>{clearTimeout(rr);rr=setTimeout(resize,220)});
   function pos(e){const r=signatureCanvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top}}
   signatureCanvas.addEventListener('pointerdown',e=>{if(!canUse()||confirmedRecord)return;penDown=true;signed=true;const ph=$('sign-placeholder');if(ph)ph.hidden=true;signatureCanvas.setPointerCapture(e.pointerId);const p=pos(e);sigCtx.beginPath();sigCtx.moveTo(p.x,p.y);sigCtx.lineTo(p.x+.02,p.y+.02);sigCtx.stroke()});
   signatureCanvas.addEventListener('pointermove',e=>{if(!penDown)return;const p=pos(e);sigCtx.lineTo(p.x,p.y);sigCtx.stroke()});
   ['pointerup','pointercancel','lostpointercapture'].forEach(ev=>signatureCanvas.addEventListener(ev,()=>penDown=false));
 }
 function clearSign(){if(signatureCanvas&&sigCtx){sigCtx.clearRect(0,0,signatureCanvas.width,signatureCanvas.height)}signed=false;const ph=$('sign-placeholder');if(ph)ph.hidden=false}

 // Eliminar los amplios márgenes transparentes alrededor de la firma antes de imprimir.
 function exportSignatureInk(){
   const source=signatureCanvas,sourceCtx=source.getContext('2d');
   const w=source.width,h=source.height;
   const pixels=sourceCtx.getImageData(0,0,w,h).data;
   let minX=w,minY=h,maxX=-1,maxY=-1;
   // Muestreo exacto de píxeles no transparentes: ni el fondo ni las guías son tinta.
   for(let y=0;y<h;y++)for(let x=0;x<w;x++){
     if(pixels[(y*w+x)*4+3]>25){if(x<minX)minX=x;if(y<minY)minY=y;if(x>maxX)maxX=x;if(y>maxY)maxY=y}
   }
   if(maxX<0||maxY<0)return source.toDataURL('image/png');
   const pad=Math.max(14,Math.round((window.devicePixelRatio||1)*12));
   const sx=Math.max(0,minX-pad),sy=Math.max(0,minY-pad);
   const ex=Math.min(w,maxX+pad+1),ey=Math.min(h,maxY+pad+1);
   const output=document.createElement('canvas');output.width=ex-sx;output.height=ey-sy;
   output.getContext('2d').drawImage(source,sx,sy,output.width,output.height,0,0,output.width,output.height);
   return output.toDataURL('image/png');
 }
 function updatePrintQueue(){
   const count=printQueue.length;
   const target=$('print-queue');
   if(target){
     const pages=Math.ceil(count/3);
     target.replaceChildren();
     const heading=document.createElement('strong');heading.textContent=count+' comprobante'+(count===1?'':'s')+' preparado'+(count===1?'':'s');
     target.append(heading,document.createTextNode(count?(' · '+pages+' hoja'+(pages===1?'':'s')+' A4 (hasta tres por página). Descarga antes de cerrar.'):'Los siguientes comprobantes se reunirán aquí hasta descargar el PDF.'));
   }
   updateFlowCounters();$('export-pdf').disabled=count===0;
   $('print-discard').disabled=count===0;
   $('export-pdf').textContent=count?'Descargar PDF · '+count+' comprobante'+(count===1?'':'s'):'Descargar hoja de comprobantes';
 }
 function discardPrintQueue(){
   if(!printQueue.length)return;
   if(!confirm('¿Descartar los '+printQueue.length+' comprobantes preparados? No se podrán recuperar sus firmas desde el historial.'))return;
   printQueue=[];
   if(confirmedSnapshot)confirmedSnapshot.pdfGenerated=false;
   updatePrintQueue();
   pdfStatus('Comprobantes descartados. Los estados de entrega no cambian.');
 }
 function updateRutWarning(){
   const rut=$('field-rut').value.trim(),el=$('rut-warning');
   const ok=core.validateRut(rut);
   el.textContent=!rut?'':ok?'RUT: dígito verificador válido.':'Revisa el RUT: dígito verificador inválido.';
   el.className='hint '+(rut&&!ok?'bad':'');
 }
 function makeRecordId(){
   try{if(crypto.randomUUID)return 'CONT-'+crypto.randomUUID().toUpperCase()}catch(_){}
   const b=new Uint8Array(16);crypto.getRandomValues(b);b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
   const hex=Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
   return 'CONT-'+[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-').toUpperCase();
 }
 function loadRecords(){
   try{const a=JSON.parse(localStorage.getItem(deliveryStorage)||'[]');return Array.isArray(a)?a.filter(x=>x&&/^\d{9}$/.test(x.of)&&typeof x.id==='string'&&Number.isFinite(x.at)&&typeof x.status==='string').slice(-MAX):[]}
   catch(_){return []}
 }
 function storeRecords(next){
   try{localStorage.setItem(deliveryStorage,JSON.stringify(next));records=next;renderRecords();return true}
   catch(_){regStatus('No fue posible guardar el registro. Revisa el almacenamiento del iPhone.','bad');return false}
 }
 async function registerDelivery(){
   if(!canUse()||confirmedRecord||dbBusy)return;
   if(dbEnabled()&&!dbReady){regStatus('Conecta la base de datos antes de confirmar la entrega. No se guardará localmente como respaldo silencioso.','bad');return}

   const data=values();
   if(!/^\d{9}$/.test(data.order)||data.order!==currentOF){regStatus('Escanea o ingresa una O.F. válida de nueve dígitos.','bad');return}
   if(!data.name){regStatus('Escribe el nombre de la persona que recibe.','bad');$('field-name').focus();return}
   if(core.validateRut(data.rut)!==true){regStatus('Introduce un RUT válido de la persona que recibe.','bad');$('field-rut').focus();return}
   if(!signed){regStatus('Falta la firma del receptor.','bad');$('signature').scrollIntoView({behavior:'smooth',block:'center'});return}
   const site=$('reg-site').value.trim();if(!site){regStatus('Indica el punto de entrega.','bad');return}
   const reason=$('reg-reason').value;
   if(!reason){regStatus('Selecciona el motivo de contingencia.','bad');return}
   if(reason==='Otro'&&!$('reg-notes').value.trim()){regStatus('Describe el motivo de contingencia.','bad');return}
   if(!$('reg-physical').checked){regStatus('Debes confirmar expresamente la entrega física.','bad');return}
   const payment=readPayment(true);if(!payment){setView('form');setStep(1);regStatus('Revisa la sección de pago antes de confirmar.','bad');return}
   if(records.some(r=>r.of===data.order)){regStatus('Esta O.F. ya tiene un registro confirmado. Verifica antes de continuar.','bad');return}
   let record={id:makeRecordId(),of:data.order,at:Date.now(),user:currentUser,status:'pending',reason,site:site.slice(0,90),payment:{...payment,photoHash:payment.photoHash||''}};
   // No conectar evidencia bancaria al esquema central antiguo: requiere migración segura explícita.
   if(dbEnabled()&&payment.method!=='none'){regStatus('La base central requiere ampliar el esquema de pagos. Para evitar registros incompletos, no se confirma un cobro con la configuración actual.','bad');return}
   if(!dbEnabled()&&payment.method==='transfer'){
     try{await writePhoto(record.id,paymentPhoto,payment.photoHash)}
     catch(err){regStatus('No se pudo guardar la fotografía. Libera espacio o habilita almacenamiento del navegador antes de entregar.','bad');return}
   }
   const signatureData=exportSignatureInk();
   if(dbEnabled()){
     dbBusy=true;$('reg-save').disabled=true;
     regStatus('Guardando entrega y firma en la base central…');
     try{
       record=await window.GestarkDB.confirm(record,data,signatureData,$('reg-notes').value.trim());
       // La confirmación válida proviene del servidor, nunca del almacenamiento local.
       records=[...records,record];renderRecords();dbState('Entrega registrada en base central · O.F. '+record.of,'Conectada','ok');
     }catch(err){
       $('reg-save').disabled=false;
       const duplicate=err.message?.includes('duplicate key')||err.message?.includes('contingency_deliveries_of_key');
       regStatus(duplicate?'Esta O.F. ya existe en la base central. Actualiza el historial.':'No se confirmó la entrega en la base de datos: '+err.message,'bad');
       await loadDatabaseRecords();return;
     }finally{dbBusy=false}
   }else{
     if(!storeRecords([...records,record])){if(payment.method==='transfer')await deletePhotos([record.id]);return}
   }
   if(!dbEnabled()&&payment.method==='transfer'){
     const linked=linkToPersonalTransfers(record,payment);
     record.transferLink=linked?'local-linked':'local-pending';
     // El registro ya quedó confirmado. Si falla la vinculación, permitir reintentar desde historial.
     storeRecords(records.map(r=>r.id===record.id?{...r,transferLink:record.transferLink}:r));
   }
   confirmedRecord=record;
   confirmedSnapshot={data:{...data},record:{...record},operator:operatorName||currentUser,signature:signatureData,pdfGenerated:false};
   printQueue.push(confirmedSnapshot);updatePrintQueue();
   $('reg-save').disabled=true;$('clear-sign').disabled=true;$('after-confirm-new').hidden=false;
   const transferMessage=payment.method==='transfer'?(record.transferLink==='local-linked'?' Transferencia anotada en el registro local de CIBC.':' Transferencia pendiente de traspaso al Registro de transferencias.'):'';
   regStatus('Entrega confirmada. Comprobante añadido al PDF.'+transferMessage,'ok');toast('Entrega registrada ✓');updateFlowCounters();
 }
 function renderRecords(){
   const root=$('reg-history');const pending=records.filter(r=>r.status==='pending');
   $('reg-count').textContent=String(pending.length);updateFlowCounters();
   $('reg-copy').disabled=!pending.length;$('reg-clear').disabled=dbEnabled()||!records.some(r=>r.status==='regularized');
   root.replaceChildren();
   if(!records.length){const p=document.createElement('div');p.className='empty';p.textContent=dbEnabled()?'No hay entregas cargadas desde la base. Conecta o actualiza la sesión.':'Aún no hay entregas registradas en este dispositivo.';root.append(p);return}
   for(const rec of [...records].reverse()){
     const row=document.createElement('div');row.className='mini-row';
     const info=document.createElement('div');info.style.flex='1';
     const code=document.createElement('strong');code.className='code';code.textContent=rec.of;
     const meta=document.createElement('small');meta.textContent=fmtDate(rec.at)+' · '+rec.user;
     const state=document.createElement('small');state.className=rec.status==='regularized'?'delivery-status done':'delivery-status';state.textContent=rec.status==='regularized'?'Regularizada manualmente':'Pendiente de regularizar';
     info.append(code,meta,state);
     if(rec.payment){const pay=document.createElement('small');pay.textContent=rec.payment.method==='transfer'?'Transferencia informada · '+money(rec.payment.amount)+(rec.transferLink==='local-linked'?' · anotada en Transferencias':' · por traspasar'):rec.payment.method==='cash'?'Efectivo recibido · '+money(rec.payment.amount):'Sin cobro en entrega';info.append(pay)}
     row.append(info);
     if(rec.payment?.method==='transfer'&&!dbEnabled()){
       const view=document.createElement('button');view.type='button';view.className='micro';view.textContent='Foto';view.dataset.action='show-photo';view.dataset.id=rec.id;view.dataset.of=rec.of;row.append(view);
       if(currentUser==='CIBC'&&rec.transferLink!=='local-linked'){
         const push=document.createElement('button');push.type='button';push.className='micro';push.textContent='Traspasar';push.dataset.action='link-transfer';push.dataset.id=rec.id;row.append(push);
       }
     }
     if(rec.status==='pending'){
       const button=document.createElement('button');button.className='micro';button.type='button';button.textContent='Regularizada';
       button.dataset.action='regularize';button.dataset.id=rec.id;
       row.append(button);
     }
     if(dbReady){
       const restore=document.createElement('button');restore.className='micro';restore.type='button';
       restore.textContent='PDF';restore.dataset.action='recover';restore.dataset.id=rec.id;
       restore.title='Preparar comprobante desde evidencia autorizada';row.append(restore);
     }
     root.append(row);
   }
 }
 async function copyText(s){try{await navigator.clipboard.writeText(s);return true}catch(_){}
   const t=document.createElement('textarea');t.value=s;t.style.cssText='position:fixed;left:-10000px';document.body.append(t);t.select();let ok=false;try{ok=document.execCommand('copy')}catch(_){}t.remove();return ok;
 }
 async function copyPending(){
   const pending=records.filter(r=>r.status==='pending');if(!pending.length)return;
   const content=['OF\tFecha (Chile)\tUsuario\tID\tEstado']
     .concat(pending.map(x=>[x.of,fmtDate(x.at),x.user,x.id,'Pendiente'].join('\t'))).join('\n');
   toast(await copyText(content)?'Pendientes copiados para Excel':'No se pudo copiar');
 }
 async function regularize(id){
   const rec=records.find(x=>x.id===id&&x.status==='pending');if(!rec||dbBusy)return;
   if(!confirm('¿Confirmas que la O.F. '+rec.of+' YA fue regularizada en el sistema autorizado de Starken? Gestark no realiza esa regularización por sí mismo.'))return;
   if(dbEnabled()){
     if(!dbReady){regStatus('Necesitas conexión autorizada para regularizar.','bad');return}
     dbBusy=true;
     try{await window.GestarkDB.regularize(id);await loadDatabaseRecords();toast('Estado regularizado guardado en la base')}
     catch(err){regStatus('No se pudo regularizar en la base: '+err.message,'bad')}
     finally{dbBusy=false}
   }else if(storeRecords(records.map(x=>x.id===id?{...x,status:'regularized',regularizedAt:Date.now()}:x)))toast('Marcada como regularizada manualmente');
 }
 // Mantener solamente el ID como marca discreta de trazabilidad del comprobante.
 function pdfReceipt(doc,entry,index){
   const p=entry.record,d=entry.data;
   const width=210,margin=10,gap=4,cardH=(297-20-2*gap)/3;
   const y=10+(index%3)*(cardH+gap),x=margin,w=width-margin*2;
   const ink=[24,61,45],muted=[91,115,102],green=[16,103,72],line=[207,225,215];
   const text=(str,tx,ty,size=8,bold=false,color=ink)=>{
     doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);doc.setTextColor(...color);
     doc.text(String(str??''),tx,ty);
   };
   const clipped=(str,maxWidth,size=8,bold=false)=>{
     let value=String(str??'').replace(/\s+/g,' ').trim();
     doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);
     while(value.length && doc.getTextWidth(value)>maxWidth){value=value.slice(0,-1)}
     return value.length<String(str??'').replace(/\s+/g,' ').trim().length?value.slice(0,-3)+'...':value;
   };
   const box=(bx,by,bw,bh,r=2)=>{doc.setDrawColor(...line);doc.setFillColor(246,251,248);doc.roundedRect(bx,by,bw,bh,r,r,'FD')};
   doc.setDrawColor(...line);doc.setLineWidth(.28);doc.roundedRect(x,y,w,cardH,3,3,'S');
   doc.setFillColor(...green);doc.roundedRect(x,y,w,17,3,3,'F');doc.rect(x,y+10,w,7,'F');
   text('Gestark',x+6,y+10.4,13,true,[255,255,255]);
   text('GREENBOX',x+36,y+10,7,true,[224,246,233]);
   doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(9);
   doc.text('ENTREGA CONTINGENTE',x+w-6,y+9.4,{align:'right'});
   doc.setFont('helvetica','normal');doc.setFontSize(7);
   doc.text('Registro interno de recepción',x+w-6,y+13.4,{align:'right'});
   // Tres columnas, como la maqueta aprobada.
   const rowY=y+21,leftX=x+6,midX=x+70,rightX=x+142;
   box(leftX,rowY,60,22,2.5);
   text('ORDEN DE FLETE',leftX+3,rowY+5,7,true,muted);
   text(d.order,leftX+3,rowY+13.5,18,true,ink);
   text(fmtDate(p.at),leftX+3,rowY+19.3,6.7,false,muted);
   text('RECEPTOR',midX,rowY+5,7,true,muted);
   text(clipped(d.name,65,9.5,true),midX,rowY+11.5,9.5,true,ink);
   text('RUT: '+d.rut,midX,rowY+18,8,false,ink);
   text('ID',rightX,rowY+5,7,true,muted);
   // UUID completo, dividido en líneas para evitar truncar el identificador.
   const id=String(p.id||'');
   doc.setFont('helvetica','normal');doc.setFontSize(6.4);
   const idLines=doc.splitTextToSize(id,48);
   idLines.slice(0,3).forEach((s,j)=>text(s,rightX,rowY+10+j*3.3,6.4,false,ink));
   const detailY=y+49;
   text('SUCURSAL',leftX,detailY,7,true,muted);
   text(clipped(p.site,57,8,false),leftX,detailY+5,8,false,ink);
   text('MOTIVO',midX,detailY,7,true,muted);
   text(clipped(p.reason,64,8,false),midX,detailY+5,8,false,ink);
   text('RESPONSABLE',rightX,detailY,7,true,muted);
   text(clipped(entry.operator,47,8,false),rightX,detailY+5,8,false,ink);
   // Pago legible sin ampliar el comprobante: tres por hoja A4.
   const pay=p.payment||{method:'none',amount:0};
   const payLabel=pay.method==='transfer'?'TRANSFERENCIA INFORMADA':pay.method==='cash'?'EFECTIVO RECIBIDO':'SIN COBRO EN ENTREGA';
   text('PAGO: '+payLabel+(pay.amount?' · '+money(pay.amount):''),leftX,y+56.2,7,true,pay.method==='transfer'?[135,101,37]:green);
   // Panel blanco para firma; idéntico tamaño de hoja A4.
   const signY=y+59,signH=23;
   doc.setFillColor(255,255,255);doc.setDrawColor(...line);
   doc.roundedRect(leftX,signY,w-12,signH,2.5,2.5,'FD');
   text('RECIBO CONFORME',leftX+3,signY+5,7.2,true,ink);
   text('Recibí la encomienda indicada y dejo constancia con mi firma.',leftX+3,signY+9,6.6,false,muted);
   if(entry.signature){
     try{
       const img=doc.getImageProperties(entry.signature);
       const maxW=95,maxH=12;
       const ratio=Math.min(maxW/img.width,maxH/img.height);
       const dw=img.width*ratio,dh=img.height*ratio;
       doc.addImage(entry.signature,'PNG',leftX+6+(maxW-dw)/2,signY+10.3+(12-dh)/2,dw,dh);
     }catch(err){console.warn('Firma PDF',err)}
   }
   text('FIRMA DE RECEPCIÓN',leftX+110,signY+16,7,true,muted);
   const footY=y+cardH-3.8;
   text('PENDIENTE DE REGULARIZACIÓN',leftX,footY,7,true,[137,101,39]);
   doc.setFont('helvetica','normal');doc.setFontSize(7);doc.setTextColor(...muted);
   doc.text('Gestark / Greenbox',x+w-6,footY,{align:'right'});
   // Marcas discretas para facilitar el corte al imprimir.
   if(index%3!==2){doc.setDrawColor(184,196,187);doc.setLineDashPattern([2,2],0);doc.line(x,y+cardH+gap/2,x+w,y+cardH+gap/2);doc.setLineDashPattern([],0)}
 }
 async function exportPdf(){
   if(!printQueue.length){pdfStatus('Primero confirma una entrega para preparar su comprobante.','bad');return}
   const items=printQueue.slice();
   $('export-pdf').disabled=true;pdfStatus('Generando hoja de '+items.length+' comprobante(s)…');
   try{
     await loadScript(PDF_LIB,'jspdf');const PDF=window.jspdf?.jsPDF;if(!PDF)throw Error('No se cargó el generador PDF');
     const doc=new PDF({unit:'mm',format:'a4',compress:true});
     items.forEach((entry,i)=>{if(i&&i%3===0)doc.addPage();pdfReceipt(doc,entry,i)});
     const stamp=new Date().toLocaleDateString('en-CA',{timeZone:'America/Santiago'}).replace(/-/g,'');
     doc.save('Gestark_Greenbox_Entregas_'+stamp+'_'+items.length+'_comprobantes.pdf');
     items.forEach(entry=>entry.pdfGenerated=true);
     printQueue=printQueue.filter(x=>!items.includes(x));updatePrintQueue();
     pdfStatus('PDF generado: '+items.length+' comprobante(s), '+Math.ceil(items.length/3)+' página(s) A4. Guarda el archivo antes de cerrar la app.','ok');
     toast('Hoja de comprobantes generada ✓');
   }catch(err){console.warn('Gestark: PDF no disponible',err);pdfStatus('No fue posible generar el PDF; los comprobantes siguen preparados. Inténtalo de nuevo.','bad')}
   finally{updatePrintQueue()}
 }
 function init(){
   if(active)return;active=true;
   records=dbEnabled()?[]:loadRecords();renderRecords();$('workspace').hidden=false;
   prepareSign();$('advanced-db').hidden=!dbEnabled();
   $('reg-operator').value=operatorName||currentUser;
   document.querySelectorAll('.mode-tab').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
   document.querySelectorAll('.step-tab').forEach(b=>b.addEventListener('click',()=>{
     const idx=Number(b.dataset.step);if(idx<currentStep){setStep(idx);return}
     for(let k=currentStep;k<idx;k++){if(!stepValid(k)){setStep(k);return}}
     setStep(idx);
   }));
   $('step-prev').addEventListener('click',()=>setStep(currentStep-1));
   $('step-next').addEventListener('click',nextStep);
   document.querySelectorAll('input[name="pay-condition"],input[name="pay-method"]').forEach(e=>e.addEventListener('change',updatePaymentUI));
   $('payment-photo').addEventListener('change',captureEvidence);$('payment-photo-file').addEventListener('change',captureEvidence);
   $('payment-remove').addEventListener('click',()=>{dropPaymentPhoto();paymentStatus('Fotografía eliminada.','bad')});
   $('close-photo').addEventListener('click',closePhoto);$('photo-dialog').addEventListener('close',closePhoto);
   updatePaymentUI();setView('form');setStep(0,false);
   $('start-cam').addEventListener('click',startCamera);$('stop-cam').addEventListener('click',stopCamera);
   $('torch').addEventListener('click',toggleTorch);
   $('new-order').addEventListener('click',newOrder);$('after-confirm-new').addEventListener('click',newOrder);
   $('manual-form').addEventListener('submit',e=>{e.preventDefault();const read=core.parseBarcode($('manual-code').value);if(!read.valid){status('O.F. no reconocida. Revisa los nueve dígitos o el código largo.','bad');return}validOF(read,'manual');$('manual-code').value=''});
   $('field-rut').addEventListener('input',updateRutWarning);
   $('clear-sign').addEventListener('click',()=>{if(!confirmedRecord)clearSign()});
   $('db-login').addEventListener('submit',connectDB);
   $('db-disconnect').addEventListener('click',disconnectDB);
   $('db-refresh').addEventListener('click',loadDatabaseRecords);
   setupDB();
   $('reg-save').addEventListener('click',registerDelivery);
   $('export-pdf').addEventListener('click',exportPdf);
   $('print-discard').addEventListener('click',discardPrintQueue);
   updatePrintQueue();
   $('reg-copy').addEventListener('click',copyPending);
   $('reg-clear').addEventListener('click',()=>{
     if(dbEnabled()){toast('Los registros centrales se conservan para auditoría');return}
     if(confirm('¿Eliminar solo entregas regularizadas y sus fotografías locales? No podrán recuperarse.')){const remove=records.filter(x=>x.status==='regularized').map(x=>x.id);if(storeRecords(records.filter(x=>x.status!=='regularized')))deletePhotos(remove)}
   });
   $('reg-history').addEventListener('click',e=>{
     const b=e.target.closest('[data-action]');if(!b)return;
     if(b.dataset.action==='regularize')regularize(b.dataset.id);
     if(b.dataset.action==='recover')recoverReceipt(b.dataset.id);
     if(b.dataset.action==='show-photo')showPhoto(b.dataset.id,b.dataset.of);
     if(b.dataset.action==='link-transfer'){
       const rec=records.find(x=>x.id===b.dataset.id);
       if(rec&&rec.payment?.method==='transfer'&&linkToPersonalTransfers(rec,rec.payment)){
         storeRecords(records.map(x=>x.id===rec.id?{...x,transferLink:'local-linked'}:x));toast('Transferencia anotada localmente');
       }else toast('No se pudo traspasar; revisa espacio y la cuenta');
     }
   });
   const warm=()=>loadScript(SCAN_LIB,'Html5Qrcode').catch(()=>{});
   if('requestIdleCallback' in window)window.requestIdleCallback(warm,{timeout:2500});else setTimeout(warm,500);
 }
 document.addEventListener('gestark:ready',e=>{
   const u=e.detail||{};if(!u.username){$('gate').hidden=false;return}
   currentUser=String(u.username).slice(0,30);operatorName=String(u.name||u.username).slice(0,70);
   deliveryStorage=DELIVERY_PREFIX+currentUser;init();
 });
 window.addEventListener('storage',e=>{if(active&&!dbEnabled()&&e.key===deliveryStorage){records=loadRecords();renderRecords()}});
 window.addEventListener('beforeunload',e=>{if(printQueue.length){e.preventDefault();e.returnValue=''}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&cameraOn)stopCamera()});
 window.addEventListener('pagehide',()=>{if(cameraOn||scanner)stopCamera()});
})();
