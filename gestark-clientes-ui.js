/* Gestark · Nómina operativa y archivo por fecha · v2026.11.22.16
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
const hourFmt=new Intl.DateTimeFormat('es-CL',{hour:'2-digit',minute:'2-digit',timeZone:TZ});
const dayFmt=new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:TZ});
const dayKey=t=>{const parts=dayFmt.formatToParts(new Date(t));const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return p.year+p.month+p.day;};
const validOF=v=>/^\d{9}$/.test(String(v||''));
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
#gs-clientes-ui{--gs-ink:#143e30;--gs-line:#dbe9df;--gs-green:#117852;--gs-soft:#edf8f1;color:var(--gs-ink);display:grid;gap:12px;padding-bottom:16px}
#gs-clientes-ui *{box-sizing:border-box}
#gs-clientes-ui .gs-main{background:#fff;border:1px solid var(--gs-line);border-radius:18px;padding:16px;box-shadow:0 4px 15px #122c1a08}
#gs-clientes-ui .gs-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
#gs-clientes-ui .gs-kicker{font-size:10px;letter-spacing:.11em;font-weight:900;color:#60917b;text-transform:uppercase}
#gs-clientes-ui h2{font-size:21px;letter-spacing:-.65px;margin:5px 0 4px;font-weight:880}
#gs-clientes-ui .gs-lead{margin:0;font-size:12px;color:#5e7668;line-height:1.4}
#gs-clientes-ui .gs-stats{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:16px 0 12px}
#gs-clientes-ui .gs-stat{border-radius:13px;border:1px solid #cee7d6;padding:12px 13px;background:#edf9f1}
#gs-clientes-ui .gs-stat.archived{background:#f6f8f6;border-color:#e1e7e1}
#gs-clientes-ui .gs-stat strong{font-size:28px;font-variant-numeric:tabular-nums;letter-spacing:-.8px;display:block;line-height:1.05;color:#117852}
#gs-clientes-ui .gs-stat.archived strong{color:#627a6d}
#gs-clientes-ui .gs-stat span{font-size:11px;font-weight:750;color:#577566}
#gs-clientes-ui .gs-mode{display:grid;grid-template-columns:1fr 1fr;gap:5px;padding:5px;border-radius:13px;background:#eef3ef;margin-top:5px}
#gs-clientes-ui .gs-mode button{border:0;border-radius:10px;min-height:44px;font-weight:850;font-size:12px;color:#547564;background:transparent;padding:8px}
#gs-clientes-ui .gs-mode button[aria-selected=true]{background:white;color:#117852;box-shadow:0 2px 9px #164e3020}
#gs-clientes-ui .gs-tools{margin-top:13px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:end}
#gs-clientes-ui .gs-field{display:grid;gap:5px;font-size:11px;font-weight:850;color:#426d58}
#gs-clientes-ui input,#gs-clientes-ui select{width:100%;border:1px solid #cfe2d6;outline-offset:2px;border-radius:11px;min-height:44px;padding:10px 12px;background:#fcfffd;color:#194734;font-size:14px;font-weight:650}
#gs-clientes-ui input::placeholder{color:#8a9f93;font-weight:500}
#gs-clientes-ui .gs-countline{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:16px 2px 10px;font-size:12px;color:#6b8274;font-weight:750}
#gs-clientes-ui .gs-countline strong{color:#125b40}
#gs-clientes-ui .gs-list{display:grid;gap:9px}
#gs-clientes-ui .gs-order{border:1px solid #dbe9df;background:#fff;border-radius:14px;padding:12px 13px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;box-shadow:0 2px 12px #14332608}
#gs-clientes-ui .gs-order.pending{border-left:5px solid #139567;padding-left:10px}
#gs-clientes-ui .gs-order.closed{background:#fcfdfc;border-left:4px solid #a8c2b1;padding-left:11px}
#gs-clientes-ui .gs-of{font:900 clamp(20px,4.3vw,26px)/1.12 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.35px;color:#0a533b;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
#gs-clientes-ui .gs-order.closed .gs-of{color:#536f5e;font-size:20px}
#gs-clientes-ui .gs-client{font-size:13px;font-weight:800;margin-top:6px;color:#204937;overflow-wrap:anywhere}
#gs-clientes-ui .gs-meta{font-size:10px;font-weight:600;color:#708778;margin-top:4px;line-height:1.5}
#gs-clientes-ui .gs-action{background:#0b8057;color:white;border:0;border-radius:10px;padding:11px 12px;min-height:47px;min-width:114px;font-size:12px;font-weight:850;box-shadow:0 2px 8px #0b805727;cursor:pointer;white-space:normal;text-align:center}
#gs-clientes-ui .gs-action.reopen{background:#edf5ee;color:#176047;box-shadow:none;border:1px solid #bfd9c9;min-width:87px}
#gs-clientes-ui .gs-order-actions{display:grid;gap:4px;justify-items:stretch}
#gs-clientes-ui .gs-remove{background:transparent;border:0;color:#9a5952;border-radius:8px;min-height:30px;font-size:11px;font-weight:750;cursor:pointer}
#gs-clientes-ui .gs-remove:focus-visible{outline:3px solid #b78e83;outline-offset:2px}
#gs-clientes-ui .gs-action:focus-visible{outline:3px solid #45b38c;outline-offset:2px}
#gs-clientes-ui .gs-day{margin:11px 0 3px;background:#eef5ef;border:1px solid #e1ebe3;color:#38654c;border-radius:10px;padding:9px 11px;font-weight:850;font-size:12px;display:flex;justify-content:space-between;gap:8px}
#gs-clientes-ui .gs-day:first-child{margin-top:0}
#gs-clientes-ui .gs-day small{font-size:10px;font-weight:650;color:#6c8473}
#gs-clientes-ui .gs-empty{padding:28px 15px;text-align:center;border:1px dashed #cbded1;border-radius:13px;background:#fbfefa;color:#6b8674;font-size:13px;line-height:1.5}
#gs-clientes-ui .gs-empty strong{display:block;font-size:16px;color:#2c664a;margin-bottom:5px}
#gs-clientes-ui .gs-more{border:1px solid #c9ded0;background:#f0f8f2;color:#176446;font-weight:850;border-radius:11px;min-height:44px;margin-top:9px;width:100%;font-size:12px;cursor:pointer}
#gs-clientes-ui .gs-foot{font-size:11px;color:#769080;line-height:1.5;margin:10px 2px 0}
#gs-confirm-closure{max-width:min(92vw,440px);width:100%;border:0;background:transparent;padding:0;max-height:85dvh;color:#173e2c}
#gs-confirm-closure::backdrop{background:rgba(3,30,18,.64);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}
#gs-confirm-closure .gs-dialog-body{border-radius:19px;padding:23px;background:white;box-shadow:0 15px 50px #00271d45;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
#gs-confirm-closure .gs-dialog-pill{font-size:11px;font-weight:850;color:#10704b;letter-spacing:.09em;text-transform:uppercase}
#gs-confirm-closure h3{font-size:21px;margin:9px 0;letter-spacing:-.5px}
#gs-confirm-closure .gs-dialog-of{border-radius:12px;background:#eff9f2;padding:13px;text-align:center;font:900 25px/1.3 ui-monospace,SFMono-Regular,monospace;color:#0b6345;letter-spacing:1px}
#gs-confirm-closure p{color:#536f5d;font-size:13px;line-height:1.55;margin:12px 0 18px}
#gs-confirm-closure .gs-dialog-buttons{display:grid;grid-template-columns:1fr 1fr;gap:8px}
#gs-confirm-closure .gs-dialog-buttons button{min-height:48px;border-radius:11px;font-size:13px;font-weight:850;border:1px solid #cfded3;background:#f8faf8;color:#456451;padding:9px;cursor:pointer}
#gs-confirm-closure .gs-dialog-buttons button.confirm{background:#0b8057;border-color:#0b8057;color:white}
@media(max-width:430px){#gs-clientes-ui .gs-main{padding:12px}#gs-clientes-ui .gs-tools{grid-template-columns:1fr}#gs-clientes-ui .gs-order{grid-template-columns:1fr;gap:10px}#gs-clientes-ui .gs-action{width:100%;min-height:43px}#gs-clientes-ui .gs-stats{margin-top:12px}}
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
 const left=el('div');left.append(el('div','gs-kicker','CONTROL DE ÓRDENES'),el('h2','', 'Nómina operativa'),el('p','gs-lead','Pendientes a la vista. Cerradas en el historial por fecha.'));
 heading.append(left);main.append(heading);
 const stats=el('div','gs-stats');for(const [id,label,cls] of [['pending','Pendientes',''],['archived','Cerradas · Historial','archived']]){const box=el('div','gs-stat '+cls);const strong=el('strong','', '0');strong.id='gs-count-'+id;box.append(strong,el('span','',label));stats.append(box)}main.append(stats);
 const modes=el('div','gs-mode');modes.setAttribute('role','tablist');modes.setAttribute('aria-label','Estado de las órdenes');
 for(const [value,title] of [['pending','Por cerrar'],['archived','Archivo por fecha']]){const b=button('',title);b.dataset.mode=value;b.setAttribute('role','tab');b.setAttribute('aria-selected',String(mode===value));b.addEventListener('click',()=>{mode=value;page=PAGE_SIZE;dateFilter='all';render();});modes.append(b)}main.append(modes);
 const tools=el('div','gs-tools');const searchLabel=el('label','gs-field','Buscar O.F. o cliente');searchLabel.setAttribute('for','gs-order-search');const input=el('input');input.type='search';input.id='gs-order-search';input.placeholder='Número de orden o cliente';input.autocomplete='off';input.addEventListener('input',()=>{search=input.value.trim().toLocaleLowerCase('es-CL');page=PAGE_SIZE;render()});searchLabel.append(input);tools.append(searchLabel);
 const dateLabel=el('label','gs-field','Fecha de archivo');dateLabel.id='gs-date-label';dateLabel.setAttribute('for','gs-date-filter');const select=el('select');select.id='gs-date-filter';select.addEventListener('change',()=>{dateFilter=select.value;page=PAGE_SIZE;render()});dateLabel.append(select);tools.append(dateLabel);main.append(tools);
 const countLine=el('div','gs-countline');countLine.id='gs-count-line';main.append(countLine);
 const list=el('div','gs-list');list.id='gs-orders-list';list.setAttribute('role','list');main.append(list);
 const more=button('gs-more','Ver más órdenes');more.id='gs-order-more';more.hidden=true;more.addEventListener('click',()=>{page+=PAGE_SIZE;render()});main.append(more);
 const foot=el('p','gs-foot','Cerrada = cierre administrativo confirmado. Las O.F. archivadas permanecen en Firebase; puedes reabrirlas si corresponde.');main.append(foot);root.append(main);
 historyView.insertBefore(root,old);
 const dialog=el('dialog');dialog.id='gs-confirm-closure';dialog.setAttribute('aria-labelledby','gs-dialog-title');const body=el('div','gs-dialog-body');body.append(el('div','gs-dialog-pill','CONFIRMACIÓN REQUERIDA'));const title=el('h3');title.id='gs-dialog-title';body.append(title);const of=el('div','gs-dialog-of');of.id='gs-dialog-of';body.append(of);const description=el('p');description.id='gs-dialog-desc';body.append(description);const actions=el('div','gs-dialog-buttons');const cancel=button('','Cancelar');const confirm=button('confirm','Sí, marcar cerrada');confirm.id='gs-dialog-confirm';cancel.addEventListener('click',()=>dialog.close());confirm.addEventListener('click',commit);actions.append(cancel,confirm);body.append(actions);dialog.append(body);document.body.append(dialog);
 dialog.addEventListener('close',()=>{selection=null;if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});lastFocus=null});
 list.addEventListener('click',event=>{const b=event.target.closest('button[data-order-id]');if(!b)return;requestAction(b.dataset.orderId,b.dataset.of,b.dataset.action,b)});
 window.addEventListener('storage',e=>{if([HISTORY_KEY,STATUS_KEY,DATES_KEY].includes(e.key))scheduleRender()});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleRender()});
 window.addEventListener('focus',scheduleRender);
 $('tab-history')?.addEventListener('click',scheduleRender);
 render();
}
function rows(){
 const closures=readClosures(),dates=readDates(),result=[];
 for(const entry of readHistory()){
  if(!entry||typeof entry.id!=='string'||!Array.isArray(entry.orders))continue;
  const client=String(entry.client||'').slice(0,80),at=Number(entry.at)||0;
  for(const order of entry.orders){if(!validOF(order?.of))continue;
   const id=entry.id,of=String(order.of),key=closeKey(id,of),closed=closures[key]===true;
   const archivedAt=Number(dates[key]);
   const hasDate=Number.isFinite(archivedAt)&&archivedAt>0;
   result.push({id,of,client,at,scannedAt:Number(order.at)||at,closed,archivedAt:hasDate?archivedAt:at,legacy:!hasDate});
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
 const card=el('article','gs-order '+(r.closed?'closed':'pending'));card.setAttribute('role','listitem');
 const info=el('div');info.append(el('div','gs-of',r.of),el('div','gs-client',r.client));
 const m=r.closed?(r.legacy?'Retiro: '+dateFmt.format(new Date(r.at))+' · fecha de cierre no registrada':'Cerrada: '+dateFmt.format(new Date(r.archivedAt))+' · '+hourFmt.format(new Date(r.archivedAt))):'Retiro: '+dateFmt.format(new Date(r.at))+' · '+hourFmt.format(new Date(r.at));
 info.append(el('div','gs-meta',m));const action=button('gs-action'+(r.closed?' reopen':''),r.closed?'↶ Reabrir':'✓ Confirmar cerrada');
 action.dataset.action=r.closed?'reopen':'close';action.dataset.orderId=r.id;action.dataset.of=r.of;
 action.setAttribute('aria-label',(r.closed?'Reabrir':'Confirmar cierre de')+' O.F. '+r.of+' · '+r.client);
 const actions=el('div','gs-order-actions');actions.append(action);const remove=button('gs-remove','Eliminar O.F.');remove.dataset.action='remove';remove.dataset.orderId=r.id;remove.dataset.of=r.of;remove.setAttribute('aria-label','Eliminar O.F. '+r.of+' de '+r.client);actions.append(remove);card.append(info,actions);parent.append(card);
}
function render(){
 const all=rows(),pending=all.filter(r=>!r.closed),archived=all.filter(r=>r.closed);
 $('gs-count-pending').textContent=numFmt.format(pending.length);
 $('gs-count-archived').textContent=numFmt.format(archived.length);
 for(const b of document.querySelectorAll('#gs-clientes-ui [data-mode]')){b.setAttribute('aria-selected',String(b.dataset.mode===mode))}
 const source=mode==='pending'?pending:archived;
 updateDateSelect(source);
 let filtered=source.filter(r=>(!search || r.of.includes(search)||r.client.toLocaleLowerCase('es-CL').includes(search)) && (dateFilter==='all'||dayKey(mode==='pending'?r.at:r.archivedAt)===dateFilter));
 // La prioridad operativa es despachar primero las órdenes pendientes más antiguas.
 if(mode==='pending')filtered.sort((a,b)=>a.at-b.at||a.scannedAt-b.scannedAt||a.of.localeCompare(b.of));
 else filtered.sort((a,b)=>b.archivedAt-a.archivedAt||b.at-a.at||a.of.localeCompare(b.of));
 const countLine=$('gs-count-line');countLine.replaceChildren(el('strong','',mode==='pending'?'Órdenes pendientes':'Archivo de órdenes cerradas'),el('span','',numFmt.format(filtered.length)+' O.F.'));
 const target=$('gs-orders-list');target.replaceChildren();const slice=filtered.slice(0,page);
 if(!filtered.length){const empty=el('div','gs-empty');empty.append(el('strong','',mode==='pending'?'Sin pendientes':'Sin órdenes archivadas'),el('span','',source.length===0?(mode==='pending'?'Todo al día. Las órdenes cerradas están en el Archivo por fecha.':'Al confirmar una O.F. como cerrada, aparecerá aquí organizada por fecha.'):'Ninguna O.F. coincide con la búsqueda o fecha.'));target.append(empty)}
 else if(mode==='pending'){const frag=document.createDocumentFragment();for(const r of slice)addRow(frag,r);target.append(frag)}
 else {let group='',container=null;for(const r of slice){const key=(r.legacy?'legacy:':'closed:')+dayKey(r.archivedAt);if(key!==group){group=key;const header=el('div','gs-day');header.append(el('span','',dateFmt.format(new Date(r.archivedAt))),el('small','',r.legacy?'Fecha retiro · cierre antiguo':'Fecha de cierre'));target.append(header);container=el('div','gs-list');target.append(container)}addRow(container,r)}}
 const more=$('gs-order-more');more.hidden=filtered.length<=page;if(!more.hidden)more.textContent='Ver más órdenes · '+numFmt.format(filtered.length-page)+' restantes';
}
function scheduleRender(){if(renderQueued||!$('gs-clientes-ui'))return;renderQueued=true;requestAnimationFrame(()=>{renderQueued=false;render()})}
function requestAction(id,of,action,control){
 const row=rows().find(r=>r.id===id&&r.of===of);if(!row)return scheduleRender();
 if((action==='close'&&row.closed)||(action==='reopen'&&!row.closed))return scheduleRender();
 selection={id,of,action,client:row.client};lastFocus=control;
 const closing=action==='close',removing=action==='remove';
 $('gs-dialog-title').textContent=removing?'¿Eliminar esta O.F.?':closing?'¿Confirmar cierre en sistema?':'¿Reabrir esta orden?';$('gs-dialog-of').textContent=of;
 $('gs-dialog-desc').textContent=removing?'Cliente: '+row.client+'. Se eliminará esta O.F. de la nómina compartida en todos los dispositivos. No equivale a marcarla como cerrada y no se puede deshacer.':closing?'Cliente: '+row.client+'. Confirma solo después de completar el cierre en el sistema. La orden saldrá de Pendientes y pasará al Archivo por fecha.':'Cliente: '+row.client+'. La O.F. volverá a Pendientes en todos los dispositivos sincronizados.';
 $('gs-dialog-confirm').textContent=removing?'Sí, eliminar O.F.':closing?'Sí, marcar cerrada':'Sí, reabrir';
 const dialog=$('gs-confirm-closure');if(typeof dialog.showModal==='function')dialog.showModal();else {if(window.confirm($('gs-dialog-title').textContent+'\nO.F. '+of)){commit()}else selection=null}
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
