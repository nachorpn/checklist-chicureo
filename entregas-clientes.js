/* Gestark · Entregas clientes · 2026.11.23.29
 * Escáner continuo usando motor aprobado de Contingentes/Laboratorio 2026.11.21.15.
 * RUT opcional del Directorio preservado desde la selección hasta el retiro finalizado.
 */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const core=window.GestarkLabCore;
const SCAN_LIB='https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';
const HISTORY_KEY='gestark:clients:rosters:v1'; // nómina general en este navegador
const STATUS_KEY='gestark:clients:system-closure:v1'; // control de cierre por O.F. y retiro
const DRAFT_PREFIX='gestark:clients:draft:v1:';
const SHARE_TEXT_PENDING='¡Hola! 😊 Te compartimos tus pedidos retirados hoy. En breve te enviaremos el total a pagar.';
const SHARE_TEXT_PAID='¡Hola! 😊 Te compartimos tus pedidos retirados hoy. Están pagados, no tienes saldo pendiente.';
const shareText=entry=>entry?.paid===true?SHARE_TEXT_PAID:SHARE_TEXT_PENDING;
// Estado exclusivo de la interfaz y del envío: nunca se guarda en nómina ni en Firebase.
function mountPaymentOption(){
 if($('orders-paid'))return;
 const label=document.createElement('label');label.htmlFor='orders-paid';
 label.style.cssText='display:flex;align-items:center;gap:12px;padding:12px 14px;margin-top:12px;border:1px solid #d9e3db;border-radius:11px;background:#f3f7f2;color:#293b30;cursor:pointer;min-height:48px';
 const input=document.createElement('input');input.type='checkbox';input.id='orders-paid';input.autocomplete='off';input.checked=false;
 input.style.cssText='appearance:auto;-webkit-appearance:checkbox;width:20px;height:20px;flex:0 0 20px;margin:0;padding:0;accent-color:#355c43';
 const body=document.createElement('span');body.style.cssText='display:flex;flex-direction:column;gap:3px;line-height:1.35';
 const title=document.createElement('span');title.style.cssText='font-size:14px;font-weight:600';title.textContent='Pedidos previamente pagados';
 const note=document.createElement('span');note.style.cssText='font-size:12px;font-weight:400;color:#58665e';note.textContent='Marca solo si todas las órdenes de este retiro están pagadas.';
 body.append(title,note);label.append(input,body);$('finish').before(label);
}
function resetPaymentOption(){const input=$('orders-paid');if(input)input.checked=false}
function syncPaymentOption(){const input=$('orders-paid');if(input){input.disabled=$('finish').disabled;if(input.disabled)input.checked=false}}

const MAX_ROSTER=500;
let active=false,currentUser='',operatorName='',draftKey='',draft={client:'',orders:[]},history=[],view='scan';
let scanner=null,cameraOn=false,working=false,stopping=false,flashOn=false;
let lastDuplicateOf='',lastDuplicateAt=0,toastTimer=null,preparedFiles=[],preparedEntry=null,historyShow=80;
let sharePreviewUrl='';
const cleanName=s=>String(s||'').replace(/\s+/g,' ').trim().slice(0,80);
const validOF=s=>/^\d{9}$/.test(String(s||''));
function cleanClientRef(value){
 if(!value||typeof value!=='object')return null;
 const rut=String(value.rut||'').trim().toUpperCase(),id=String(value.id||'');
 if(!/^[0-9]{1,3}(\.[0-9]{3}){0,2}-[0-9K]$/.test(rut)||!/^[0-9]{1,8}-[0-9K]$/.test(id)||rut.replace(/\./g,'')!==id)return null;
 const [body,dv]=id.split('-');if(Number(body)===0)return null;
 let sum=0,factor=2;for(let i=body.length-1;i>=0;i--){sum+=Number(body[i])*factor;factor=factor===7?2:factor+1}
 const m=11-sum%11;if((m===11?'0':m===10?'K':String(m))!==dv)return null;
 return {id,rut,alias:typeof value.alias==='string'?value.alias.trim().slice(0,100):''};
}

const dateParts=t=>{const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Santiago',day:'2-digit',month:'2-digit',year:'numeric'}).formatToParts(new Date(t));const obj=Object.fromEntries(parts.map(x=>[x.type,x.value]));return obj};
const fmtTime=t=>new Date(t).toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit',timeZone:'America/Santiago'});
const fmtDay=t=>{const p=dateParts(t);return `${p.day}/${p.month}/${p.year}`};
const numDay=t=>{const p=dateParts(t);return `${p.year}${p.month}${p.day}`};
function toast(message,kind='ok'){
  const el=$('toast');el.textContent=message;el.classList.toggle('warn',kind!=='ok');el.classList.add('show');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2400);
}
function status(message,kind=''){const el=$('scan-status');el.textContent=message;el.classList.toggle('bad',kind==='bad')}
function clientError(message=''){$('client-error').textContent=message;$('client-error').hidden=!message;$('client').setAttribute('aria-invalid',String(Boolean(message)))}
function validateClient(show){
  const name=cleanName($('client').value);
  if(!name){if(show){clientError('Ingresa el nombre del cliente antes de escanear.');$('client').focus();toast('Primero indica el cliente','warn')}return false}
  clientError('');return true;
}
function canUse(){return active&&validateClient(true)}
function normalizedOrder(item){if(typeof item==='string')return validOF(item)?{of:item,at:Date.now()}:null;
 if(!item||!validOF(item.of)||!Number.isFinite(item.at))return null;
 return {of:item.of,at:item.at};}
function readDraft(){try{const v=JSON.parse(localStorage.getItem(draftKey)||'null'),clientRef=cleanClientRef(v?.clientRef);return {client:typeof v?.client==='string'?v.client.slice(0,80):'',orders:Array.isArray(v?.orders)?v.orders.map(normalizedOrder).filter(Boolean).slice(0,MAX_ROSTER):[],...(clientRef&&v?.client?{clientRef}:{})}}catch{return {client:'',orders:[]}}}
function readHistory(){try{const a=JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]');return Array.isArray(a)?a.filter(v=>v&&typeof v.id==='string'&&typeof v.client==='string'&&Number.isFinite(v.at)&&Array.isArray(v.orders)).map(v=>({...v,client:v.client.slice(0,80),orders:v.orders.map(normalizedOrder).filter(Boolean).slice(0,MAX_ROSTER)})).filter(v=>v.orders.length):[]}catch{return []}}
function persistDraft(){try{localStorage.setItem(draftKey,JSON.stringify(draft));return true}catch(e){console.warn('Gestark: no pudo guardar borrador',e);status('Sin espacio para guardar la nómina. No cierres esta página.','bad');toast('Error de almacenamiento del borrador','warn');return false}}
function persistHistory(next){try{localStorage.setItem(HISTORY_KEY,JSON.stringify(next));history=next;return true}catch(e){console.warn('Gestark: no pudo guardar nómina',e);toast('No se pudo guardar el retiro; revisa espacio disponible','warn');return false}}
function updateDraft(event){
 draft.client=$('client').value.slice(0,80);
 // Solo una selección explícita del predictor aporta identidad. Cualquier edición manual la desvincula.
 const ref=cleanClientRef(event?.detail?.gestarkClientRef);
 if(ref&&cleanName(draft.client))draft.clientRef=ref;else delete draft.clientRef;
 persistDraft();
}
function renderOrders(){
 const rows=$('order-list');rows.replaceChildren();$('order-count').textContent=String(draft.orders.length);
 $('last-of').textContent=draft.orders.length?'Última: '+draft.orders.at(-1).of:'';
 $('orders-empty').hidden=draft.orders.length>0;$('finish').disabled=draft.orders.length===0||!cleanName($('client').value);syncPaymentOption();
 const fragment=document.createDocumentFragment();
 for(let idx=draft.orders.length-1;idx>=0;idx--){const item=draft.orders[idx];const li=document.createElement('li');li.className='order-item';
   const of=document.createElement('span');of.className='order-num';of.textContent=item.of;
   const at=document.createElement('span');at.className='order-time';at.textContent=fmtTime(item.at);
   const remove=document.createElement('button');remove.type='button';remove.className='remove';remove.textContent='×';remove.title='Quitar O.F. '+item.of;remove.setAttribute('aria-label','Quitar O.F. '+item.of);remove.dataset.index=String(idx);
   li.append(of,at,remove);fragment.append(li)}rows.append(fragment);
}
function addOrder(raw,source='cámara'){
 if(!active||!validateClient(true))return false;
 const read=typeof raw==='string'?core.parseBarcode(raw):raw;
 if(!read?.valid||!validOF(read.of)){toast('Código no reconocido. Comprueba la O.F.','warn');return false}
 const of=read.of;
 if(draft.orders.some(x=>x.of===of)){
   const now=Date.now();if(lastDuplicateOf!==of||now-lastDuplicateAt>3500){toast('Orden '+of+' ya estaba agregada','warn');lastDuplicateOf=of;lastDuplicateAt=now}return false;
 }
 if(draft.orders.length>=MAX_ROSTER){toast('Nómina muy extensa. Finaliza este retiro primero.','warn');return false}
 const order={of,at:Date.now()};draft.orders.push(order);
 if(!persistDraft()){draft.orders.pop();renderOrders();return false}
 resetPaymentOption();renderOrders();$('order-error').hidden=true;
 toast('Orden '+of+' escaneada correctamente');
 if(source==='cámara'){playScanBeep();try{navigator.vibrate?.(45)}catch(_){}}
 status('Orden registrada. Escanea la siguiente.','ok');
 return true;
}
function onDecode(raw){if(!cameraOn)return;const p=core.parseBarcode(raw);if(p?.valid)addOrder(p,'cámara')}
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
     showCamera(true);status('Cámara activa. Enfoca la etiqueta.','ok');
     // Segundo motor HD en paralelo. Sin controles de lente, zoom ni diagnóstico.
     startFarScan();
   }catch(err){
     console.warn('Gestark Entregas clientes: cámara',err);
     stopFarScan();try{await scanner?.stop()}catch(_){}try{await scanner?.clear()}catch(_){}scanner=null;
     showCamera(false);status(permissionIssue(err)?'Permiso de cámara denegado. Revisa Ajustes.':'No fue posible iniciar la cámara. Puedes ingresar la O.F. manualmente.','bad');
   }finally{working=false;$('start-cam').disabled=cameraOn}
 }
 async function stopCamera(){
   if(stopping)return;stopping=true;stopFarScan();
   try{if(scanner){try{await scanner.stop()}catch(_){}try{await scanner.clear()}catch(_){}scanner=null}}
   finally{flashOn=false;flashOnSupported=false;showCamera(false);stopping=false;status('Cámara detenida. Datos conservados.')}
 }
 async function toggleTorch(){
   if(!cameraOn||!scanner)return;
   try{await scanner.applyVideoConstraints({advanced:[{torch:!flashOn}]});flashOn=!flashOn;$('torch').textContent=flashOn?'Apagar luz':'Linterna'}
   catch(_){flashOnSupported=false;$('torch').hidden=true;toast('Linterna no disponible')}
 }


function setView(which){
 view=which;for(const v of ['scan','history']){$('view-'+v).hidden=v!==which;$('tab-'+v).setAttribute('aria-selected',String(v===which))}
 if(which==='history'){if(cameraOn)stopCamera();renderHistory()}
 window.scrollTo({top:0,behavior:'instant'});
}
// Los estados se guardan independientemente para conservar íntegra la nómina y los datos de compartir.
function readClosure(){
 try{const value=JSON.parse(localStorage.getItem(STATUS_KEY)||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}
 catch{return {}}
}
function setClosure(entryId,of,closed){
 // Clave compuesta: una misma O.F. en lotes diferentes no comparte estado accidentalmente.
 const key=entryId+':'+of;
 const saved=readClosure();
 if(closed)saved[key]=true;else delete saved[key];
 try{localStorage.setItem(STATUS_KEY,JSON.stringify(saved))}
 catch(_){toast('No se pudo guardar el estado. Revisa el almacenamiento.','warn');return false}
 renderHistory();toast('O.F. '+of+' · '+(closed?'Cerrada':'Pendiente'));return true;
}
function deleteHistoryOF(id,of){
 // Releer inmediatamente antes de borrar para evitar actuar sobre una lista antigua.
 const current=readHistory();const batch=current.find(x=>x.id===id);
 if(!batch||!batch.orders.some(x=>x.of===of)){toast('La O.F. ya no está en la nómina.','warn');renderHistory();return false}
 const next=current.map(x=>x.id!==id?x:{...x,orders:x.orders.filter(o=>o.of!==of)}).filter(x=>x.orders.length);
 if(!persistHistory(next))return false;
 // Limpiar también el control de cierre correspondiente a esta O.F.
 const closure=readClosure(),key=id+':'+of;
 if(Object.prototype.hasOwnProperty.call(closure,key)){
  delete closure[key];try{localStorage.setItem(STATUS_KEY,JSON.stringify(closure))}
  catch{toast('Orden eliminada, pero no se pudo limpiar el estado de cierre.','warn')}
 }
 renderHistory();toast('O.F. '+of+' eliminada de la nómina');return true;
}
function requestDeleteHistory(item){
 const dialog=$('history-delete-dialog');
 if(typeof dialog.showModal!=='function'){
  if(window.confirm('¿Eliminar la O.F. '+item.of+' de '+item.client+' de la nómina general? Esta acción no se puede deshacer.'))deleteHistoryOF(item.id,item.of);
  return;
 }
 $('delete-of-number').textContent=item.of;
 $('delete-of-client').textContent=item.client;
 dialog.dataset.entryId=item.id;
 dialog.dataset.of=item.of;
 dialog.showModal();
}
function renderHistory(){
 history=readHistory();
 const root=$('history-list'),selector=$('history-date-filter');root.replaceChildren();
 const rows=history.flatMap(retire=>retire.orders.map(order=>({id:retire.id,of:order.of,client:retire.client,at:retire.at,scannedAt:order.at})));
 const dates=[...new Set(rows.map(row=>numDay(row.at)))].sort().reverse();
 const selection=selector.value||'all';
 selector.replaceChildren();
 for(const [value,label] of [['all','Todas las fechas'],['today','Hoy · '+fmtDay(Date.now())]]){
  const option=document.createElement('option');option.value=value;option.textContent=label;selector.append(option);
 }
 for(const day of dates){
  const option=document.createElement('option');option.value=day;option.textContent=day.slice(6,8)+'/'+day.slice(4,6)+'/'+day.slice(0,4);selector.append(option);
 }
 selector.value=selection==='all'||selection==='today'||dates.includes(selection)?selection:'all';
 const daySelected=selector.value==='today'?numDay(Date.now()):selector.value;
 const byDate=daySelected==='all'?rows:rows.filter(row=>numDay(row.at)===daySelected);
 const closures=readClosure(),closed=item=>closures[item.id+':'+item.of]===true;
 const pendingTotal=byDate.filter(item=>!closed(item)).length,closedTotal=byDate.length-pendingTotal;
 $('history-pending-count').textContent=String(pendingTotal);
 $('history-pending-label').textContent=pendingTotal===1?'pendiente':'pendientes';
 $('history-closed-count').textContent=String(closedTotal);
 $('history-closed-label').textContent=closedTotal===1?'cerrada':'cerradas';
 const stateFilter=$('history-state-filter').value;
 const filtered=byDate.filter(item=>stateFilter==='all'||(stateFilter==='closed'?closed(item):!closed(item)));
 $('history-count').textContent=String(filtered.length);
 if(!filtered.length){
  const empty=document.createElement('p');empty.className='empty';
  empty.textContent=rows.length?'No hay O.F. que coincidan con los filtros.':'Todavía no hay órdenes registradas en este dispositivo.';
  root.append(empty);$('history-more').hidden=true;return;
 }
 // Prioridad operativa: primero lo pendiente de cerrar, luego los cierres confirmados.
 filtered.sort((a,b)=>Number(closed(a))-Number(closed(b))||b.at-a.at||b.scannedAt-a.scannedAt);
 const frag=document.createDocumentFragment();
 for(const item of filtered.slice(0,historyShow)){
  const row=document.createElement('div');row.className='history-row';row.setAttribute('role','listitem');
  const top=document.createElement('div');top.className='history-row-top';
  const of=document.createElement('span');of.className='history-of';of.textContent=item.of;
  const isClosed=closed(item);
  const state=document.createElement('button');state.type='button';state.className='history-state'+(isClosed?' delivered':'');
  state.textContent=isClosed?'✓ Cerrada':'Pendiente';state.setAttribute('aria-pressed',String(isClosed));
  state.setAttribute('aria-label','O.F. '+item.of+': '+(isClosed?'Cerrada':'Pendiente')+'. Cambiar estado de cierre en sistema');
  state.addEventListener('click',()=>setClosure(item.id,item.of,!isClosed));
  top.append(of,state);
  const bottom=document.createElement('div');bottom.className='history-row-bottom';
  const client=document.createElement('span');client.className='history-client';client.textContent=item.client;
  const date=document.createElement('span');date.className='history-date';date.textContent=fmtDay(item.at);
  const end=document.createElement('div');end.className='history-row-end';
  const remove=document.createElement('button');remove.type='button';remove.className='history-delete';
  remove.textContent='Eliminar';remove.setAttribute('aria-label','Eliminar O.F. '+item.of+' de la nómina general');
  remove.addEventListener('click',()=>requestDeleteHistory(item));
  end.append(date,remove);
  bottom.append(client,end);row.append(top,bottom);frag.append(row);
 }
 root.append(frag);
 $('history-more').hidden=filtered.length<=historyShow;
}
function newDraft(){resetPaymentOption();draft={client:'',orders:[]};$('client').value='';clientError('');$('manual-order').value='';lastDuplicateOf='';lastDuplicateAt=0;persistDraft();renderOrders();}
function finalize(){
 if(!validateClient(true))return;
 if(draft.orders.length===0){toast('Escanea al menos una orden','warn');return}
 const clientName=cleanName($('client').value),clientRef=clientName===cleanName(draft.client)?cleanClientRef(draft.clientRef):null;
 const entry={id:crypto.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2,9),client:clientName,at:Date.now(),user:currentUser,operator:operatorName,orders:draft.orders.map(x=>({...x})),...(clientRef?{clientRef}:{})};
 const paid=$('orders-paid')?.checked===true;
 const next=[...readHistory(),entry];
 if(!persistHistory(next))return;
 // Primero confirmar guardado; si el cliente cancela compartir, no se pierden los registros.
 newDraft();renderHistory();toast('Retiro guardado · '+entry.orders.length+' órdenes');
 shareEntry({...entry,paid}); // La condición de pago solo viaja al generador local. navigator.share debe invocarse dentro del clic del usuario, sin await previo.
 if(cameraOn)stopCamera(); // Cámara apagada después de abrir el compartir; no rompe el gesto de Safari.
}
const SHARE_CHUNK=24;
const COLS_THRESHOLD=12;
const CANVAS_W=1080;
const FONT='-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif';
// Diseño aprobado Gestark: limpio, tipográfico, sin logos ni imágenes IA incrustadas.
// Cada PNG se dibuja a partir de la nómina real y conserva exactamente sus O.F.
function rounded(ctx,x,y,w,h,r,fill,stroke){
 const radius=Math.min(r,w/2,h/2);
 ctx.beginPath();ctx.moveTo(x+radius,y);ctx.arcTo(x+w,y,x+w,y+h,radius);ctx.arcTo(x+w,y+h,x,y+h,radius);ctx.arcTo(x,y+h,x,y,radius);ctx.arcTo(x,y,x+w,y,radius);ctx.closePath();
 if(fill){ctx.fillStyle=fill;ctx.fill()}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke()}
}
function canvasFont(ctx,weight,size){ctx.font=`${weight} ${size}px ${FONT}`}
function fitFont(ctx,text,maxWidth,weight,size,min=22){
 for(let px=size;px>=min;px-=1){canvasFont(ctx,weight,px);if(ctx.measureText(text).width<=maxWidth)return px}
 return min;
}
function textLines(ctx,value,maxWidth,weight,size){
 canvasFont(ctx,weight,size);
 const words=String(value).split(/\s+/).filter(Boolean),lines=[];let current='';
 for(const word of words){
  const next=current?current+' '+word:word;
  if(ctx.measureText(next).width<=maxWidth){current=next;continue}
  if(current){lines.push(current);current=''}
  let splitWord='';
  for(const ch of word){
   if(splitWord&&ctx.measureText(splitWord+ch).width>maxWidth){lines.push(splitWord);splitWord=ch}
   else splitWord+=ch;
  }
  current=splitWord;
 }
 if(current)lines.push(current);
 return lines;
}
// Iconos lineales dibujados en Canvas: sin dependencias externas ni imágenes IA.
function receiptIcon(ctx,kind,x,y,size,colors){
 rounded(ctx,x,y,size,size,Math.round(size*0.10),colors.pastel);
 ctx.save();ctx.translate(x,y);ctx.scale(size/100,size/100);
 ctx.strokeStyle=colors.deep;ctx.lineWidth=3.4;ctx.lineCap='round';ctx.lineJoin='round';
 ctx.beginPath();
 if(kind==='box'){
  ctx.moveTo(50,19);ctx.lineTo(81,36);ctx.lineTo(81,66);ctx.lineTo(50,83);ctx.lineTo(19,66);ctx.lineTo(19,36);ctx.closePath();
  ctx.moveTo(19,36);ctx.lineTo(50,53);ctx.lineTo(81,36);ctx.moveTo(50,53);ctx.lineTo(50,83);
 }else if(kind==='person'){
  ctx.arc(50,34,13,0,Math.PI*2);ctx.moveTo(25,75);ctx.lineTo(25,68);ctx.bezierCurveTo(25,48,75,48,75,68);ctx.lineTo(75,75);
 }else if(kind==='date'){
  ctx.rect(23,28,54,50);ctx.moveTo(23,43);ctx.lineTo(77,43);ctx.moveTo(36,20);ctx.lineTo(36,35);ctx.moveTo(64,20);ctx.lineTo(64,35);
 }else{
  for(const [cx,cy] of [[50,32],[34,60],[66,60]]){
   ctx.moveTo(cx,cy-13);ctx.lineTo(cx+15,cy-5);ctx.lineTo(cx+15,cy+12);ctx.lineTo(cx,cy+20);ctx.lineTo(cx-15,cy+12);ctx.lineTo(cx-15,cy-5);ctx.closePath();
   ctx.moveTo(cx-15,cy-5);ctx.lineTo(cx,cy+3);ctx.lineTo(cx+15,cy-5);ctx.moveTo(cx,cy+3);ctx.lineTo(cx,cy+20);
  }
 }
 ctx.stroke();ctx.restore();
}
function receiptLine(ctx,x1,y1,x2,y2,color){
 ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
}
function drawShareCard(ctx,entry,clientLines,detailTop,clientH,colors){
 const {ink,muted,border}=colors;
 const rows=[['person','Cliente',clientLines,clientH],['date','Fecha',[fmtDay(entry.at)],84],['count','Cantidad de pedidos',[String(entry.orders.length)],84]];
 let y=detailTop;
 rows.forEach(([icon,label,values,h],i)=>{
  receiptIcon(ctx,icon,64,y+(h-62)/2,62,colors);
  ctx.fillStyle=muted;canvasFont(ctx,400,31);ctx.fillText(label,150,y+h/2+11);
  receiptLine(ctx,526,y+20,526,y+h-20,border);
  ctx.fillStyle=ink;canvasFont(ctx,500,34);
  values.forEach((value,j)=>ctx.fillText(value,555,y+h/2-(values.length-1)*21+12+j*42));
  y+=h;
  if(i<rows.length-1)receiptLine(ctx,64,y,1016,y,border);
 });
}
function renderShareCanvas(entry,orders,pageIndex,totalPages){
 const cols=orders.length>COLS_THRESHOLD?2:1;
 const rows=Math.ceil(orders.length/cols);
 const cv=document.createElement('canvas');cv.width=CANVAS_W;
 const ctx=cv.getContext('2d');if(!ctx)throw Error('Canvas no disponible');
 const colors={deep:'#355C43',ink:'#252B29',muted:'#535D58',border:'#D9DFDB',pastel:'#E6F0E2',accent:'#A8C69A'};
 const {deep,ink,muted,border,pastel,accent}=colors;
 const clientLines=textLines(ctx,cleanName(entry.client),445,500,34);
 const clientH=Math.max(84,clientLines.length*42+30);
 const detailTop=421,detailH=clientH+168;
 const rowH=69,listTop=detailTop+detailH+44,listHeader=74;
 const listHeight=listHeader+Math.max(1,rows)*rowH;
 const height=listTop+listHeight+78;
 cv.height=height;ctx.textBaseline='alphabetic';
 ctx.fillStyle='#ffffff';ctx.fillRect(0,0,CANVAS_W,height);
 ctx.fillStyle=accent;ctx.fillRect(0,0,300,12);ctx.fillRect(0,height-12,CANVAS_W,12);
 // Marca pequeña, sin competir con el contenido del comprobante.
 ctx.save();ctx.globalAlpha=0.32;ctx.textAlign='right';ctx.fillStyle=deep;canvasFont(ctx,600,39);ctx.fillText('Gestark',1016,73);ctx.restore();
 receiptIcon(ctx,'box',64,122,136,colors);
 receiptLine(ctx,230,126,230,254,border);
 ctx.fillStyle=ink;canvasFont(ctx,600,53);ctx.fillText('Resumen de',266,177);ctx.fillText('pedidos retirados',266,238);
 ctx.fillStyle=deep;canvasFont(ctx,600,35);ctx.fillText('¡Hola!',64,322);
 const helloWidth=ctx.measureText('¡Hola!').width;
 ctx.fillStyle=muted;canvasFont(ctx,400,35);ctx.fillText('Hoy retiraste estos pedidos.',64+helloWidth+16,322);
 const second=entry.paid===true?'Tus pedidos ya están pagados. No tienes saldo pendiente.':'En unos minutos te enviaremos el total a pagar.';
 if(entry.paid===true)ctx.fillStyle=deep;
 canvasFont(ctx,400,fitFont(ctx,second,952,400,32,26));ctx.fillText(second,64,371);
 receiptLine(ctx,64,398,1016,398,accent);
 drawShareCard(ctx,entry,clientLines,detailTop,clientH,colors);
 // Las OF se dibujan como texto real, sin recortar ni modificar sus dígitos.
 rounded(ctx,48,listTop,984,listHeader,5,pastel);
 const title=totalPages>1?`Pedidos retirados · OF · ${pageIndex+1}/${totalPages}`:'Pedidos retirados · OF';
 ctx.fillStyle=deep;canvasFont(ctx,600,38);ctx.fillText(title,76,listTop+49);
 const cw=984/cols;
 for(let i=0;i<orders.length;i++){
  const col=Math.floor(i/rows),row=i%rows,x=48+col*cw,y=listTop+listHeader+row*rowH;
  ctx.fillStyle=ink;ctx.textAlign='center';
  canvasFont(ctx,400,fitFont(ctx,String(orders[i].of),cw-48,400,cols===1?41:38,22));
  ctx.fillText(orders[i].of,x+cw/2,y+46);
  receiptLine(ctx,x+24,y+rowH,x+cw-24,y+rowH,border);
 }
 ctx.textAlign='start';
 if(cols===2)receiptLine(ctx,540,listTop+listHeader+10,540,listTop+listHeight,border);
 return cv;
}
function pngFile(canvas,name){const data=canvas.toDataURL('image/png');const binary=atob(data.split(',')[1]);const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return new File([bytes],name,{type:'image/png'})}
function shareFiles(entry){const result=[];const pages=Math.ceil(entry.orders.length/SHARE_CHUNK);
 for(let i=0;i<pages;i++){const list=entry.orders.slice(i*SHARE_CHUNK,(i+1)*SHARE_CHUNK);
  const canvas=renderShareCanvas(entry,list,i,pages);result.push(pngFile(canvas,`Gestark_Retiro_${numDay(entry.at)}_${entry.id.slice(0,6)}_${i+1}.png`));}
 return result;
}
function shareEntry(entry){
 let files;try{files=shareFiles(entry)}catch(err){console.warn('Gestark: no pudo generar imagen',err);toast('No se pudo generar la imagen','warn');return}
 preparedEntry=entry;preparedFiles=files;
 let nativeAvailable=typeof navigator.share==='function';
 if(nativeAvailable&&typeof navigator.canShare==='function'){try{nativeAvailable=Boolean(navigator.canShare({files}))}catch(_){nativeAvailable=false}}
 if(nativeAvailable){
   try{
     // Llamada síncrona dentro del gesto para Safari en iPhone.
     const result=navigator.share({files,title:'Gestark · Pedidos retirados',text:shareText(entry)});
     Promise.resolve(result).catch(err=>{if(err?.name==='AbortError'){toast('Retiro guardado. Compartir cancelado.');return}showShareFallback()});
     return;
   }catch(err){console.warn('Gestark: share',err)}
 }
 showShareFallback();
}
function revokePreview(){if(sharePreviewUrl){URL.revokeObjectURL(sharePreviewUrl);sharePreviewUrl=''}}
function showShareFallback(){if(!preparedEntry||!preparedFiles.length)return;revokePreview();sharePreviewUrl=URL.createObjectURL(preparedFiles[0]);$('share-preview').src=sharePreviewUrl;
 $('share-description').textContent=preparedFiles.length>1?`Se prepararon ${preparedFiles.length} imágenes porque el retiro contiene muchas órdenes. Puedes compartirlas o guardarlas.`:'Si tu navegador no permite compartir automáticamente, guarda esta imagen y envíala desde WhatsApp.';
 $('share-dialog').hidden=false;
}
function closeShareFallback(){$('share-dialog').hidden=true;revokePreview()}
function downloadImages(){if(!preparedFiles.length)return;preparedFiles.forEach((file,index)=>{
 const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=file.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000+index*500);
 });toast('Imagen preparada para guardar')}
async function copyText(s){try{await navigator.clipboard.writeText(s);return true}catch(_){const el=document.createElement('textarea');el.value=s;document.body.append(el);el.select();let ok=false;try{ok=document.execCommand('copy')}catch(_e){}el.remove();return ok}}
function init(){
 if(active)return;active=true;draftKey=DRAFT_PREFIX+currentUser;draft=readDraft();history=readHistory();
 mountPaymentOption();resetPaymentOption();
 $('workspace').hidden=false;$('client').value=draft.client;renderOrders();renderHistory();
 $('client').addEventListener('input',event=>{resetPaymentOption();clientError('');updateDraft(event);renderOrders()});
 $('client').addEventListener('keydown',ev=>{if(ev.key==='Enter'){$('client').blur();ev.preventDefault()}});
 $('start-cam').addEventListener('click',startCamera);$('stop-cam').addEventListener('click',stopCamera);$('torch').addEventListener('click',toggleTorch);
 $('manual-form').addEventListener('submit',ev=>{ev.preventDefault();const raw=$('manual-order').value.trim();const added=addOrder(raw,'manual');if(added)$('manual-order').value='';else if(!validOF(raw)&&!core.parseBarcode(raw).valid){$('order-error').textContent='Ingresa una O.F. válida de nueve dígitos o un código reconocido.';$('order-error').hidden=false}});
 $('order-list').addEventListener('click',e=>{const b=e.target.closest('button[data-index]');if(!b)return;const i=Number(b.dataset.index);if(!Number.isInteger(i)||i<0||i>=draft.orders.length)return;
  const removed=draft.orders[i].of;draft.orders.splice(i,1);if(!persistDraft()){draft.orders.splice(i,0,{of:removed,at:Date.now()});return}resetPaymentOption();renderOrders();toast('O.F. '+removed+' retirada de la nómina')});
 $('finish').addEventListener('click',finalize);
 $('tab-scan').addEventListener('click',()=>setView('scan'));$('tab-history').addEventListener('click',()=>setView('history'));
 $('history-date-filter').addEventListener('change',()=>{historyShow=80;renderHistory()});
 $('history-state-filter').addEventListener('change',()=>{historyShow=80;renderHistory()});
 $('history-more').addEventListener('click',()=>{historyShow+=80;renderHistory()});
 $('history-delete-cancel').addEventListener('click',()=>$('history-delete-dialog').close());
 $('history-delete-confirm').addEventListener('click',()=>{
  const dialog=$('history-delete-dialog');const id=dialog.dataset.entryId,of=dialog.dataset.of;
  dialog.close();deleteHistoryOF(id,of);
 });
 $('history-delete-dialog').addEventListener('click',e=>{if(e.target===$('history-delete-dialog'))e.target.close()});
 $('share-close').addEventListener('click',closeShareFallback);$('share-download').addEventListener('click',downloadImages);
 $('share-retry').addEventListener('click',()=>{closeShareFallback();if(preparedEntry)shareEntry(preparedEntry)});
 $('share-copy').addEventListener('click',async()=>{if(!preparedEntry)return;const ok=await copyText(shareText(preparedEntry));toast(ok?'Mensaje copiado':'No se pudo copiar el mensaje',ok?'ok':'warn')});
 $('share-dialog').addEventListener('click',e=>{if(e.target===$('share-dialog'))closeShareFallback()});
 window.addEventListener('storage',e=>{if((e.key===HISTORY_KEY||e.key===STATUS_KEY)&&view==='history')renderHistory();if(e.key===draftKey){const next=readDraft();if(JSON.stringify(next)!==JSON.stringify(draft))resetPaymentOption();draft=next;$('client').value=draft.client;renderOrders()}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&cameraOn)stopCamera()});
 window.addEventListener('pagehide',()=>{if(cameraOn||scanner)stopCamera()});
 // El motor se descarga únicamente al abrir la cámara, sin bloquear el inicio del formulario.
 setView('scan');
}
document.addEventListener('gestark:ready',e=>{const user=e.detail||{};if(!user.username)return;
 currentUser=String(user.username).slice(0,32);operatorName=String(user.name||user.username).slice(0,70);init()});
})();
