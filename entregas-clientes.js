/* Gestark · Entregas clientes · 2026.11.21.24
 * Escáner continuo usando motor aprobado de Contingentes/Laboratorio 2026.11.21.15.
 * Sin directorio ni sincronización central en esta versión.
 */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const core=window.GestarkLabCore;
const SCAN_LIB='https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';
const HISTORY_KEY='gestark:clients:rosters:v1'; // nómina general en este navegador
const DRAFT_PREFIX='gestark:clients:draft:v1:';
const SHARE_TEXT='¡Hola! Hoy retiraste estos pedidos, en unos minutos te enviamos el total a pagar.';
const MAX_ROSTER=500;
let active=false,currentUser='',operatorName='',draftKey='',draft={client:'',orders:[]},history=[],view='scan';
let scanner=null,cameraOn=false,working=false,stopping=false,flashOn=false;
let lastDuplicateOf='',lastDuplicateAt=0,toastTimer=null,preparedFiles=[],preparedEntry=null,historyShow=30;
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
function renderHistory(){
 history=readHistory();const root=$('history-list');root.replaceChildren();$('history-count').textContent=String(history.length);
 if(!history.length){const p=document.createElement('p');p.className='empty';p.textContent='Aún no hay retiros finalizados en este dispositivo.';root.append(p);$('history-more').hidden=true;return}
 const selected=[...history].sort((a,b)=>b.at-a.at).slice(0,historyShow);
 for(const item of selected){
  const card=document.createElement('article');card.className='history-card';
  const head=document.createElement('div');head.className='history-head';const title=document.createElement('strong');title.textContent=item.client;
  const date=document.createElement('small');date.textContent=fmtDay(item.at)+' · '+fmtTime(item.at);head.append(title,date);
  const sub=document.createElement('div');sub.className='history-sub';sub.textContent=item.orders.length+' O.F. · '+(item.operator||item.user||'Gestark');
  const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent='Ver '+item.orders.length+' órdenes';summary.style.cssText='color:#176a4a;font-size:12px;font-weight:800;cursor:pointer;padding:5px 0';
  const values=document.createElement('p');values.className='history-details';values.textContent=item.orders.map(x=>x.of).join(' · ');details.append(summary,values);
  const actions=document.createElement('div');actions.className='mini-actions';const share=document.createElement('button');share.type='button';share.dataset.shareId=item.id;share.textContent='Compartir imagen';actions.append(share);
  card.append(head,sub,details,actions);root.append(card);
 }
 $('history-more').hidden=history.length<=historyShow;
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
function rounded(ctx,x,y,w,h,r,fill,stroke){
 const radius=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+radius,y);ctx.arcTo(x+w,y,x+w,y+h,radius);ctx.arcTo(x+w,y+h,x,y+h,radius);ctx.arcTo(x,y+h,x,y,radius);ctx.arcTo(x,y,x+w,y,radius);ctx.closePath();
 if(fill){ctx.fillStyle=fill;ctx.fill()}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke()}
}
function drawPackage(ctx,x,y,size,color){
 ctx.save();ctx.strokeStyle=color;ctx.lineWidth=3.7;ctx.lineCap='round';ctx.lineJoin='round';const s=size;
 ctx.beginPath();ctx.moveTo(x,y-s*.28);ctx.lineTo(x+s*.37,y-s*.48);ctx.lineTo(x+s*.72,y-s*.28);ctx.lineTo(x+s*.72,y+s*.26);ctx.lineTo(x+s*.36,y+s*.49);ctx.lineTo(x,y+s*.26);ctx.closePath();ctx.moveTo(x,y-s*.28);ctx.lineTo(x+s*.36,y-s*.06);ctx.lineTo(x+s*.72,y-s*.28);ctx.moveTo(x+s*.36,y-s*.06);ctx.lineTo(x+s*.36,y+s*.49);ctx.moveTo(x+s*.18,y-s*.39);ctx.lineTo(x+s*.54,y-s*.18);ctx.stroke();ctx.restore();
}
function fitted(ctx,str,maxWidth,px,min=22){let size=px;do{ctx.font=`700 ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif`;if(ctx.measureText(str).width<=maxWidth)return str;size-=2}while(size>=min);
 ctx.font=`700 ${min}px -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif`;
 let result=str;while(result.length>1&&ctx.measureText(result+'…').width>maxWidth)result=result.slice(0,-1);return result+'…';}
function renderShareCanvas(entry,orders,pageIndex,totalPages){
 const cols=orders.length>COLS_THRESHOLD?2:1;
 const rows=Math.ceil(orders.length/cols);
 const rowH=80,listTop=516,listHeader=76;
 const listHeight=listHeader+Math.max(1,rows)*rowH;
 const footerY=listTop+listHeight+44;
 const height=footerY+160+48;
 const cv=document.createElement('canvas');cv.width=CANVAS_W;cv.height=height;
 const ctx=cv.getContext('2d');if(!ctx)throw Error('Canvas no disponible');
 const deep='#064d41',green='#a2f124',ink='#102f27',muted='#536f61',mint='#e7f5ef';
 ctx.fillStyle='#ffffff';ctx.fillRect(0,0,CANVAS_W,height);
 // Header con nombre de la app, sin logo adicional ni marca Greenbox.
 rounded(ctx,0,0,CANVAS_W,128,25,deep);
 ctx.fillStyle='#a3f223';ctx.beginPath();ctx.moveTo(990,128);ctx.lineTo(1080,35);ctx.lineTo(1080,128);ctx.closePath();ctx.fill();
 ctx.textBaseline='alphabetic';ctx.font='800 64px -apple-system, "Segoe UI", Arial, sans-serif';ctx.fillStyle='#ffffff';ctx.fillText('Ges',47,82);
 const offset=47+ctx.measureText('Ges').width;ctx.fillStyle=green;ctx.fillText('tark',offset,82);
 ctx.strokeStyle='#9dd9bd';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(420,28);ctx.lineTo(420,101);ctx.stroke();
 ctx.fillStyle='#ffffff';ctx.font='700 45px -apple-system, "Segoe UI", Arial, sans-serif';ctx.fillText('Retiro de pedidos',451,79);
 // Mensaje
 rounded(ctx,30,151,1020,154,27,'#e8f6f3');
 ctx.strokeStyle='#078152';ctx.lineWidth=5;ctx.beginPath();ctx.arc(94,226,25,0,Math.PI*2);ctx.stroke();
 ctx.fillStyle='#078152';ctx.beginPath();[83,94,105].forEach(x=>{ctx.moveTo(x+3,226);ctx.arc(x,226,3,0,Math.PI*2)});ctx.fill();
 ctx.font='650 34px -apple-system,"Segoe UI",Arial,sans-serif';ctx.fillStyle='#142d29';ctx.fillText('¡Hola! Hoy retiraste estos pedidos,',154,215);ctx.fillText('en unos minutos te enviamos el total a pagar.',154,263);
 // Cliente y fecha
 rounded(ctx,30,333,1020,135,25,'#f4f6f5');ctx.font='500 25px -apple-system,"Segoe UI",Arial,sans-serif';ctx.fillStyle=muted;ctx.fillText('Cliente:',157,375);
 ctx.fillStyle=ink;ctx.font='700 37px -apple-system,"Segoe UI",Arial,sans-serif';ctx.fillText(fitted(ctx,entry.client,515,37,24),157,425);
 ctx.lineWidth=3;ctx.strokeStyle='#b7c9c1';ctx.beginPath();ctx.moveTo(720,358);ctx.lineTo(720,445);ctx.stroke();
 ctx.fillStyle=muted;ctx.font='500 25px -apple-system,"Segoe UI",Arial,sans-serif';ctx.fillText('Fecha:',748,375);
 ctx.fillStyle=ink;ctx.font='700 35px -apple-system,"Segoe UI",Arial,sans-serif';ctx.fillText(fmtDay(entry.at),748,425);
 ctx.strokeStyle='#0e5e4a';ctx.lineWidth=3;ctx.beginPath();ctx.arc(112,371,17,0,Math.PI*2);ctx.moveTo(82,428);ctx.quadraticCurveTo(112,382,142,428);ctx.stroke();
 // Lista de O.F.
 rounded(ctx,30,listTop,1020,listHeight,23,'#ffffff','#c9d7ce');ctx.save();ctx.beginPath();ctx.rect(30,listTop,1020,listHeader);ctx.clip();rounded(ctx,30,listTop,1020,93,23,deep);ctx.restore();
 ctx.fillStyle='#ffffff';ctx.font='750 42px -apple-system,"Segoe UI",Arial,sans-serif';const label=totalPages>1?`Órdenes retiradas · ${pageIndex+1}/${totalPages}`:'Órdenes retiradas';ctx.fillText(label,78,listTop+52);
 const colW=1020/cols;
 orders.forEach((o,i)=>{
   const col=Math.floor(i/rows),row=i%rows;
   const x=30+col*colW,y=listTop+listHeader+row*rowH;
   if(row>0){ctx.strokeStyle='#d9e1de';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+colW,y);ctx.stroke()}
   drawPackage(ctx,x+41,y+rowH/2,45,deep);
   ctx.fillStyle=ink;ctx.font=`800 ${cols===1?43:34}px ui-monospace,SFMono-Regular,Menlo,monospace`;
   ctx.fillText(o.of,x+123,y+rowH/2+14);
 });
 if(cols===2){ctx.beginPath();ctx.moveTo(540,listTop+listHeader);ctx.lineTo(540,listTop+listHeight);ctx.strokeStyle='#d9e1de';ctx.lineWidth=2;ctx.stroke()}
 // Recuento total, diseño Gestark.
 rounded(ctx,30,footerY,1020,152,25,mint);
 drawPackage(ctx,83,footerY+72,85,deep);
 ctx.fillStyle=ink;ctx.font='600 41px -apple-system,"Segoe UI",Arial,sans-serif';ctx.fillText('Total de órdenes:',286,footerY+89);
 rounded(ctx,710,footerY+29,104,93,15,deep);
 ctx.fillStyle='#ffffff';ctx.font='800 65px -apple-system,"Segoe UI",Arial,sans-serif';ctx.textAlign='center';ctx.fillText(String(entry.orders.length),762,footerY+99);ctx.textAlign='start';
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
 $('history-list').addEventListener('click',e=>{const b=e.target.closest('button[data-share-id]');if(!b)return;const item=history.find(x=>x.id===b.dataset.shareId);if(item)shareEntry(item)});
 $('history-more').addEventListener('click',()=>{historyShow+=30;renderHistory()});
 $('share-close').addEventListener('click',closeShareFallback);$('share-download').addEventListener('click',downloadImages);
 $('share-retry').addEventListener('click',()=>{closeShareFallback();if(preparedEntry)shareEntry(preparedEntry)});
 $('share-copy').addEventListener('click',async()=>{const ok=await copyText(SHARE_TEXT);toast(ok?'Mensaje copiado':'No se pudo copiar el mensaje',ok?'ok':'warn')});
 $('share-dialog').addEventListener('click',e=>{if(e.target===$('share-dialog'))closeShareFallback()});
 window.addEventListener('storage',e=>{if(e.key===HISTORY_KEY&&view==='history')renderHistory();if(e.key===draftKey){draft=readDraft();$('client').value=draft.client;renderOrders()}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&cameraOn)stopCamera()});
 window.addEventListener('pagehide',()=>{if(cameraOn||scanner)stopCamera()});
 // El motor se descarga únicamente al abrir la cámara, sin bloquear el inicio del formulario.
 setView('scan');
}
document.addEventListener('gestark:ready',e=>{const user=e.detail||{};if(!user.username)return;
 currentUser=String(user.username).slice(0,32);operatorName=String(user.name||user.username).slice(0,70);init()});
})();
