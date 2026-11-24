/* Gestark · Nómina operativa y archivo por fecha · v2026.11.23.30
 * Presentación independiente: conserva el escáner y los datos originales.
 * «Archivada» significa O.F. cerrada en sistema; NO elimina ni mueve
 * documentos de Firestore. El módulo Cloud sincroniza el cambio de estado.
 */
(() => {
'use strict';
if (!location.pathname.endsWith('/entregas-clientes.html') || window.__gestarkClientsUiLoaded) return;
window.__gestarkClientsUiLoaded = true;
const HISTORY_KEY='gestark:clients:rosters:v1';
const STATUS_KEY='gestark:clients:system-closure:v1';
const DATES_KEY='gestark:clients:closure-dates:v1';
const PAGE_SIZE=60;
const TZ='America/Santiago';
const $=id=>document.getElementById(id);
const numFmt=new Intl.NumberFormat('es-CL');
const dateFmt=new Intl.DateTimeFormat('es-CL',{day:'2-digit',month:'short',year:'numeric',timeZone:TZ});
const headingDateFmt=new Intl.DateTimeFormat('es-CL',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:TZ});
const hourFmt=new Intl.DateTimeFormat('es-CL',{hour:'2-digit',minute:'2-digit',timeZone:TZ});
const dayFmt=new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:TZ});
const dayKey=t=>{const parts=dayFmt.formatToParts(new Date(t));const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return p.year+p.month+p.day;};
const validOF=v=>/^\d{9}$/.test(String(v||''));
const nameKey=v=>String(v||'').normalize('NFC').toLocaleLowerCase('es-CL').replace(/\s+/g,' ').trim();
const searchKey=v=>nameKey(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const rutKey=v=>String(v||'').toUpperCase().replace(/[.\s-]/g,'');
function readClientRef(v){
 if(!v||typeof v!=='object')return null;
 const id=String(v.id||''),rut=String(v.rut||'').trim().toUpperCase();
 if(!/^[0-9]{1,3}(\.[0-9]{3}){0,2}-[0-9K]$/.test(rut)||!/^[0-9]{1,8}-[0-9K]$/.test(id)||rut.replace(/\./g,'')!==id)return null;
 const [body,dv]=id.split('-');if(Number(body)===0)return null;
 let sum=0,factor=2;for(let i=body.length-1;i>=0;i--){sum+=Number(body[i])*factor;factor=factor===7?2:factor+1}
 const m=11-sum%11;if((m===11?'0':m===10?'K':String(m))!==dv)return null;
 return {id,rut,alias:typeof v.alias==='string'?v.alias.slice(0,100):''};
}
const collapsed=new Set();
const dateBucket=r=>mode==='pending'?dayKey(r.at):(r.legacy?'legacy:':'closed:')+dayKey(r.archivedAt);
const clientBucket=r=>r.clientRef?'ref:'+r.clientRef.id:'manual:'+nameKey(r.client);
function groupRows(source){
 const days=new Map();
 for(const r of source){
  const dk=dateBucket(r);let day=days.get(dk);
  if(!day){day={key:dk,at:mode==='pending'?r.at:r.archivedAt,legacy:mode==='archived'&&r.legacy,groups:new Map(),total:0};days.set(dk,day)}
  const ck=clientBucket(r);let group=day.groups.get(ck);
  if(!group){group={key:mode+'|'+dk+'|'+ck,client:r.client,ref:r.clientRef,rows:[]};day.groups.set(ck,group)}
  group.rows.push(r);day.total++;
 }
 return [...days.values()];
}
function matchSearch(r,q){
 if(!q)return true;
 const norm=searchKey(q);
 if(r.of.includes(norm)||searchKey(r.client).includes(norm)||searchKey(r.clientRef?.alias).includes(norm))return true;
 const compact=rutKey(q);
 return !!r.clientRef&&/^[0-9K]+$/.test(compact)&&rutKey(r.clientRef.rut).includes(compact);
}
function svgIcon(name){
 const paths={chevron:'M6 9l6 6 6-6',copy:'M8 8h12v12H8zM4 16V4h12',close:'M9 12l2 2 4-5M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18',reopen:'M9 7H4v5M4 7l3 3a7 7 0 1 1 1 10',remove:'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v6M14 10v6'};
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.7');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',paths[name]);svg.append(path);return svg;
}
async function copyRut(rut,control){
 let ok=false;
 try{await navigator.clipboard.writeText(rut);ok=true}catch(_){
  const t=document.createElement('textarea');t.value=rut;t.readOnly=true;t.style.cssText='position:fixed;left:0;top:0;opacity:0;';document.body.append(t);t.focus();t.select();t.setSelectionRange(0,t.value.length);try{ok=document.execCommand('copy')}catch(_e){}t.remove();
 }
 if(ok){control.classList.add('copied');control.setAttribute('aria-label','RUT copiado');control.title='RUT copiado';$('gs-rut-feedback').textContent='RUT copiado';setTimeout(()=>{control.classList.remove('copied');control.setAttribute('aria-label','Copiar RUT '+rut);control.title='Copiar RUT';$('gs-rut-feedback').textContent=''},1600)}
 else{window.prompt('Copia el RUT:',rut)}
}

const read=(key,fallback)=>{try{const a=JSON.parse(localStorage.getItem(key)||'null');return a&&typeof a==='object'?a:fallback}catch{return fallback}};
const readHistory=()=>{const a=read(HISTORY_KEY,[]);return Array.isArray(a)?a:[]};
const readClosures=()=>{const a=read(STATUS_KEY,{});return !Array.isArray(a)?a:{}};
const readDates=()=>{const a=read(DATES_KEY,{});return !Array.isArray(a)?a:{}};
const closeKey=(id,of)=>id+':'+of;
let mode='pending',search='',dateFilter='all',page=PAGE_SIZE,selection=null,renderQueued=false,lastFocus=null;
function el(tag,className,text){const x=document.createElement(tag);if(className)x.className=className;if(text!==undefined)x.textContent=String(text);return x}
function button(className,text){const x=el('button',className,text);x.type='button';return x}
function css(){
const s=document.createElement('style');s.id='gs-clientes-ui-css';s.textContent=`
#gs-clientes-ui{--gs-ink:#153d30;--gs-line:#e3ebe5;--gs-green:#226747;--gs-soft:#edf3ef;color:var(--gs-ink);display:grid;gap:10px;padding-bottom:16px;min-width:0}
#gs-clientes-ui *{box-sizing:border-box}
#gs-clientes-ui [hidden]{display:none!important}
#gs-clientes-ui .gs-main{background:#fff;border:1px solid #e0eae3;border-radius:16px;padding:15px;min-width:0}
#gs-clientes-ui .gs-heading{display:flex;justify-content:space-between;align-items:center;gap:8px}
#gs-clientes-ui h2{font-size:21px;letter-spacing:-.55px;margin:0 0 4px;font-weight:800;color:#153d30}
#gs-clientes-ui .gs-lead{margin:0;font-size:12px;color:#64786c;line-height:1.35}
#gs-clientes-ui .gs-stats{display:flex;gap:7px;flex-wrap:wrap;margin:9px 0 10px;font-size:12px;color:#5c7265;align-items:baseline}
#gs-clientes-ui .gs-stat{display:inline-flex;align-items:baseline;gap:4px}
#gs-clientes-ui .gs-stat strong{font-size:15px;font-weight:800;font-variant-numeric:tabular-nums;color:#176345}
#gs-clientes-ui .gs-stat.archived strong{color:#647b6c}
#gs-clientes-ui .gs-stat.archived:before{content:'·';padding-right:3px;color:#a4b4aa}
#gs-clientes-ui .gs-mode{display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:4px;border-radius:11px;background:#eff3f0;margin:6px 0 10px}
#gs-clientes-ui .gs-mode button{border:0;border-radius:8px;min-height:40px;font-weight:700;font-size:13px;color:#627568;background:transparent;padding:6px}
#gs-clientes-ui .gs-mode button[aria-selected=true]{background:white;color:#165f41;box-shadow:0 1px 5px #163c2220}
#gs-clientes-ui .gs-tools{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:end}
#gs-clientes-ui .gs-field{display:grid;gap:4px;font-size:11px;font-weight:650;color:#5b7666;min-width:0}
#gs-clientes-ui input,#gs-clientes-ui select{width:100%;border:1px solid #dce7df;outline-offset:2px;border-radius:9px;min-height:42px;padding:8px 10px;background:#f6f8f6;color:#234938;font-size:16px;font-weight:500;min-width:0}
#gs-clientes-ui input::placeholder{color:#829286;font-weight:400;font-size:13px}
#gs-clientes-ui .gs-countline{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:13px 0 8px;font-size:11px;color:#667d6e;font-weight:650}
#gs-clientes-ui .gs-countline strong{color:#456557;font-weight:700}
#gs-clientes-ui .gs-list{display:grid;gap:13px;min-width:0}
#gs-clientes-ui .gs-day-section{min-width:0}
#gs-clientes-ui .gs-day{margin:0;background:#edf3ef;color:#456558;border-radius:7px;padding:8px 10px;font-weight:750;font-size:12px;display:flex;align-items:center;justify-content:space-between;gap:8px}
#gs-clientes-ui .gs-day-title:first-letter{text-transform:uppercase}
#gs-clientes-ui .gs-day small{font-size:10px;font-weight:600;color:#60776b;text-align:right;flex-shrink:0}
#gs-clientes-ui .gs-day-note{font-size:10px;color:#718579;padding:5px 10px 0;margin:0}
#gs-clientes-ui .gs-client-group{padding:10px 2px 9px;border-bottom:1px solid var(--gs-line);min-width:0}
#gs-clientes-ui .gs-client-group:last-child{border-bottom:0;padding-bottom:0}
#gs-clientes-ui .gs-group-toggle{width:100%;display:flex;align-items:center;gap:7px;min-height:30px;background:transparent;border:0;padding:2px 0;text-align:left;color:#153d30;cursor:pointer;font:inherit;box-shadow:none}
#gs-clientes-ui .gs-group-name{flex:1;font-size:14px;font-weight:780;line-height:1.3;overflow-wrap:anywhere;min-width:0}
#gs-clientes-ui .gs-group-count{font-size:11px;font-weight:650;color:#697e72;white-space:nowrap}
#gs-clientes-ui .gs-group-toggle svg{width:17px;height:17px;color:#87998d;flex:none;transition:transform .16s ease}
#gs-clientes-ui .gs-group-toggle[aria-expanded=true] svg{transform:rotate(180deg)}
#gs-clientes-ui .gs-rut-line{display:flex;align-items:center;gap:4px;min-height:28px;padding:0 0 2px;color:#52695b;font-size:13px;font-variant-numeric:tabular-nums;user-select:text;-webkit-user-select:text}
#gs-clientes-ui .gs-rut-line.missing{font-size:11px;color:#78897e}
#gs-clientes-ui .gs-rut-number{font-weight:650}
#gs-clientes-ui .gs-icon{display:inline-flex;align-items:center;justify-content:center;background:transparent;border:0;box-shadow:none;border-radius:7px;padding:5px;color:#527b66;min-width:34px;min-height:34px;cursor:pointer;flex:none}
#gs-clientes-ui .gs-icon svg{width:19px;height:19px}
#gs-clientes-ui .gs-copy{min-width:34px;min-height:31px;color:#3f795b}
#gs-clientes-ui .gs-copy.copied{background:#e0f2e6;color:#126441}
#gs-clientes-ui .gs-orders{border-left:2px solid #dce8df;padding-left:9px;margin:2px 0 1px 2px;min-width:0}
#gs-clientes-ui .gs-order{display:flex;align-items:center;gap:8px;min-height:60px;border-bottom:1px solid #edf1ed;padding:7px 0;min-width:0;background:transparent}
#gs-clientes-ui .gs-order:last-child{border-bottom:0}
#gs-clientes-ui .gs-order-info{flex:1;min-width:0}
#gs-clientes-ui .gs-of{font:750 16px/1.3 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.04px;color:#254c39;font-variant-numeric:tabular-nums;white-space:nowrap}
#gs-clientes-ui .gs-order.closed .gs-of{color:#456355}
#gs-clientes-ui .gs-order-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:3px}
#gs-clientes-ui .gs-meta{font-size:11px;color:#60776b;line-height:1.3}
#gs-clientes-ui .gs-state{font-size:11px;display:inline-flex;align-items:center;gap:4px;color:#83652d;white-space:nowrap}
#gs-clientes-ui .gs-state:before{content:'';width:6px;height:6px;border-radius:50%;background:#c79a4f;flex:none}
#gs-clientes-ui .gs-order.closed .gs-state{color:#437656}
#gs-clientes-ui .gs-order.closed .gs-state:before{background:#66a17b}
#gs-clientes-ui .gs-order-actions{display:flex;gap:3px;align-items:center;flex-shrink:0}
#gs-clientes-ui .gs-action{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-width:106px;min-height:44px;padding:8px 10px;border:1px solid #176b4b;border-radius:9px;background:#176b4b;color:#fff;font-size:13px;font-weight:750;line-height:1.15;white-space:nowrap;flex:none;cursor:pointer;touch-action:manipulation}
#gs-clientes-ui .gs-action svg{width:19px;height:19px;flex:none;stroke-width:2}
#gs-clientes-ui .gs-action:hover,#gs-clientes-ui .gs-action:active{background:#10563c;border-color:#10563c}
#gs-clientes-ui .gs-action.reopen{background:#f2f7f3;color:#286447;border-color:#cfdfd3}
#gs-clientes-ui .gs-action.reopen:hover,#gs-clientes-ui .gs-action.reopen:active{background:#e2efe5;border-color:#b9d2c1}
#gs-clientes-ui .gs-remove{color:#916b63;min-width:44px;min-height:44px}
#gs-clientes-ui .gs-icon:hover{background:#eef5ef}
#gs-clientes-ui button:focus-visible{outline:2px solid #48a67a;outline-offset:2px}
#gs-clientes-ui .gs-empty{padding:24px 12px;text-align:center;border:1px dashed #cbded1;border-radius:10px;background:#fbfefa;color:#607d6b;font-size:13px;line-height:1.5}
#gs-clientes-ui .gs-empty strong{display:block;font-size:15px;color:#2c664a;margin-bottom:5px}
#gs-clientes-ui .gs-more{border:1px solid #c9ded0;background:#f0f8f2;color:#176446;font-weight:750;border-radius:9px;min-height:44px;margin-top:9px;width:100%;font-size:12px;cursor:pointer}
#gs-clientes-ui .gs-foot{font-size:11px;color:#718578;line-height:1.5;margin:10px 0 0}
#gs-rut-feedback{position:fixed;bottom:85px;left:50%;transform:translateX(-50%);z-index:10000;background:#174e39;color:white;padding:7px 12px;border-radius:9px;font-size:12px;pointer-events:none;white-space:nowrap}
#gs-rut-feedback:empty{display:none}
#gs-confirm-closure{box-sizing:border-box;max-width:460px;width:calc(100% - 28px);border:0;background:transparent;padding:0;max-height:85dvh;color:#173e2c}
#gs-confirm-closure::backdrop{background:rgba(3,30,18,.64);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}
#gs-confirm-closure .gs-dialog-body{box-sizing:border-box;border-radius:19px;padding:22px;background:white;box-shadow:0 15px 50px #00271d45;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
#gs-confirm-closure .gs-dialog-pill{font-size:11px;font-weight:850;color:#10704b;letter-spacing:.09em;text-transform:uppercase}
#gs-confirm-closure h3{font-size:23px;line-height:1.2;margin:9px 0 14px;letter-spacing:-.5px}
#gs-confirm-closure .gs-dialog-of{border-radius:12px;background:#eff9f2;padding:13px;text-align:center;font:900 25px/1.3 ui-monospace,SFMono-Regular,monospace;color:#0b6345;letter-spacing:1px}
#gs-confirm-closure p{color:#456351;font-size:15px;line-height:1.5;margin:14px 0 20px;overflow-wrap:anywhere}
#gs-confirm-closure .gs-dialog-buttons{display:grid;grid-template-columns:1fr;gap:8px}
#gs-confirm-closure .gs-dialog-buttons button{box-sizing:border-box;min-height:52px;width:100%;border-radius:11px;font-size:15px;font-weight:750;border:1px solid #cfded3;background:#f8faf8;color:#456451;padding:12px;cursor:pointer;touch-action:manipulation}
#gs-confirm-closure .gs-dialog-buttons button.confirm{background:#176b4b;border-color:#176b4b;color:white;font-size:16px;min-height:54px}
#gs-confirm-closure[data-action=remove] .gs-dialog-buttons button.confirm{background:#a13d35;border-color:#a13d35}
#gs-confirm-closure button:focus-visible{outline:3px solid #35a276;outline-offset:2px}
@media(max-width:430px){#gs-clientes-ui .gs-main{padding:12px}#gs-clientes-ui .gs-tools{grid-template-columns:1fr}#gs-clientes-ui .gs-order{gap:5px}#gs-clientes-ui .gs-orders{padding-left:7px}#gs-clientes-ui .gs-order-meta{gap:4px}}
@media(max-width:345px){#gs-clientes-ui .gs-main{padding:9px}#gs-clientes-ui .gs-of{font-size:14px}#gs-clientes-ui .gs-day{padding:7px}#gs-clientes-ui .gs-state{gap:3px}#gs-clientes-ui .gs-action{min-width:96px;padding:8px 7px;font-size:12px}#gs-clientes-ui .gs-order-actions{gap:1px}#gs-clientes-ui .gs-order-meta{column-gap:4px;row-gap:2px}#gs-confirm-closure .gs-dialog-body{padding:17px}}
`;document.head.append(s)
}
function mount(){
 const old=$('history-list')?.closest('.card');const historyView=$('view-history');
 if(!old||!historyView||$('gs-clientes-ui'))return;
 old.style.display='none';old.setAttribute('aria-hidden','true');
 css();
 const root=el('section');root.id='gs-clientes-ui';root.setAttribute('aria-label','Nómina operativa de clientes');
 const main=el('div','gs-main');
 const heading=el('div','gs-heading');
 const left=el('div');left.append(el('h2','', 'Nómina general'),el('p','gs-lead','Retiros agrupados por día y cliente.'));
 heading.append(left);main.append(heading);
 const stats=el('div','gs-stats');for(const [id,label,cls] of [['pending','pendientes',''],['archived','cerradas','archived']]){const box=el('div','gs-stat '+cls);const strong=el('strong','', '0');strong.id='gs-count-'+id;box.append(strong,el('span','',label));stats.append(box)}main.append(stats);
 const modes=el('div','gs-mode');modes.setAttribute('role','tablist');modes.setAttribute('aria-label','Estado de las órdenes');
 for(const [value,title] of [['pending','Por cerrar'],['archived','Archivo']]){const b=button('',title);b.dataset.mode=value;b.setAttribute('role','tab');b.setAttribute('aria-selected',String(mode===value));b.addEventListener('click',()=>{mode=value;page=PAGE_SIZE;dateFilter='all';render();});modes.append(b)}main.append(modes);
 const tools=el('div','gs-tools');const searchLabel=el('label','gs-field','Buscar cliente, RUT u O.F.');searchLabel.setAttribute('for','gs-order-search');const input=el('input');input.type='search';input.id='gs-order-search';input.placeholder='Nombre, RUT o número de O.F.';input.autocomplete='off';input.addEventListener('input',()=>{search=input.value.trim();collapsed.clear();page=PAGE_SIZE;render()});searchLabel.append(input);tools.append(searchLabel);
 const dateLabel=el('label','gs-field','Fecha de archivo');dateLabel.id='gs-date-label';dateLabel.setAttribute('for','gs-date-filter');const select=el('select');select.id='gs-date-filter';select.addEventListener('change',()=>{dateFilter=select.value;page=PAGE_SIZE;render()});dateLabel.append(select);tools.append(dateLabel);main.append(tools);
 const countLine=el('div','gs-countline');countLine.id='gs-count-line';main.append(countLine);
 const list=el('div','gs-list');list.id='gs-orders-list';main.append(list);const feedback=el('div');feedback.id='gs-rut-feedback';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');main.append(feedback);
 const more=button('gs-more','Ver más órdenes');more.id='gs-order-more';more.hidden=true;more.addEventListener('click',()=>{page+=PAGE_SIZE;render()});main.append(more);
 const foot=el('p','gs-foot','Cerrada = cierre administrativo confirmado. Las O.F. archivadas permanecen en Firebase; puedes reabrirlas si corresponde.');main.append(foot);root.append(main);
 historyView.insertBefore(root,old);
 const dialog=el('dialog');dialog.id='gs-confirm-closure';dialog.setAttribute('aria-labelledby','gs-dialog-title');dialog.setAttribute('aria-describedby','gs-dialog-desc');const body=el('div','gs-dialog-body');body.append(el('div','gs-dialog-pill','CONFIRMACIÓN REQUERIDA'));const title=el('h3');title.id='gs-dialog-title';body.append(title);const of=el('div','gs-dialog-of');of.id='gs-dialog-of';body.append(of);const description=el('p');description.id='gs-dialog-desc';body.append(description);const actions=el('div','gs-dialog-buttons');const cancel=button('','Cancelar');cancel.autofocus=true;const confirm=button('confirm','Confirmar cierre');confirm.id='gs-dialog-confirm';cancel.addEventListener('click',()=>dialog.close());confirm.addEventListener('click',commit);actions.append(confirm,cancel);body.append(actions);dialog.append(body);document.body.append(dialog);
 dialog.addEventListener('close',()=>{selection=null;if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});lastFocus=null});
 list.addEventListener('click',event=>{const b=event.target.closest('button[data-order-id]');if(!b)return;requestAction(b.dataset.orderId,b.dataset.of,b.dataset.action,b)});
 window.addEventListener('storage',e=>{if([HISTORY_KEY,STATUS_KEY,DATES_KEY].includes(e.key))scheduleRender()});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleRender()});
 window.addEventListener('focus',scheduleRender);
 $('tab-history')?.addEventListener('click',scheduleRender);
 $('finish')?.addEventListener('click',()=>setTimeout(scheduleRender,0));
 render();
}
function rows(){
 const closures=readClosures(),dates=readDates(),result=[];
 for(const entry of readHistory()){
  if(!entry||typeof entry.id!=='string'||!Array.isArray(entry.orders))continue;
  const client=String(entry.client||'').slice(0,80),at=Number(entry.at)||0,clientRef=readClientRef(entry.clientRef);
  for(const order of entry.orders){if(!validOF(order?.of))continue;
   const id=entry.id,of=String(order.of),key=closeKey(id,of),closed=closures[key]===true;
   const archivedAt=Number(dates[key]);
   const hasDate=Number.isFinite(archivedAt)&&archivedAt>0;
   result.push({id,of,client,clientRef,at,scannedAt:Number(order.at)||at,closed,archivedAt:hasDate?archivedAt:at,legacy:!hasDate});
  }
 }
 return result;
}
function updateDateSelect(source){
 const label=$('gs-date-label'),select=$('gs-date-filter');label.hidden=false;label.firstChild.textContent=mode==='pending'?'Fecha de retiro':'Fecha de archivo';
 const dates=[...new Map(source.map(r=>[dayKey(mode==='pending'?r.at:r.archivedAt),mode==='pending'?r.at:r.archivedAt])).entries()].sort((a,b)=>b[0].localeCompare(a[0]));
 if(dateFilter!=='all'&&!dates.some(([k])=>k===dateFilter))dateFilter='all';
 select.replaceChildren();const all=el('option','', 'Todas las fechas');all.value='all';select.append(all);
 for(const [dateKey,ts] of dates){const option=el('option','',dateFmt.format(new Date(ts)));option.value=dateKey;select.append(option)}
 select.value=dateFilter;
}
function addRow(parent,r){
 const row=el('div','gs-order '+(r.closed?'closed':'pending'));row.setAttribute('role','listitem');
 const info=el('div','gs-order-info');info.append(el('div','gs-of',r.of));
 const meta=r.closed?(r.legacy?'Cierre sin fecha':hourFmt.format(new Date(r.archivedAt))):hourFmt.format(new Date(r.scannedAt));
 const state=el('span','gs-state',r.closed?'Cerrada':'Pendiente');
 const details=el('div','gs-order-meta');details.append(state,el('span','gs-meta',meta));info.append(details);
 const action=button('gs-action'+(r.closed?' reopen':''));action.append(svgIcon(r.closed?'reopen':'close'),el('span','',r.closed?'Reabrir':'Cerrar OF'));
 action.dataset.action=r.closed?'reopen':'close';action.dataset.orderId=r.id;action.dataset.of=r.of;
 action.setAttribute('aria-label',(r.closed?'Reabrir':'Confirmar cierre de')+' O.F. '+r.of+' · '+r.client);action.title=r.closed?'Reabrir O.F.':'Confirmar cierre';
 const remove=button('gs-icon gs-remove');remove.append(svgIcon('remove'));remove.dataset.action='remove';remove.dataset.orderId=r.id;remove.dataset.of=r.of;remove.title='Eliminar O.F.';remove.setAttribute('aria-label','Eliminar O.F. '+r.of+' de '+r.client);
 const actions=el('div','gs-order-actions');actions.append(action,remove);row.append(info,actions);parent.append(row);
}
function addClient(parent,group){
 const section=el('section','gs-client-group');
 const toggle=button('gs-group-toggle');toggle.append(el('span','gs-group-name',group.client||'Cliente sin nombre'),el('span','gs-group-count',numFmt.format(group.rows.length)+' OF'),svgIcon('chevron'));
 const open=!collapsed.has(group.key);toggle.setAttribute('aria-expanded',String(open));
 section.append(toggle);
 const identity=el('div','gs-rut-line'+(group.ref?'':' missing'));
 if(group.ref){
  identity.append(el('span','gs-rut-number',group.ref.rut));
  const copy=button('gs-icon gs-copy');copy.append(svgIcon('copy'));copy.title='Copiar RUT';copy.setAttribute('aria-label','Copiar RUT '+group.ref.rut);copy.addEventListener('click',()=>void copyRut(group.ref.rut,copy));identity.append(copy);
 }else identity.textContent='Sin RUT registrado';
 section.append(identity);
 const orders=el('div','gs-orders');orders.setAttribute('role','list');orders.setAttribute('aria-label','Órdenes de '+group.client);orders.hidden=!open;
 for(const r of group.rows)addRow(orders,r);
 toggle.addEventListener('click',()=>{const closed=collapsed.has(group.key);if(closed)collapsed.delete(group.key);else collapsed.add(group.key);orders.hidden=!closed;toggle.setAttribute('aria-expanded',String(closed))});
 section.append(orders);parent.append(section);
}
function render(){
 const all=rows(),pending=all.filter(r=>!r.closed),archived=all.filter(r=>r.closed);
 $('gs-count-pending').textContent=numFmt.format(pending.length);
 $('gs-count-archived').textContent=numFmt.format(archived.length);
 for(const b of document.querySelectorAll('#gs-clientes-ui [data-mode]'))b.setAttribute('aria-selected',String(b.dataset.mode===mode));
 const source=mode==='pending'?pending:archived;updateDateSelect(source);
 const filtered=source.filter(r=>matchSearch(r,search)&&(dateFilter==='all'||dayKey(mode==='pending'?r.at:r.archivedAt)===dateFilter));
 // Mantener pendientes más antiguas primero; archivo ordenado por fecha de cierre.
 if(mode==='pending')filtered.sort((a,b)=>a.at-b.at||a.scannedAt-b.scannedAt||a.of.localeCompare(b.of));
 else filtered.sort((a,b)=>b.archivedAt-a.archivedAt||b.at-a.at||a.of.localeCompare(b.of));
 const countLine=$('gs-count-line');countLine.replaceChildren(el('strong','',mode==='pending'?'Por cerrar':'Archivo de órdenes cerradas'),el('span','',numFmt.format(filtered.length)+' O.F.'));
 const target=$('gs-orders-list');target.replaceChildren();let shown=0;
 if(!filtered.length){const empty=el('div','gs-empty');empty.append(el('strong','',mode==='pending'?'Sin pendientes':'Sin órdenes archivadas'),el('span','',source.length===0?(mode==='pending'?'Todo al día. Las órdenes cerradas están en el Archivo.':'Al confirmar una O.F. como cerrada, aparecerá aquí organizada por fecha.'):'Ninguna O.F. coincide con la búsqueda o fecha.'));target.append(empty)}
 else{
  // La paginación nunca parte una agrupación: el cliente conserva juntas todas sus O.F.
  for(const day of groupRows(filtered)){
   if(shown>=page)break;
   const section=el('section','gs-day-section'),header=el('div','gs-day');let dayShown=0,groupsShown=0;
   const caption=el('small');header.append(el('span','gs-day-title',headingDateFmt.format(new Date(day.at))),caption);section.append(header);
   if(day.legacy)section.append(el('p','gs-day-note','Fecha de retiro · cierre antiguo sin fecha registrada'));
   for(const group of day.groups.values()){
    if(shown>=page)break;
    addClient(section,group);shown+=group.rows.length;dayShown+=group.rows.length;groupsShown++;
   }
   caption.textContent=numFmt.format(dayShown)+(dayShown<day.total?' de '+numFmt.format(day.total):'')+' OF · '+numFmt.format(groupsShown)+' '+(groupsShown===1?'cliente':'clientes');
   target.append(section);
  }
 }
 const more=$('gs-order-more');more.hidden=filtered.length<=shown;if(!more.hidden)more.textContent='Ver más órdenes · '+numFmt.format(filtered.length-shown)+' restantes';
}
function scheduleRender(){if(renderQueued||!$('gs-clientes-ui'))return;renderQueued=true;requestAnimationFrame(()=>{renderQueued=false;render()})}
function requestAction(id,of,action,control){
 const row=rows().find(r=>r.id===id&&r.of===of);if(!row)return scheduleRender();
 if((action==='close'&&row.closed)||(action==='reopen'&&!row.closed))return scheduleRender();
 selection={id,of,action,client:row.client};lastFocus=control;
 const closing=action==='close',removing=action==='remove';
 $('gs-dialog-title').textContent=removing?'¿Eliminar esta O.F.?':closing?'¿Confirmar cierre en sistema?':'¿Reabrir esta orden?';$('gs-dialog-of').textContent=of;
 $('gs-dialog-desc').textContent=removing?'Cliente: '+row.client+'. Se eliminará esta O.F. de la nómina compartida en todos los dispositivos. No equivale a marcarla como cerrada y no se puede deshacer.':closing?'Cliente: '+row.client+'. Confirma solo después de completar el cierre en el sistema. La orden saldrá de Pendientes y pasará al Archivo por fecha.':'Cliente: '+row.client+'. La O.F. volverá a Pendientes en todos los dispositivos sincronizados.';
 $('gs-dialog-confirm').textContent=removing?'Eliminar OF':closing?'Confirmar cierre':'Confirmar reapertura';
 const dialog=$('gs-confirm-closure');dialog.dataset.action=action;if(typeof dialog.showModal==='function')dialog.showModal();else {if(window.confirm($('gs-dialog-title').textContent+'\nO.F. '+of)){commit()}else selection=null}
}
function commit(){
 if(!selection)return;
 const {id,of,action}=selection,closing=action==='close',removing=action==='remove',key=closeKey(id,of);
 const current=rows().find(r=>r.id===id&&r.of===of);
 if(!current || (!removing&&current.closed===closing)){$('gs-confirm-closure')?.close?.();scheduleRender();return}
 const statuses=readClosures(),dates=readDates();
 if(removing){
   // Borrar únicamente esta O.F. y conservar el resto del retiro.
   const next=readHistory().map(entry=>entry.id!==id?entry:{...entry,orders:entry.orders.filter(order=>String(order.of)!==of)}).filter(entry=>entry.orders.length);
   try{localStorage.setItem(HISTORY_KEY,JSON.stringify(next))}
   catch(error){alert('No se pudo eliminar la O.F. de la nómina local. No se enviará el cambio a Firebase.');return}
   delete statuses[key];delete dates[key];
 }else if(closing){statuses[key]=true;dates[key]=Date.now()}
 else{delete statuses[key];delete dates[key]}
 try{
  localStorage.setItem(DATES_KEY,JSON.stringify(dates));
  localStorage.setItem(STATUS_KEY,JSON.stringify(statuses));
 }catch(error){alert('No se pudo guardar completamente el cambio. Descarga un respaldo y revisa el almacenamiento.');console.warn('Gestark: estado',error);return}
 try{window.GestarkClientsCloud?.retry?.()}catch(error){console.warn('Gestark: sincronización pendiente',error)}
 try{window.dispatchEvent(new StorageEvent('storage',{key:STATUS_KEY,storageArea:localStorage,url:location.href}))}catch(_){}
 selection=null;$('gs-confirm-closure')?.close?.();scheduleRender();
}
function boot(){if($('gs-clientes-ui'))return;const view=$('view-history');if(!view)return;mount()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
