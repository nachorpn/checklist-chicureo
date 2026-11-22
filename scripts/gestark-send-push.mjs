/**
 * Gestark · Web Push con GitHub Actions (sin Cloud Functions)
 * Cuenta de Firebase Auth dedicada, role=notifier, solo lectura en Firestore.
 * VAPID_PRIVATE en GitHub Actions Secrets, jamás en el repo.
 * Calendario: America/Santiago. La ejecución programada puede retrasarse.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const PROJECT='gestark-213f7';
const API_KEY='AIzaSyCx0QJACMuYGNh_N8ywoDYwa9JV1NpH4sQ'; // identificador web público
const BASE=`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const ZONE='America/Santiago';
const SLOT_MAP={
 '0 10 * * 1-5':'orders_1000',
 '30 12 * * 1-5':'checklist_1230',
 '30 13 * * 1-5':'orders_1330',
 '0 17 * * 1-5':'orders_1700'
};
const __dirname=path.dirname(fileURLToPath(import.meta.url));
function localTime(date=new Date()){
 const part=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(date).map(p=>[p.type,p.value]));
 return {iso:`${part.year}-${part.month}-${part.day}`,hour:Number(part.hour),minute:Number(part.minute),weekday:part.weekday};
}
function fromFirestore(value){
 if(!value||typeof value!=='object')return null;
 if('stringValue' in value)return value.stringValue;
 if('integerValue' in value)return Number(value.integerValue);
 if('doubleValue' in value)return Number(value.doubleValue);
 if('booleanValue' in value)return value.booleanValue;
 if('nullValue' in value)return null;
 if('timestampValue' in value)return value.timestampValue;
 if('mapValue' in value)return Object.fromEntries(Object.entries(value.mapValue.fields||{}).map(([k,v])=>[k,fromFirestore(v)]));
 if('arrayValue' in value)return (value.arrayValue.values||[]).map(fromFirestore);
 return null;
}
function decodeDoc(doc){return {id:doc.name?.split('/').at(-1),...Object.fromEntries(Object.entries(doc.fields||{}).map(([k,v])=>[k,fromFirestore(v)]))};}
function pendingOF(rosters){
 let count=0;
 for(const item of rosters){
  if(item.deleted===true||!Array.isArray(item.orders))continue;
  const closures=item.closures&&typeof item.closures==='object'?item.closures:{};
  for(const order of item.orders){if(/^\d{9}$/.test(String(order?.of||'')) && closures[order.of]!==true)count++;}
 }
 return count;
}
function validEndpoint(endpoint){
 try{const u=new URL(endpoint);if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443')return false;
  const h=u.hostname.toLowerCase();return h==='fcm.googleapis.com'||h==='fcm-xm.googleapis.com'||h==='android.googleapis.com'||h==='updates.push.services.mozilla.com'||h.endsWith('.push.apple.com')||h==='web.push.apple.com'||h==='wns.notify.windows.com'||h.endsWith('.notify.windows.com');
 }catch{return false;}
}
function modeFromEvent(env){
 if(env.GESTARK_PUSH_MODE && env.GESTARK_PUSH_MODE!=='auto')return env.GESTARK_PUSH_MODE;
 return SLOT_MAP[(env.GESTARK_PUSH_CRON||'').trim()]||null;
}
async function authToken(email,password){
 if(!email||!password)throw Error('Faltan GESTARK_NOTIFIER_EMAIL y GESTARK_NOTIFIER_PASSWORD en GitHub Secrets.');
 const resp=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});
 const obj=await resp.json();if(!resp.ok||!obj.idToken)throw Error('No se pudo iniciar sesión con la cuenta notificador de Firebase ('+String(obj.error?.message||resp.status)+').');
 return obj.idToken;
}
async function listDocs(collection,token){
 let next='',items=[],pages=0;
 do{
  const url=new URL(`${BASE}/${collection}`);url.searchParams.set('pageSize','200');if(next)url.searchParams.set('pageToken',next);
  const resp=await fetch(url,{headers:{Authorization:'Bearer '+token}});const obj=await resp.json();
  if(!resp.ok)throw Error('Firestore '+collection+': '+String(obj.error?.message||resp.status));
  items.push(...(obj.documents||[]).map(decodeDoc));next=obj.nextPageToken||'';
  if(++pages>100)throw Error('Demasiadas páginas para una tarea de recordatorios; revisar datos.');
 }while(next);
 return items;
}
async function main(env=process.env){
 const mode=modeFromEvent(env),now=localTime();
 if(!mode){console.log('No hay horario seleccionado; se omite ejecución.');return;}
 if(mode!=='prueba'&&!['Mon','Tue','Wed','Thu','Fri'].includes(now.weekday)){console.log('Día no laborable (lunes-viernes), sin envíos.');return;}
 if(mode!=='prueba'&&!['orders_1000','orders_1330','orders_1700','checklist_1230'].includes(mode))throw Error('Horario no permitido.');
 // El Checklist no debe recordarse una vez vencido el límite de las 13:00.
 if(mode==='checklist_1230'&&now.hour>=13){console.log('Checklist fuera de plazo por retraso del ejecutor: aviso omitido.');return;}
 const publicConfig=JSON.parse(await fs.readFile(path.resolve(__dirname,'../gestark-push-config.json'),'utf8'));
 if(!publicConfig.vapidPublicKey||publicConfig.vapidPublicKey.startsWith('REEMPLAZAR_'))throw Error('Configura la clave pública en gestark-push-config.json.');
 const token=await authToken(env.GESTARK_NOTIFIER_EMAIL,env.GESTARK_NOTIFIER_PASSWORD);
 let count=0;
 if(mode.startsWith('orders_')){
  const rosters=await listDocs('gestark_client_deliveries_v1',token);
  count=pendingOF(rosters);
  console.log('O.F. pendientes contabilizadas:',count);
  if(!count){console.log('No hay O.F. por cerrar: no se enviarán notificaciones.');return;}
 }
 const subscribed=(await listDocs('gestark_push_subscriptions_v1',token)).filter(x=>x && typeof x.endpoint==='string' && x.uid);
 if(!subscribed.length){console.log('No hay dispositivos suscritos.');return;}
 const body=mode==='prueba'?'Prueba de Gestark: el sistema de notificaciones está funcionando.':
  mode==='checklist_1230'?'Recuerda enviar el Checklist diario antes de las 13:00.':
  `${count} O.F. ${count===1?'pendiente':'pendientes'} de cierre. Ingresa a Nómina operativa.`;
 const title=mode==='prueba'?'Gestark · Aviso de prueba':mode==='checklist_1230'?'Gestark · Checklist diario':'Gestark · O.F. por cerrar';
 const target=mode==='checklist_1230'?'checklist':'clients';
 const payload=JSON.stringify({title,body,target,tag:`gestark-${mode}-${now.iso}`,kind:mode});
 const active=subscribed.filter(s=>mode==='prueba'||(mode==='checklist_1230'?s.checklistEnabled===true:s.ordersEnabled===true));
 if(!active.length){console.log('Todos los dispositivos tienen esta notificación desactivada.');return;}
 if(env.GESTARK_PUSH_DRY_RUN==='true'){
  console.log('Modo simulación: '+active.length+' dispositivo(s), '+mode+'; sin envío.');return;
 }
 if(!env.GESTARK_VAPID_PRIVATE)throw Error('Falta el secreto GESTARK_VAPID_PRIVATE.');
 const {default:webPush}=await import('web-push');
 webPush.setVapidDetails('https://nachorpn.github.io/checklist-chicureo/',publicConfig.vapidPublicKey,env.GESTARK_VAPID_PRIVATE);
 let ok=0,failed=0,expired=0;
 for(const recipient of active){
  if(!validEndpoint(recipient.endpoint) || !recipient.p256dh || !recipient.auth){failed++;console.warn('Suscripción con formato o dominio no permitido (se omite).');continue;}
  try {
   await webPush.sendNotification({endpoint:recipient.endpoint,keys:{p256dh:recipient.p256dh,auth:recipient.auth}},payload,{TTL:3600,urgency:'normal'});
   ok++;
  }catch(error){
   const code=Number(error?.statusCode)||0;if(code===404||code===410){expired++;continue;}
   failed++;console.warn('Falló envío Web Push:',code||'error');
  }
 }
 console.log(`Resultado (${mode}): enviados=${ok}, expirados=${expired}, otros fallos=${failed}.`);
 if(failed && !ok)process.exitCode=1;
}
if(fileURLToPath(import.meta.url)===path.resolve(process.argv[1]||'')){main().catch(e=>{console.error('Gestark Push:',e.message||e);process.exitCode=1;});}
export {fromFirestore,decodeDoc,pendingOF,validEndpoint,modeFromEvent,localTime,main};
