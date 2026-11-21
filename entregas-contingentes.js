/* Gestark · Entregas contingentes · Interfaz operativa v2026.11.21.17.
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
 let scanner=null, cameraOn=false, working=false, stopping=false, flashOn=false;
 let signed=false, signatureCanvas=null, sigCtx=null, penDown=false;
 let currentOF='', lastScanAt=0, resumeScanAt=0, confirmedRecord=null, confirmedSnapshot=null;
 let toastTimer=null;
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
   $('export-pdf').disabled=true;$('reg-save').disabled=false;$('clear-sign').disabled=false;
   regStatus('Aún no se ha confirmado una entrega.');pdfStatus('');
   $('rut-warning').textContent='';
   clearSign();status(cameraOn?'Apunta a una nueva O.F.':'Pulsa Iniciar cámara para continuar.','ok');
 }
 function newOrder(){
   if(confirmedRecord && !confirmedSnapshot?.pdfGenerated){
     if(!confirm('Esta entrega ya fue confirmada. ¿Continuar sin descargar su PDF? La firma no podrá recuperarse.'))return;
   }else if(!confirmedRecord && ($('field-name').value||$('field-rut').value||signed)){
     if(!confirm('¿Descartar los datos y la firma de la orden actual?'))return;
   }
   clearCurrent();toast('Nueva orden preparada');
 }
 function validOF(read,source='cámara'){
   if(!canUse()||confirmedRecord||!read?.valid)return false;
   if(currentOF){if(currentOF===read.of)return false;status('Para otra O.F., pulsa Nueva orden. La orden actual está protegida.','ok');return false}
   currentOF=read.of;lastScanAt=Date.now();
   $('field-order').value=read.of;
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
   requestAnimationFrame(resize);
   let rr;window.addEventListener('resize',()=>{clearTimeout(rr);rr=setTimeout(resize,220)});
   function pos(e){const r=signatureCanvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top}}
   signatureCanvas.addEventListener('pointerdown',e=>{if(!canUse()||confirmedRecord)return;penDown=true;signed=true;signatureCanvas.setPointerCapture(e.pointerId);const p=pos(e);sigCtx.beginPath();sigCtx.moveTo(p.x,p.y);sigCtx.lineTo(p.x+.02,p.y+.02);sigCtx.stroke()});
   signatureCanvas.addEventListener('pointermove',e=>{if(!penDown)return;const p=pos(e);sigCtx.lineTo(p.x,p.y);sigCtx.stroke()});
   ['pointerup','pointercancel','lostpointercapture'].forEach(ev=>signatureCanvas.addEventListener(ev,()=>penDown=false));
 }
 function clearSign(){if(signatureCanvas&&sigCtx){sigCtx.clearRect(0,0,signatureCanvas.width,signatureCanvas.height)}signed=false}

 function updateRutWarning(){
   const rut=$('field-rut').value.trim(),el=$('rut-warning');
   const ok=core.validateRut(rut);
   el.textContent=!rut?'':ok?'RUT: dígito verificador válido.':'Revisa el RUT: dígito verificador inválido.';
   el.className='hint '+(rut&&!ok?'bad':'');
 }
 function makeRecordId(){
   try{if(crypto.randomUUID)return 'CONT-'+crypto.randomUUID().toUpperCase()}catch(_){}
   const b=new Uint8Array(12);crypto.getRandomValues(b);return 'CONT-'+Array.from(b,x=>x.toString(16).padStart(2,'0')).join('').toUpperCase();
 }
 function loadRecords(){
   try{const a=JSON.parse(localStorage.getItem(deliveryStorage)||'[]');return Array.isArray(a)?a.filter(x=>x&&/^\d{9}$/.test(x.of)&&typeof x.id==='string'&&Number.isFinite(x.at)&&typeof x.status==='string').slice(-MAX):[]}
   catch(_){return []}
 }
 function storeRecords(next){
   try{localStorage.setItem(deliveryStorage,JSON.stringify(next));records=next;renderRecords();return true}
   catch(_){regStatus('No fue posible guardar el registro. Revisa el almacenamiento del iPhone.','bad');return false}
 }
 function registerDelivery(){
   if(!canUse()||confirmedRecord)return;
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
   if(records.some(r=>r.of===data.order)){regStatus('Esta O.F. ya tiene un registro en este dispositivo. Verifica antes de continuar.','bad');return}
   const record={id:makeRecordId(),of:data.order,at:Date.now(),user:currentUser,status:'pending',reason,site:site.slice(0,90)};
   const signatureData=signatureCanvas.toDataURL('image/png');
   if(!storeRecords([...records,record]))return;
   confirmedRecord=record;
   confirmedSnapshot={data:{...data},signature:signatureData,pdfGenerated:false};
   $('export-pdf').disabled=false;$('reg-save').disabled=true;$('clear-sign').disabled=true;
   regStatus('Entrega registrada en este dispositivo. Descarga el PDF y regularízala en Starken.','ok');toast('Registro interno confirmado ✓');
 }
 function renderRecords(){
   const root=$('reg-history');const pending=records.filter(r=>r.status==='pending');
   $('reg-count').textContent=String(pending.length);
   $('reg-copy').disabled=!pending.length;$('reg-clear').disabled=!records.some(r=>r.status==='regularized');
   root.replaceChildren();
   if(!records.length){const p=document.createElement('div');p.className='empty';p.textContent='Aún no hay entregas registradas en este dispositivo.';root.append(p);return}
   for(const rec of [...records].reverse()){
     const row=document.createElement('div');row.className='mini-row';
     const info=document.createElement('div');info.style.flex='1';
     const code=document.createElement('strong');code.className='code';code.textContent=rec.of;
     const meta=document.createElement('small');meta.textContent=fmtDate(rec.at)+' · '+rec.user;
     const state=document.createElement('small');state.className=rec.status==='regularized'?'delivery-status done':'delivery-status';state.textContent=rec.status==='regularized'?'Regularizada manualmente':'Pendiente de regularizar';
     info.append(code,meta,state);row.append(info);
     if(rec.status==='pending'){
       const button=document.createElement('button');button.className='micro';button.type='button';button.textContent='Regularizada';
       button.dataset.action='regularize';button.dataset.id=rec.id;
       row.append(button);
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
 function regularize(id){
   const rec=records.find(x=>x.id===id&&x.status==='pending');if(!rec)return;
   if(!confirm('¿Confirmas que la O.F. '+rec.of+' YA fue regularizada en el sistema oficial de Starken? Esta app no sincroniza ni verifica esa gestión.'))return;
   if(storeRecords(records.map(x=>x.id===id?{...x,status:'regularized',regularizedAt:Date.now()}:x)))toast('Marcada como regularizada manualmente');
 }
 async function hashString(s){
   if(!crypto.subtle)return '';
   const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));
   return Array.from(new Uint8Array(buf)).map(x=>x.toString(16).padStart(2,'0')).join('');
 }
 async function exportPdf(){
   if(!confirmedRecord||!confirmedSnapshot){pdfStatus('Primero confirma una entrega.','bad');return}
   const data=confirmedSnapshot.data,record=confirmedRecord;
   $('export-pdf').disabled=true;pdfStatus('Generando PDF interno…');
   try{
     await loadScript(PDF_LIB,'jspdf');const PDF=window.jspdf?.jsPDF;if(!PDF)throw Error('No se cargó el generador PDF');
     const doc=new PDF({unit:'mm',format:'a4',compress:true});
     doc.setFillColor(17,102,74);doc.rect(0,0,210,41,'F');
     doc.setFont('helvetica','bold');doc.setFontSize(17);doc.setTextColor(255);doc.text('Gestark | Entregas contingentes',15,16);
     doc.setFontSize(10);doc.text('REGISTRO INTERNO - NO OFICIAL STARKEN',15,26);
     doc.setFontSize(9);doc.text(fmtDate(record.at),15,34);
     doc.setTextColor(27,58,43);doc.setFontSize(12);
     doc.text('Orden de flete: '+data.order,15,57);
     doc.setFont('helvetica','normal');doc.setFontSize(10);
     const write=(title,value,y)=>{doc.setFont('helvetica','bold');doc.text(title,15,y);doc.setFont('helvetica','normal');doc.text(doc.splitTextToSize(value,122),68,y)};
     write('Receptor',data.name,70);write('RUT',data.rut,85);
     write('Lugar',record.site,100);write('Motivo',record.reason,115);
     write('Operador',operatorName||currentUser,130);write('Identificador',record.id,145);
     doc.setFont('helvetica','bold');doc.text('Firma indicada por el receptor:',15,166);
     doc.addImage(confirmedSnapshot.signature,'PNG',15,173,90,34);
     const digest=await hashString(JSON.stringify(data)+record.id+record.at+confirmedSnapshot.signature);
     doc.setFontSize(7);doc.setFont('helvetica','normal');doc.text('Huella informativa de captura (no certifica identidad ni autenticidad):',15,228);
     doc.text(digest||'No disponible',15,234);
     doc.setFontSize(9);doc.setTextColor(142,65,35);
     doc.text('PENDIENTE DE REGULARIZACION EN EL SISTEMA AUTORIZADO',15,260);
     doc.setTextColor(73,88,77);doc.setFontSize(8);
     doc.text('Este PDF es un registro local. No sustituye el comprobante oficial Starken.',15,270);
     doc.save('Gestark_entrega_contingencia_OF_'+record.of+'.pdf');
     confirmedSnapshot.pdfGenerated=true;pdfStatus('PDF descargado. Pendiente de regularizar en Starken.','ok');toast('PDF generado ✓');
   }catch(err){console.warn('Gestark: no se pudo generar PDF',err);pdfStatus('No fue posible generar el PDF. Comprueba internet y vuelve a intentar.','bad')}
   finally{$('export-pdf').disabled=false}
 }
 function init(){
   if(active)return;active=true;
   records=loadRecords();renderRecords();$('workspace').hidden=false;
   prepareSign();
   $('reg-operator').value=operatorName||currentUser;
   $('start-cam').addEventListener('click',startCamera);$('stop-cam').addEventListener('click',stopCamera);
   $('torch').addEventListener('click',toggleTorch);
   $('new-order').addEventListener('click',newOrder);
   $('manual-form').addEventListener('submit',e=>{e.preventDefault();const read=core.parseBarcode($('manual-code').value);if(!read.valid){status('O.F. no reconocida. Revisa los nueve dígitos o el código largo.','bad');return}validOF(read,'manual');$('manual-code').value=''});
   $('field-rut').addEventListener('input',updateRutWarning);
   $('clear-sign').addEventListener('click',()=>{if(!confirmedRecord)clearSign()});
   $('reg-save').addEventListener('click',registerDelivery);
   $('export-pdf').addEventListener('click',exportPdf);
   $('reg-copy').addEventListener('click',copyPending);
   $('reg-clear').addEventListener('click',()=>{if(confirm('¿Eliminar solo entregas marcadas como regularizadas? No podrán recuperarse.'))storeRecords(records.filter(x=>x.status!=='regularized'))});
   $('reg-history').addEventListener('click',e=>{const b=e.target.closest('[data-action="regularize"]');if(b)regularize(b.dataset.id)});
   const warm=()=>loadScript(SCAN_LIB,'Html5Qrcode').catch(()=>{});
   if('requestIdleCallback' in window)window.requestIdleCallback(warm,{timeout:2500});else setTimeout(warm,500);
 }
 document.addEventListener('gestark:ready',e=>{
   const u=e.detail||{};if(!u.username){$('gate').hidden=false;return}
   currentUser=String(u.username).slice(0,30);operatorName=String(u.name||u.username).slice(0,70);
   deliveryStorage=DELIVERY_PREFIX+currentUser;init();
 });
 window.addEventListener('storage',e=>{if(active&&e.key===deliveryStorage){records=loadRecords();renderRecords()}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&cameraOn)stopCamera()});
 window.addEventListener('pagehide',()=>{if(cameraOn||scanner)stopCamera()});
})();
