/* Gestark Laboratorio: cámara, OCR opcional, firma y constancia local de prueba. */
(()=>{
 'use strict';
 const core=window.GestarkLabCore;
 const $=id=>document.getElementById(id);
 const FIELDS=['order','pieces','name','rut','retriever','address','rutRetriever','origin','destination','deliveryType','issued','delivered','time','payment','amount','weight'];
 const STORAGE='gestark:lab:orders:CIBC:v1',MAX=1000;
 let active=false,scanner=null,working=false,cameraOn=false,stopping=false,flashOn=false;
 let entries=[],imageFile=null,imageUrl=null,lastRaw='',lastAt=0,recognizedSource='manual';
 let ocrWorker=null,ocrBusy=false,signatureCanvas=null,sigCtx=null,signed=false,penDown=false;
 let toastTimeout=null;
 function status(text,kind=''){const e=$('scan-status');e.textContent=text;e.className='stat '+kind}
 function ocrStatus(text,kind=''){const e=$('ocr-status');e.textContent=text;e.className='stat '+kind}
 function pdfStatus(text,kind=''){const e=$('pdf-status');e.textContent=text;e.className='stat '+kind}
 function toast(str){const e=$('toast');e.textContent=str;e.classList.add('visible');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>e.classList.remove('visible'),2250)}
 function canUse(){return active&&document.documentElement.classList.contains('gestark-unlocked')}
 function values(){const r={};FIELDS.forEach(k=>r[k]=$('field-'+k)?.value.trim()||'');return r}
 function setField(key,val){const e=$('field-'+key);if(e)e.value=String(val||'').slice(0,e.maxLength>0?e.maxLength:180)}
 function clearData(){for(const key of FIELDS)setField(key,'');$('ocr-text').value='';recognizedSource='manual';$('source-label').textContent='Sin datos reconocidos';$('lastread').style.display='none';if($('rut-warning'))$('rut-warning').textContent='';clearSign()}
 function showSource(text){recognizedSource=text;$('source-label').textContent=text}
 function onValidCode(read,source='cámara'){
   if(!canUse())return;
   if(!read.valid){status('No se pudo obtener O.F. del código. Puedes revisarlo o ingresar el número manualmente.','bad');return}
   const now=Date.now();if(read.raw===lastRaw && now-lastAt<1700)return;lastRaw=read.raw;lastAt=now;
   const previous=$('field-order').value.trim();
   if(previous&&previous!==read.of){clearData()}
   setField('order',read.of);if(read.piece)setField('pieces',read.piece);
   $('last-of').textContent=read.of;$('last-type').textContent=source+': '+read.detail;
   $('lastread').style.display='block';showSource('Escaneo · confirmar campos');
   saveEntry(read,source);
   status('O.F. '+read.of+' identificada. Verifica el número antes de usarlo.','ok');
   try{if(navigator.vibrate)navigator.vibrate(50)}catch(_){ }
 }
 function keyFor(x){return x.of}
 function loadEntries(){try{let a=JSON.parse(localStorage.getItem(STORAGE)||'[]');return Array.isArray(a)?a.filter(x=>/^\d{9}$/.test(x.of)).slice(-MAX):[]}catch{return []}}
 function storeEntries(arr){try{localStorage.setItem(STORAGE,JSON.stringify(arr));entries=arr;renderEntries();return true}catch(e){status('Sin espacio local: copia la lista y libéralo.', 'bad');return false}}
 function saveEntry(info,source){
   const of=info.of;if(entries.some(x=>x.of===of)){toast('O.F. ya registrada: '+of);return}
   if(entries.length>=MAX){status('La lista está completa; copia y limpia las O.F. antiguas.','bad');return}
   const record={of,at:Date.now(),type:source};
   if(storeEntries([...entries,record]))toast('O.F. '+of+' guardada ✓');
 }
 function renderEntries(){
   $('total').textContent=String(entries.length);$('copy-history').disabled=!entries.length;$('clear-history').disabled=!entries.length;
   const root=$('history');root.replaceChildren();if(!entries.length){const d=document.createElement('div');d.className='empty';d.textContent='No hay órdenes guardadas.';root.append(d);return}
   const fragment=document.createDocumentFragment();entries.slice().reverse().forEach(entry=>{
     const row=document.createElement('div');row.className='mini-row';const text=document.createElement('div');text.style.flex='1';
     const num=document.createElement('span');num.className='code';num.textContent=entry.of;const meta=document.createElement('small');meta.textContent=new Date(entry.at).toLocaleString('es-CL')+' · '+entry.type;text.append(num,meta);
     const use=document.createElement('button');use.type='button';use.className='micro';use.textContent='Usar';use.dataset.action='use';use.dataset.of=entry.of;
     const del=document.createElement('button');del.type='button';del.className='micro';del.textContent='✕';del.dataset.action='delete';del.dataset.of=entry.of;del.setAttribute('aria-label','Eliminar '+entry.of);
     row.append(text,use,del);fragment.append(row);
   });root.append(fragment);
 }
 async function copyText(value){try{await navigator.clipboard.writeText(value);return true}catch{}
   const t=document.createElement('textarea');t.value=value;t.style.cssText='position:fixed;left:-9999px;opacity:0';document.body.append(t);t.select();let ok=false;try{ok=document.execCommand('copy')}catch{}t.remove();return ok;
 }
 const scriptCache=new Map();
 function loadScript(url,global){if(window[global])return Promise.resolve(window[global]);if(scriptCache.has(url))return scriptCache.get(url);
   const p=new Promise((resolve,reject)=>{const el=document.createElement('script');el.src=url;el.async=true;el.onload=()=>window[global]?resolve(window[global]):reject(new Error('No se pudo cargar '+global));el.onerror=()=>reject(new Error('No se pudo descargar la biblioteca. Revisa internet.'));document.head.appendChild(el)});
   scriptCache.set(url,p);p.catch(()=>scriptCache.delete(url));return p;
 }
 const QR_LIB='https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';
 const OCR_LIB='https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';
 const PDF_LIB='https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js';
 function showCamera(on){cameraOn=on;$('camera').style.display=on?'block':'none';$('cam-placeholder').style.display=on?'none':'flex';$('start-cam').disabled=on;$('stop-cam').disabled=!on;$('cam-badge').textContent=on?'Escaneando':'Apagada';if(!on){$('torch').hidden=true;flashOn=false}}
 function onDecode(raw){const p=core.parseBarcode(raw);if(p.valid){onValidCode(p,'cámara')}else{const now=Date.now();if(raw!==lastRaw||now-lastAt>3000){lastRaw=raw;lastAt=now;status('Código leído pero el patrón no es reconocible: '+String(raw).slice(0,42),'bad')}}}
 async function startCamera(){if(!canUse()||cameraOn||working)return;if(!navigator.mediaDevices?.getUserMedia){status('Cámara no disponible. Abre Gestark en Safari o Chrome por HTTPS.','bad');return}
   working=true;$('start-cam').disabled=true;status('Preparando cámara trasera…');
   try{
     await loadScript(QR_LIB,'Html5Qrcode');
     const f=window.Html5QrcodeSupportedFormats;
     const formats=[f.CODE_128,f.CODE_39,f.ITF,f.EAN_13,f.EAN_8,f.QR_CODE].filter(x=>x!==undefined);
     scanner=new Html5Qrcode('camera',{formatsToSupport:formats,useBarCodeDetectorIfSupported:true,verbose:false});
     await scanner.start({facingMode:'environment'},{fps:12,qrbox:(w,h)=>({width:Math.max(80,Math.min(w-12,440,Math.floor(w*.94))),height:Math.max(55,Math.min(h-12,190,Math.floor(h*.44)))}),disableFlip:true},onDecode,()=>{});
     if(document.hidden){await stopCamera();return}
     showCamera(true);status('Escaneando. Enfoca cualquiera de los dos códigos.','ok');
     try{const cap=scanner.getRunningTrackCapabilities?.();$('torch').hidden=!cap?.torch}catch(_){$('torch').hidden=true}
   }catch(e){console.warn('Lab scan',e);status(/denied|permission|notallowed/i.test(String(e))?'Permiso de cámara denegado. Revisa Ajustes.':'No fue posible abrir la cámara. Puedes ingresar un código o usar una foto.','bad');try{await scanner?.clear()}catch(_){}scanner=null;showCamera(false)}
   finally{working=false;$('start-cam').disabled=cameraOn}
 }
 async function stopCamera(){if(stopping)return;stopping=true;
   try{if(scanner){try{await scanner.stop()}catch(_){}try{await scanner.clear()}catch(_){}scanner=null}}finally{showCamera(false);stopping=false;status('Cámara apagada. La lista se conserva.')}}
 async function toggleTorch(){if(!cameraOn||!scanner)return;try{await scanner.applyVideoConstraints({advanced:[{torch:!flashOn}]});flashOn=!flashOn;$('torch').textContent=flashOn?'Apagar luz':'Linterna'}catch(_){toast('Linterna no disponible en esta cámara');$('torch').hidden=true}}
 async function setPhoto(file){if(!file)return;if(!file.type.startsWith('image/')){ocrStatus('Selecciona una fotografía válida.','bad');return}
   imageFile=file;if(imageUrl)URL.revokeObjectURL(imageUrl);imageUrl=URL.createObjectURL(file);
   $('photo-preview').src=imageUrl;$('photo-area').style.display='grid';$('photo-desc').textContent=file.name+' · La foto no se sube a Gestark';ocrStatus('Fotografía preparada. Puedes leer el código o solicitar OCR.');
 }
 async function readBarcodePhoto(){if(!canUse()||!imageFile)return;ocrStatus('Buscando códigos de barras en la imagen…');
   let reader=null;
   try{await loadScript(QR_LIB,'Html5Qrcode');const f=Html5QrcodeSupportedFormats;
     reader=new Html5Qrcode('image-reader',{formatsToSupport:[f.CODE_128,f.CODE_39,f.ITF,f.EAN_13,f.EAN_8,f.QR_CODE].filter(x=>x!==undefined),useBarCodeDetectorIfSupported:true,verbose:false});
     const raw=await reader.scanFile(imageFile,true);const parsed=core.parseBarcode(raw);
     if(parsed.valid){onValidCode(parsed,'fotografía');ocrStatus('Código identificado. Puedes reconocer el resto del texto si lo necesitas.','ok')}
     else{ocrStatus('Se leyó un código, pero el patrón no permitió identificar la O.F.','bad');$('manual-code').value=raw}
   }catch(e){ocrStatus('No se detectó un código legible en esta foto. Prueba con la cámara en vivo o con OCR.','bad')}
   finally{try{await reader?.clear()}catch(_){} }
 }
 async function getImageCanvas(file){
   const blobUrl=URL.createObjectURL(file);let img;
   try{img=new Image();img.decoding='async';img.src=blobUrl;await img.decode();const scale=Math.min(1,1850/Math.max(img.naturalWidth,img.naturalHeight));const w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale));const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,w,h);return c}
   finally{URL.revokeObjectURL(blobUrl)}
 }
 function applyText(text){const parsed=core.parseText(text);const fields=parsed.fields;
   if(fields.order && $('field-order').value && fields.order!==$('field-order').value){
     if(!confirm('El texto indica una O.F. diferente a la escaneada. ¿Deseas reemplazar los datos del formulario?')){const p=fields.order;fields.order='';ocrStatus('O.F. diferente: no se aplicó la información de esa fotografía.','bad');return}else clearData();
   }
   for(const k of FIELDS){if(fields[k])setField(k,fields[k])}
   showSource('Texto '+fields.source+' · revisar');
   if(fields.order)saveEntry({of:fields.order},'texto OCR');
   updateRutWarnings();ocrStatus('Extraídos '+parsed.found.length+' campos. Revisa y corrige nombres, RUT y fecha.','ok');toast('Extracción completada · revisar datos');
 }
 async function runOCR(){if(!canUse()||!imageFile||ocrBusy)return;ocrBusy=true;$('photo-ocr').disabled=true;
   try{
     ocrStatus('Cargando motor OCR en el dispositivo. La primera vez puede tardar…');
     const lib=await loadScript(OCR_LIB,'Tesseract');
     if(!ocrWorker){ocrWorker=await lib.createWorker('spa',1,{logger:m=>{if(!m)return;const percent=typeof m.progress==='number'?' '+Math.round(m.progress*100)+'%':'';ocrStatus('OCR: '+String(m.status||'procesando')+percent)}})}
     const canvas=await getImageCanvas(imageFile);
     const ans=await ocrWorker.recognize(canvas);
     const extracted=ans.data?.text||'';$('ocr-text').value=extracted;
     if(!extracted.trim()){ocrStatus('No se detectó texto. Acerca la cámara y evita reflejos.','bad');return}
     applyText(extracted);
   }catch(e){console.error('OCR Gestark',e);ocrStatus('No se pudo completar el OCR. Conexión o memoria insuficiente; puedes ingresar datos a mano.','bad')}
   finally{ocrBusy=false;$('photo-ocr').disabled=false}
 }
 function updateRutWarnings(){const vals=values();const messages=[];for(const [key,label] of [['rut','RUT destinatario'],['rutRetriever','RUT quien retira']]){const check=core.validateRut(vals[key]);if(check===false)messages.push(label+': dígito verificador no válido o dato incompleto')}const el=$('rut-warning');el.textContent=messages.length?'⚠ '+messages.join('. '):'';el.style.color=messages.length?'#a23f38':'#6b8577'}
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
   signatureCanvas.addEventListener('pointerdown',e=>{if(!canUse())return;penDown=true;signed=true;signatureCanvas.setPointerCapture(e.pointerId);const p=pos(e);sigCtx.beginPath();sigCtx.moveTo(p.x,p.y);sigCtx.lineTo(p.x+.02,p.y+.02);sigCtx.stroke()});
   signatureCanvas.addEventListener('pointermove',e=>{if(!penDown)return;const p=pos(e);sigCtx.lineTo(p.x,p.y);sigCtx.stroke()});
   ['pointerup','pointercancel','lostpointercapture'].forEach(ev=>signatureCanvas.addEventListener(ev,()=>penDown=false));
 }
 function clearSign(){if(signatureCanvas&&sigCtx){sigCtx.clearRect(0,0,signatureCanvas.width,signatureCanvas.height)}signed=false}
 async function hashString(s){if(!crypto.subtle)return '';const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('')}
 async function exportPdf(){const data=values();if(!/^\d{9}$/.test(data.order)){pdfStatus('Ingresa una O.F. de 9 dígitos antes de generar el PDF.','bad');$('field-order').focus();return}
   pdfStatus('Preparando constancia PDF de prueba…');$('export-pdf').disabled=true;
   try{await loadScript(PDF_LIB,'jspdf');const PDF=window.jspdf?.jsPDF;if(!PDF)throw new Error('No hay PDF');
     const doc=new PDF({unit:'mm',format:'a4',compress:true});const gray=[74,94,83],green=[15,97,69];const now=new Date();
     doc.setFillColor(...green);doc.rect(0,0,210,39,'F');doc.setFont('helvetica','bold');doc.setFontSize(17);doc.setTextColor(255);doc.text('Gestark | Laboratorio',15,16);doc.setFontSize(10);doc.text('CONSTANCIA DE PRUEBA - NO OFICIAL',15,25);doc.setFont('helvetica','normal');doc.setFontSize(8);doc.text('Registro local: '+now.toLocaleString('es-CL'),15,32);
     doc.setTextColor(20,45,35);doc.setFont('helvetica','bold');doc.setFontSize(13);doc.text('Datos de la orden / receptor',15,51);
     let y=61;doc.setFontSize(9);const lab={order:'Orden de flete',pieces:'Bultos / encargos',name:'Destinatario / receptor',rut:'RUT destinatario',retriever:'Persona que retira',rutRetriever:'RUT de quien retira',address:'Dirección',destination:'Destino',origin:'Origen',deliveryType:'Tipo de entrega',issued:'Fecha de emisión',delivered:'Fecha de entrega impresa',time:'Hora impresa',payment:'Tipo de pago',amount:'Monto',weight:'Peso'};
     const clip=(x)=>doc.splitTextToSize(String(x),115);
     for(const k of FIELDS){if(!data[k])continue;if(y>232){doc.addPage();y=24}doc.setTextColor(...gray);doc.setFont('helvetica','normal');doc.text(lab[k]+':',16,y);doc.setTextColor(17,50,34);doc.setFont('helvetica','bold');const lines=clip(data[k]);doc.text(lines,79,y);y+=Math.max(7,lines.length*5+2)}
     if(y>223){doc.addPage();y=24}y+=5;doc.setDrawColor(200,218,207);doc.line(15,y,195,y);y+=10;
     doc.setFontSize(9);doc.setTextColor(...gray);doc.setFont('helvetica','bold');doc.text('Firma de prueba',15,y);y+=5;
     if(signed){const png=signatureCanvas.toDataURL('image/png');doc.addImage(png,'PNG',15,y,88,35)}else{doc.setFont('helvetica','normal');doc.text('Sin firma',15,y+10)}
     const digest=await hashString(JSON.stringify(data)+now.toISOString()+(signed?signatureCanvas.toDataURL('image/png'):''));
     if(y+54>271){doc.addPage();y=24}
     doc.setFontSize(7);doc.setFont('helvetica','normal');doc.setTextColor(90);doc.text('Huella de datos capturados (no certifica el PDF ni la identidad):',15,y+46);doc.text(digest||'No disponible',15,y+51);
     doc.setFillColor(245,247,243);doc.rect(12,276,186,12,'F');doc.setTextColor(105,61,32);doc.setFontSize(8);doc.text('BORRADOR INTERNO. NO REEMPLAZA EL COMPROBANTE OFICIAL DE STARKEN.',16,283);
     doc.save('Gestark_prueba_OF_'+data.order+'.pdf');pdfStatus('PDF de prueba generado en este dispositivo.','ok');toast('PDF descargado ✓');
   }catch(e){console.error('PDF Gestark',e);pdfStatus('No se pudo generar PDF. Comprueba la conexión y vuelve a intentar.','bad')}
   finally{$('export-pdf').disabled=false}
 }
 function init(){if(active)return;active=true;entries=loadEntries();renderEntries();$('workspace').hidden=false;prepareSign();
   $('start-cam').addEventListener('click',startCamera);$('stop-cam').addEventListener('click',stopCamera);$('torch').addEventListener('click',toggleTorch);
   $('manual-form').addEventListener('submit',e=>{e.preventDefault();const p=core.parseBarcode($('manual-code').value);if(!p.valid){status('Código no reconocido. Verifica su longitud (O.F.: nueve dígitos).','bad');return}onValidCode(p,'manual');$('manual-code').value=''});
   $('take-photo').addEventListener('click',()=>$('photo-file').click());$('choose-photo').addEventListener('click',()=>$('gallery-file').click());$('photo-file').addEventListener('change',e=>setPhoto(e.target.files?.[0]));$('gallery-file').addEventListener('change',e=>setPhoto(e.target.files?.[0]));
   $('photo-barcode').addEventListener('click',readBarcodePhoto);$('photo-ocr').addEventListener('click',runOCR);
   $('parse-text').addEventListener('click',()=>{const str=$('ocr-text').value;if(!str.trim()){ocrStatus('Primero añade o reconoce texto.','bad');return}applyText(str)});
   $('history').addEventListener('click',e=>{const el=e.target.closest('[data-action]');if(!el)return;const of=el.dataset.of;if(el.dataset.action==='delete'){if(confirm('¿Eliminar la O.F. '+of+' de esta lista?'))storeEntries(entries.filter(x=>x.of!==of))}else if(el.dataset.action==='use'){if($('field-order').value&&$('field-order').value!==of)clearData();setField('order',of);toast('O.F. seleccionada')}});
   $('copy-history').addEventListener('click',async()=>toast(await copyText(entries.map(x=>x.of).join('\n'))?'Lista copiada para Excel':'No se pudo copiar'));
   $('clear-history').addEventListener('click',()=>{if(confirm('¿Borrar las '+entries.length+' O.F. de prueba almacenadas en este dispositivo?'))storeEntries([])});
   $('clear-sign').addEventListener('click',clearSign);$('clear-form').addEventListener('click',()=>{if(confirm('¿Comenzar otra prueba? Se borrarán los datos del formulario y la firma, pero no la lista de O.F.')){clearData();if(imageUrl)URL.revokeObjectURL(imageUrl);imageUrl=null;imageFile=null;$('photo-area').style.display='none';$('photo-file').value='';$('gallery-file').value=''}});
   $('export-pdf').addEventListener('click',exportPdf);$('field-rut').addEventListener('input',updateRutWarnings);$('field-rutRetriever').addEventListener('input',updateRutWarnings);
 }
 document.addEventListener('gestark:ready',e=>{
    const u=e.detail||{};
    if(u.username==='CIBC'&&u.role==='admin'){init()}
    else{$('gate').hidden=false;$('workspace').hidden=true}
 });
 window.addEventListener('storage',e=>{if(active&&e.key===STORAGE){entries=loadEntries();renderEntries()}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&cameraOn)stopCamera()});
 window.addEventListener('pagehide',()=>{if(cameraOn||scanner)stopCamera();if(imageUrl)URL.revokeObjectURL(imageUrl);if(ocrWorker)ocrWorker.terminate().catch(()=>{})});
})();
