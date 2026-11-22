/* Gestark · Entregas clientes · 2026.11.21.27
 * Escáner continuo usando motor aprobado de Contingentes/Laboratorio 2026.11.21.15.
 * Sin directorio ni sincronización central en esta versión.
 */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const core=window.GestarkLabCore;
const SCAN_LIB='https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';
const HISTORY_KEY='gestark:clients:rosters:v1'; // nómina general en este navegador
const STATUS_KEY='gestark:clients:system-closure:v1'; // control de cierre por O.F. y retiro
const DRAFT_PREFIX='gestark:clients:draft:v1:';
const SHARE_TEXT='¡Hola! Hoy retiraste estos pedidos. En unos minutos te enviaremos el total a pagar.';
const MAX_ROSTER=500;
let active=false,currentUser='',operatorName='',draftKey='',draft={client:'',orders:[]},history=[],view='scan';
let scanner=null,cameraOn=false,working=false,stopping=false,flashOn=false;
let lastDuplicateOf='',lastDuplicateAt=0,toastTimer=null,preparedFiles=[],preparedEntry=null,historyShow=80;
let sharePreviewUrl='';
const cleanName=s=>String(s||'').replace(/\s+/g,' ').trim().slice(0,80);
const validOF=s=>/^\d{9}$/.test(String(s||''));
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
function readDraft(){try{const v=JSON.parse(localStorage.getItem(draftKey)||'null');return {client:typeof v?.client==='string'?v.client.slice(0,80):'',orders:Array.isArray(v?.orders)?v.orders.map(normalizedOrder).filter(Boolean).slice(0,MAX_ROSTER):[]}}catch{return {client:'',orders:[]}}}
function readHistory(){try{const a=JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]');return Array.isArray(a)?a.filter(v=>v&&typeof v.id==='string'&&typeof v.client==='string'&&Number.isFinite(v.at)&&Array.isArray(v.orders)).map(v=>({...v,client:v.client.slice(0,80),orders:v.orders.map(normalizedOrder).filter(Boolean).slice(0,MAX_ROSTER)})).filter(v=>v.orders.length):[]}catch{return []}}
function persistDraft(){try{localStorage.setItem(draftKey,JSON.stringify(draft));return true}catch(e){console.warn('Gestark: no pudo guardar borrador',e);status('Sin espacio para guardar la nómina. No cierres esta página.','bad');toast('Error de almacenamiento del borrador','warn');return false}}
function persistHistory(next){try{localStorage.setItem(HISTORY_KEY,JSON.stringify(next));history=next;return true}catch(e){console.warn('Gestark: no pudo guardar nómina',e);toast('No se pudo guardar el retiro; revisa espacio disponible','warn');return false}}
function updateDraft(){draft.client=$('client').value.slice(0,80);persistDraft()}
function renderOrders(){
 const rows=$('order-list');rows.replaceChildren();$('order-count').textContent=String(draft.orders.length);
 $('last-of').textContent=draft.orders.length?'Última: '+draft.orders.at(-1).of:'';
 $('orders-empty').hidden=draft.orders.length>0;$('finish').disabled=draft.orders.length===0||!cleanName($('client').value);
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
 renderOrders();$('order-error').hidden=true;
 toast('Orden '+of+' escaneada correctamente');
 if(source==='cámara'){playScanBeep();try{navigator.vibrate?.(45)}catch(_){}}
 status('Lectura correcta. Mantén la cámara abierta para la siguiente orden.','ok');
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
     showCamera(true);status('Cámara activa. Enfoca el código de barras.','ok');
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
   finally{flashOn=false;flashOnSupported=false;showCamera(false);stopping=false;status('Cámara detenida. Los datos actuales se conservan.')}
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
 renderHistory();toast('O.F. '+of+' · '+(closed?'Entregado':'No entregado'));return true;
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
 const filtered=daySelected==='all'?rows:rows.filter(row=>numDay(row.at)===daySelected);
 $('history-count').textContent=String(filtered.length);
 if(!filtered.length){
  const empty=document.createElement('p');empty.className='empty';empty.textContent=rows.length?'No hay órdenes registradas en la fecha seleccionada.':'Todavía no hay órdenes registradas en este dispositivo.';root.append(empty);$('history-more').hidden=true;return;
 }
 filtered.sort((a,b)=>b.at-a.at||b.scannedAt-a.scannedAt);
 const closures=readClosure(),frag=document.createDocumentFragment();
 for(const item of filtered.slice(0,historyShow)){
  const row=document.createElement('div');row.className='history-row';row.setAttribute('role','listitem');
  const top=document.createElement('div');top.className='history-row-top';
  const of=document.createElement('span');of.className='history-of';of.textContent=item.of;
  const key=item.id+':'+item.of;
  const delivered=closures[key]===true;
  const state=document.createElement('button');state.type='button';state.className='history-state'+(delivered?' delivered':'');state.textContent=delivered?'✓ Entregado':'No entregado';state.setAttribute('aria-pressed',String(delivered));state.setAttribute('aria-label','O.F. '+item.of+': '+(delivered?'Entregado':'No entregado')+'. Cambiar estado de cierre en sistema');
  state.addEventListener('click',()=>setClosure(item.id,item.of,!delivered));
  top.append(of,state);
  const bottom=document.createElement('div');bottom.className='history-row-bottom';
  const client=document.createElement('span');client.className='history-client';client.textContent=item.client;
  const date=document.createElement('span');date.className='history-date';date.textContent=fmtDay(item.at);
  bottom.append(client,date);row.append(top,bottom);frag.append(row);
 }
 root.append(frag);
 $('history-more').hidden=filtered.length<=historyShow;
}
function newDraft(){draft={client:'',orders:[]};$('client').value='';clientError('');$('manual-order').value='';lastDuplicateOf='';lastDuplicateAt=0;persistDraft();renderOrders();}
function finalize(){
 if(!validateClient(true))return;
 if(draft.orders.length===0){toast('Escanea al menos una orden','warn');return}
 const entry={id:crypto.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2,9),client:cleanName($('client').value),at:Date.now(),user:currentUser,operator:operatorName,orders:draft.orders.map(x=>({...x}))};
 const next=[...readHistory(),entry];
 if(!persistHistory(next))return;
 // Primero confirmar guardado; si el cliente cancela compartir, no se pierden los registros.
 newDraft();renderHistory();toast('Retiro guardado · '+entry.orders.length+' órdenes');
 shareEntry(entry); // navigator.share debe invocarse dentro del clic del usuario, sin await previo.
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
function drawShareCard(ctx,entry,clientLines,detailTop,detailH,colors){
 const {deep,ink,muted,border}=colors;
 rounded(ctx,28,detailTop,1024,detailH,25,'#ffffff',border);
 const colA=465,colB=764;
 ctx.strokeStyle=border;ctx.lineWidth=2.2;
 ctx.beginPath();ctx.moveTo(colA,detailTop+40);ctx.lineTo(colA,detailTop+detailH-40);ctx.moveTo(colB,detailTop+40);ctx.lineTo(colB,detailTop+detailH-40);ctx.stroke();
 ctx.fillStyle=muted;canvasFont(ctx,500,27);ctx.fillText('Cliente:',73,detailTop+62);
 ctx.fillStyle=ink;canvasFont(ctx,700,34);
 clientLines.forEach((line,i)=>ctx.fillText(line,73,detailTop+112+i*43));
 ctx.fillStyle=muted;canvasFont(ctx,500,27);ctx.fillText('Fecha:',502,detailTop+62);
 ctx.fillStyle=ink;canvasFont(ctx,700,35);ctx.fillText(fmtDay(entry.at),502,detailTop+111);
 ctx.fillStyle=muted;canvasFont(ctx,500,26);ctx.fillText('Cantidad de',797,detailTop+54);ctx.fillText('pedidos:',797,detailTop+86);
 rounded(ctx,834,detailTop+108,134,75,15,deep);
 ctx.textAlign='center';ctx.fillStyle='#ffffff';canvasFont(ctx,750,53);ctx.fillText(String(entry.orders.length),901,detailTop+162);ctx.textAlign='start';
}
function renderShareCanvas(entry,orders,pageIndex,totalPages){
 const cols=orders.length>COLS_THRESHOLD?2:1;
 const rows=Math.ceil(orders.length/cols);
 const cv=document.createElement('canvas');cv.width=CANVAS_W;
 const ctx=cv.getContext('2d');if(!ctx)throw Error('Canvas no disponible');
 const deep='#064c3b',ink='#092f25',muted='#516b5e',border='#bad6c6',green='#37a819';
 const client=cleanName(entry.client);
 let clientSize=34,clientLines=[];
 do{clientLines=textLines(ctx,client,367,700,clientSize);if(clientLines.length<=3)break;clientSize-=1}while(clientSize>25);
 const lineH=clientSize+10;
 const detailTop=457,detailH=Math.max(210,110+clientLines.length*lineH+25);
 const rowH=78,listTop=detailTop+detailH+42,listHeader=80;
 const listHeight=listHeader+Math.max(1,rows)*rowH;
 const height=listTop+listHeight+150;
 cv.height=height;ctx.textBaseline='alphabetic';
 const colors={deep,ink,muted,border};
 ctx.fillStyle='#ffffff';ctx.fillRect(0,0,CANVAS_W,height);
 // Marca tipográfica Gestark: la escritura es exacta y no depende de generación de imágenes.
 canvasFont(ctx,750,94);
 const word1='Gest',word2='ark',brandWidth=ctx.measureText(word1+word2).width;
 const brandX=(CANVAS_W-brandWidth)/2;
 ctx.fillStyle=deep;ctx.fillText(word1,brandX,113);
 ctx.fillStyle=green;ctx.fillText(word2,brandX+ctx.measureText(word1).width,113);
 const subtitle='Resumen de pedidos retirados';
 canvasFont(ctx,450,39);ctx.fillStyle='#435e50';ctx.textAlign='center';ctx.fillText(subtitle,CANVAS_W/2,182);ctx.textAlign='start';
 const subtitleWidth=ctx.measureText(subtitle).width;
 ctx.strokeStyle='#158347';ctx.lineWidth=2.5;
 ctx.beginPath();ctx.moveTo(67,175);ctx.lineTo((CANVAS_W-subtitleWidth)/2-30,175);ctx.moveTo((CANVAS_W+subtitleWidth)/2+30,175);ctx.lineTo(1013,175);ctx.stroke();
 // Mensaje claro y sin signos ni frases duplicadas.
 rounded(ctx,26,235,1028,189,27,'#e9f6f1');
 rounded(ctx,63,277,9,108,5,green);
 ctx.fillStyle=ink;
 const first='¡Hola! Hoy retiraste estos pedidos.';
 canvasFont(ctx,750,42);
 ctx.fillText(first,94,315);
 const second='En unos minutos te enviaremos el total a pagar.';
 const secondSize=fitFont(ctx,second,928,450,36,29);
 canvasFont(ctx,450,secondSize);ctx.fillText(second,94,378);
 drawShareCard(ctx,entry,clientLines,detailTop,detailH,colors);
 // Nómina visual: una línea por O.F., números exactos, sin iconografía decorativa.
 rounded(ctx,28,listTop,1024,listHeight,23,'#ffffff',border);
 ctx.save();ctx.beginPath();ctx.rect(28,listTop,1024,listHeader);ctx.clip();
 rounded(ctx,28,listTop,1024,102,23,deep);ctx.restore();
 const title=totalPages>1?`Pedidos retirados · ${pageIndex+1}/${totalPages}`:'Pedidos retirados';
 ctx.fillStyle='#ffffff';canvasFont(ctx,700,43);ctx.fillText(title,73,listTop+55);
 const cw=1024/cols;
 for(let i=0;i<orders.length;i++){
  const col=Math.floor(i/rows),row=i%rows,x=28+col*cw,y=listTop+listHeader+row*rowH;
  if(row>0){ctx.strokeStyle=border;ctx.lineWidth=1.8;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+cw,y);ctx.stroke()}
  ctx.fillStyle=ink;canvasFont(ctx,700,cols===1?45:40);
  ctx.fillText(orders[i].of,x+50,y+54);
 }
 if(cols===2){ctx.strokeStyle=border;ctx.lineWidth=1.8;ctx.beginPath();ctx.moveTo(540,listTop+listHeader);ctx.lineTo(540,listTop+listHeight);ctx.stroke()}
 // Detalle verde de marca, discreto, sin degradados ni elementos tridimensionales.
 ctx.fillStyle='#0a6148';ctx.beginPath();ctx.moveTo(974,height);ctx.quadraticCurveTo(1053,height-39,1080,height-98);ctx.lineTo(1080,height);ctx.closePath();ctx.fill();
 ctx.fillStyle=green;ctx.beginPath();ctx.moveTo(1032,height);ctx.quadraticCurveTo(1061,height-40,1080,height-60);ctx.lineTo(1080,height);ctx.closePath();ctx.fill();
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
     const result=navigator.share({files,title:'Gestark · Pedidos retirados',text:SHARE_TEXT});
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
 $('workspace').hidden=false;$('client').value=draft.client;renderOrders();renderHistory();
 $('client').addEventListener('input',()=>{clientError('');updateDraft();renderOrders()});
 $('client').addEventListener('keydown',ev=>{if(ev.key==='Enter'){$('client').blur();ev.preventDefault()}});
 $('start-cam').addEventListener('click',startCamera);$('stop-cam').addEventListener('click',stopCamera);$('torch').addEventListener('click',toggleTorch);
 $('manual-form').addEventListener('submit',ev=>{ev.preventDefault();const raw=$('manual-order').value.trim();const added=addOrder(raw,'manual');if(added)$('manual-order').value='';else if(!validOF(raw)&&!core.parseBarcode(raw).valid){$('order-error').textContent='Ingresa una O.F. válida de nueve dígitos o un código reconocido.';$('order-error').hidden=false}});
 $('order-list').addEventListener('click',e=>{const b=e.target.closest('button[data-index]');if(!b)return;const i=Number(b.dataset.index);if(!Number.isInteger(i)||i<0||i>=draft.orders.length)return;
  const removed=draft.orders[i].of;draft.orders.splice(i,1);if(!persistDraft()){draft.orders.splice(i,0,{of:removed,at:Date.now()});return}renderOrders();toast('O.F. '+removed+' retirada de la nómina')});
 $('finish').addEventListener('click',finalize);
 $('tab-scan').addEventListener('click',()=>setView('scan'));$('tab-history').addEventListener('click',()=>setView('history'));
 $('history-date-filter').addEventListener('change',()=>{historyShow=80;renderHistory()});
 $('history-more').addEventListener('click',()=>{historyShow+=80;renderHistory()});
 $('share-close').addEventListener('click',closeShareFallback);$('share-download').addEventListener('click',downloadImages);
 $('share-retry').addEventListener('click',()=>{closeShareFallback();if(preparedEntry)shareEntry(preparedEntry)});
 $('share-copy').addEventListener('click',async()=>{const ok=await copyText(SHARE_TEXT);toast(ok?'Mensaje copiado':'No se pudo copiar el mensaje',ok?'ok':'warn')});
 $('share-dialog').addEventListener('click',e=>{if(e.target===$('share-dialog'))closeShareFallback()});
 window.addEventListener('storage',e=>{if((e.key===HISTORY_KEY||e.key===STATUS_KEY)&&view==='history')renderHistory();if(e.key===draftKey){draft=readDraft();$('client').value=draft.client;renderOrders()}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&cameraOn)stopCamera()});
 window.addEventListener('pagehide',()=>{if(cameraOn||scanner)stopCamera()});
 // El motor se descarga únicamente al abrir la cámara, sin bloquear el inicio del formulario.
 setView('scan');
}
document.addEventListener('gestark:ready',e=>{const user=e.detail||{};if(!user.username)return;
 currentUser=String(user.username).slice(0,32);operatorName=String(user.name||user.username).slice(0,70);init()});
})();
