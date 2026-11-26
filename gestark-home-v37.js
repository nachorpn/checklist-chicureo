/* Gestark 37 · Inicio nativo. Mantiene el iframe de acceso y sus acciones reales. */
(()=>{
'use strict';
const icons={scan:'<path d="M3 8V3h5m8 0h5v5m0 8v5h-5m-8 0H3v-5M7 7v10m3-10v10m4-10v10m3-10v10"/>',wallet:'<rect x="3" y="5" width="18" height="15" rx="3"/><path d="M21 10h-5a2.5 2.5 0 0 0 0 5h5M16 12.5h.1"/>',check:'<rect x="5" y="5" width="14" height="16" rx="2"/><rect x="9" y="2" width="6" height="5" rx="1.5"/><path d="m8 13 2 2 5-5m-7 8h7"/>',alert:'<path d="m12 3 9 5v9l-9 5-9-5V8l9-5Zm-9 5 9 5 9-5m-9 5v9M8 5l8 4"/>',contact:'<rect x="4" y="3" width="16" height="18" rx="3"/><circle cx="12" cy="9" r="2.5"/><path d="M7.5 17c0-4 9-4 9 0M2 8h3m-3 7h3"/>',files:'<path d="M7 3h8l4 4v14H7zM15 3v5h4M4 6v13m6-7h6m-6 4h6"/>',folder:'<path d="M3 6h7l2 3h9v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',chat:'<path d="M21 11a9 9 0 0 1-9 9 9 9 0 0 1-4-.9L3 21l1.8-5A9 9 0 1 1 21 11Z"/><path d="M8 10h8m-8 4h5"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v5m10-5v5M3 10h18m-14 4h2m3 0h2m3 0h1"/>',bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12a2 2 0 0 0 4 0"/>',arrow:'<path d="M6 18 18 6M7 6h11v11"/>',lab:'<path d="M9 3h6m-5 0v6l-5.9 9.3A2 2 0 0 0 6 21h12a2 2 0 0 0 1.9-2.7L14 9V3M8 15h8"/>',bus:'<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 13h18M7 19v2m10-2v2M7 16h.1m10 0h.1M12 6v7"/>'};
const svg=k=>`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[k]}</svg>`;
const ops=[['clients','Entregas clientes','scan','#D9EADD','#347552','#254D36'],['transfers','Transferencias','wallet','#DBE8F2','#477A9B','#31546D'],['checklist','Checklist diario','check','#E9E3F3','#8070A6','#51446D'],['contingencias','Contingencias','alert','#F5E6D5','#A87942','#70512F']];
const tools=[['directorio','Directorio','contact','#DCEADF','#3E7351'],['cases','Gestiones','files','#DFE8F1','#527997'],['repositorio','Repositorio','folder','#EAE5D8','#83723F'],['collection','Cobranza','chat','#DDEDE7','#39806B'],['calendario','Calendario','calendar','#E8E1F1','#8470A0'],['notifications','Notificaciones','bell','#F2E7D6','#94703A']];
const css=`
html.gestark-v37-home,html.gestark-v37-home body{background:#f2f5f2!important;color:#25382e}
html.gestark-v37-home body{margin:0!important;padding:0!important;width:100%!important;max-width:100%!important;overflow-x:hidden!important}
html.gestark-v37-home #inicio{width:100%!important;max-width:100%!important;margin:0!important;padding:0!important;background:transparent!important}
html.gestark-v37-home #inicio>header,html.gestark-v37-home #inicio>main,html.gestark-v37-home #inicio>footer{display:none!important}
#gs37-home{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;width:100%;box-sizing:border-box;max-width:760px;margin:auto;padding:16px 14px 25px;color:#25382e;text-align:left;font-synthesis:none}
#gs37-home *,#gs37-home *::before,#gs37-home *::after{box-sizing:border-box}
#gs37-home button,#gs37-home a{font:inherit;text-decoration:none;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
#gs37-home button:focus-visible,#gs37-home a:focus-visible{outline:2px solid #397e60;outline-offset:2px}
#gs37-home svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round;flex:none}
#gs37-home .gs37-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 12px}
#gs37-home h1{font-size:26px;line-height:1.2;letter-spacing:-.8px;font-weight:650;margin:0;color:#25382e}
#gs37-home .gs37-date{font-size:11px;color:#61786a;text-align:right}
#gs37-home .gs37-summary{background:#245840;color:white;border-radius:15px;display:grid;grid-template-columns:.8fr 1.2fr;padding:12px 13px;margin-bottom:17px;gap:10px}
#gs37-home .gs37-metric{min-width:0;display:flex;flex-direction:column;justify-content:center;gap:4px}
#gs37-home .gs37-metric+.gs37-metric{border-left:1px solid #628773;padding-left:10px}
#gs37-home .gs37-metric small{font-size:11px;color:#d6e7dc;line-height:1.3}
#gs37-home .gs37-metric strong{font-size:25px;font-weight:650;letter-spacing:-.65px;line-height:1.15;font-variant-numeric:tabular-nums;color:white}
#gs37-home .gs37-metric em{font-size:10px;font-style:normal;color:#c1d8c9}
#gs37-home h2{font-size:15px;line-height:1.3;font-weight:650;margin:0 0 9px;color:#25382e;letter-spacing:-.15px}
#gs37-home .gs37-ops{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-bottom:17px}
#gs37-home .gs37-tile{border:0;text-align:left;border-radius:15px;background:var(--gs-bg);color:var(--gs-fg);min-height:94px;padding:10px;display:flex;flex-direction:column;justify-content:space-between;gap:9px;width:100%;min-width:0}
#gs37-home .gs37-tiletop{display:flex;align-items:center;justify-content:space-between;gap:4px}
#gs37-home .gs37-tileicon{width:38px;height:38px;border-radius:10px;display:grid;place-items:center;background:var(--gs-accent);color:white}
#gs37-home .gs37-arrow svg{width:15px;height:15px;opacity:.8}
#gs37-home .gs37-tile strong{font-size:13px;font-weight:650;line-height:1.25;overflow-wrap:anywhere}
#gs37-home .gs37-tools{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
#gs37-home .gs37-tool{border:1px solid #e5ebe5;background:white;min-height:76px;border-radius:12px;display:flex!important;flex-direction:column;justify-content:center;align-items:center;gap:7px;padding:8px 3px;color:#25382e;width:100%;min-width:0;text-align:center;box-shadow:none}
#gs37-home .gs37-toolicon{width:34px;height:34px;border-radius:10px;background:var(--gs-bg);color:var(--gs-fg);display:grid;place-items:center}
#gs37-home .gs37-toolicon svg{width:20px;height:20px}
#gs37-home .gs37-tool .gs37-label{font-size:11px;font-weight:550;line-height:1.15;text-align:center;overflow-wrap:anywhere}
#gs37-home button:active,#gs37-home a:active{filter:brightness(.96)}
@media(min-width:600px){#gs37-home{padding:20px 22px 30px}#gs37-home .gs37-ops{grid-template-columns:repeat(4,minmax(0,1fr))}#gs37-home .gs37-tools{grid-template-columns:repeat(6,minmax(0,1fr))}#gs37-home .gs37-tile{min-height:116px}}

`;
function update(d,status){const val=d?.getElementById('gs37-pending');if(!val)return;val.textContent=status?.ready&&Number.isSafeInteger(status.pending)&&status.pending>=0?String(status.pending):'—';val.title=status?.ready?'Órdenes pendientes de cierre':'Sin confirmación de sincronización';}
function date(d){const now=new Date();const a=d?.getElementById('gs37-date'),b=d?.getElementById('gs37-month');if(a)a.textContent=new Intl.DateTimeFormat('es-CL',{day:'numeric',month:'long',timeZone:'America/Santiago'}).format(now);if(b)b.textContent=new Intl.DateTimeFormat('es-CL',{month:'long',timeZone:'America/Santiago'}).format(now);}
function mount(d,user,actions){
 if(!d||!user?.uid||user.provider!=='firebase')return false;
 if(d.getElementById('gs37-home')){date(d);update(d,actions.status());return true;}
 const root=d.getElementById('inicio'),oldMain=root?.querySelector(':scope > main'),collection=d.getElementById('cobrar-whatsapp'),cases=oldMain?.querySelector('a.tool.gold');
 if(!root||!oldMain||!collection||!cases)return false; // mantener Inicio anterior si cambia el HTML
 const view=d.createElement('section');view.id='gs37-home';view.setAttribute('aria-label','Inicio');
 view.innerHTML='<div class="gs37-head"><h1>Inicio</h1><span class="gs37-date" id="gs37-date"></span></div><div class="gs37-summary" aria-label="Resumen operativo"><div class="gs37-metric"><small>OF por cerrar</small><strong id="gs37-pending" aria-live="polite">—</strong></div><div class="gs37-metric"><small>Venta acumulada · <span id="gs37-month"></span></small><strong>—</strong><em>Próximamente</em></div></div><h2>Operaciones</h2><div class="gs37-ops"></div><h2>Herramientas</h2><div class="gs37-tools"></div>';
 const make=(item,op)=>{const [key,label,icon,bg,accent,fg]=item;const b=key==='collection'?collection:key==='cases'?cases:d.createElement('button');b.className=op?'gs37-tile':'gs37-tool';b.removeAttribute('style');b.setAttribute('aria-label',label);if(b.tagName==='BUTTON')b.type='button';b.style.setProperty('--gs-bg',bg);b.style.setProperty('--gs-fg',op?fg:accent);if(op){b.style.setProperty('--gs-accent',accent);b.innerHTML=`<span class="gs37-tiletop"><span class="gs37-tileicon">${svg(icon)}</span><span class="gs37-arrow">${svg('arrow')}</span></span><strong>${label}</strong>`;}else b.innerHTML=`<span class="gs37-toolicon">${svg(icon)}</span><span class="gs37-label">${label}</span>`;
 if(key!=='collection'&&key!=='cases')b.addEventListener('click',()=>key==='notifications'?actions.notifications():actions.select(key));return b;};
 for(const item of ops)view.querySelector('.gs37-ops').append(make(item,true));
 const list=[...tools];if(user.role==='admin')list.push(['laboratorio','Laboratorio','lab','#E8E1F1','#8470A0']);if(user.username==='SCMN')list.push(['traslados','Traslados','bus','#DCEADF','#3E7351']);
 for(const item of list)view.querySelector('.gs37-tools').append(make(item,false));
 const style=d.createElement('style');style.id='gs37-home-css';style.textContent=css;d.head.append(style);root.insertBefore(view,oldMain);d.documentElement.classList.add('gestark-v37-home');date(d);update(d,actions.status());return true;
}
window.GestarkHome37={mount,update,date};
})();
