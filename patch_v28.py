from pathlib import Path
import re,json
D=Path(__file__).parent
p=D/'entregas-clientes.html';s=p.read_text()
a='<div class="history-toolbar"><div class="history-filter"><label for="history-date-filter">Filtrar nómina por fecha</label><select id="history-date-filter" aria-label="Seleccionar fecha del retiro"><option value="all">Todas las fechas</option><option value="today">Hoy</option></select></div><div class="history-total"><span>Órdenes registradas</span><strong id="history-count">0</strong></div></div>'
b='''<div class="history-toolbar">
        <div class="gestark-filter-grid">
          <div class="history-filter"><label for="history-date-filter">Fecha</label><select id="history-date-filter" aria-label="Filtrar por fecha del retiro"><option value="all">Todas las fechas</option><option value="today">Hoy</option></select></div>
          <div class="history-filter"><label for="history-state-filter">Cierre en sistema</label><select id="history-state-filter" aria-label="Filtrar por estado de cierre"><option value="all">Todos</option><option value="pending">Pendientes</option><option value="closed">Cerradas</option></select></div>
        </div>
        <div class="history-total"><span><strong id="history-pending-count">0</strong> pendientes · <strong id="history-closed-count">0</strong> cerradas</span><span><strong id="history-count">0</strong> O.F.</span></div>
      </div>'''
assert a in s
s=s.replace(a,b)
s=s.replace('Estado de cierre en sistema: todas las O.F. comienzan en «No entregado». Toca el estado para marcar «Entregado» cuando completes el cierre.','Las O.F. comienzan pendientes. Marca «Cerrada» solo después de completar su cierre en el sistema. Puedes deshacer el cambio.')
s=s.replace('<script src="./gestark-updates.js?v=2026.11.21.27"></script>','<script src="./gestark-updates.js?v=2026.11.21.28"></script>')
s=s.replace('./entregas-clientes.js?v=2026.11.21.27','./entregas-clientes.js?v=2026.11.21.28')
p.write_text(s)

p=D/'entregas-clientes.js';s=p.read_text();s=s.replace('2026.11.21.27','2026.11.21.28')
start=s.index('function renderHistory(){')
end=s.index('function newDraft(){',start)
old=s[start:end]
new='''function renderHistory(){
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
 $('history-pending-count').textContent=String(byDate.filter(item=>!closed(item)).length);
 $('history-closed-count').textContent=String(byDate.filter(closed).length);
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
  bottom.append(client,date);row.append(top,bottom);frag.append(row);
 }
 root.append(frag);
 $('history-more').hidden=filtered.length<=historyShow;
}
'''
assert 'filtered.sort((a,b)=>b.at-a.at' in old
s=s[:start]+new+s[end:]
s=s.replace("$('history-date-filter').addEventListener('change',()=>{historyShow=80;renderHistory()});", "$('history-date-filter').addEventListener('change',()=>{historyShow=80;renderHistory()});\n $('history-state-filter').addEventListener('change',()=>{historyShow=80;renderHistory()});")
p.write_text(s)

# Refresh version links in existing pages without disturbing business logic.
for filename in ['index.html','entregas-contingentes.html','notas-transferencias.html','repositorio.html','calendario.html','escaner.html','laboratorio.html']:
 p=D/filename;s=p.read_text();new_s=re.sub(r'(gestark-updates\\.js\\?v=)[0-9.]+',r'\\g<1>2026.11.21.28',s)
 # Escape pattern fixed below if no substitution from accidental escaped slash.
 if new_s==s:
  new_s=re.sub(r'(gestark-updates\.js\?v=)[0-9.]+',r'\g<1>2026.11.21.28',s)
 assert 'gestark-updates.js?v=2026.11.21.28' in new_s,filename
 p.write_text(new_s)

p=D/'gestark-version.json';j=json.loads(p.read_text());j['version']='2026.11.21.28';j['changes']='Rediseño operativo Gestark: marca verde consistente, pantallas más compactas, menú fijo unificado con acceso central destacado a Entregas clientes y control de cierre pendiente/cerrado con filtros de fecha y estado. Escáner, pagos y datos locales sin cambios.';j['clientsVersion']='2026.11.21.28';p.write_text(json.dumps(j,indent=2,ensure_ascii=False)+'\n')
p=D/'LEEME_REDISENO_GESTARK_2026.11.21.28.txt';p.write_text('''GESTARK · Actualización visual 2026.11.21.28

CAMBIOS
- Barra inferior consistente de cinco accesos: Inicio, Checklist, Clientes (central), Transferencias y Enlaces.
- «Clientes» usa un acceso elevado verde, directo a Entregas clientes.
- Actualizar continúa disponible como pequeño botón encima del extremo derecho de la barra.
- Pantalla Inicio más compacta, con la marca y los verdes originales.
- Nómina general: filtro desplegable por fecha y por estado; O.F. grandes; pendientes primero; estados Pendiente / Cerrada.
- Entregas contingentes y Transferencias: retoques visuales compactos sin alterar su funcionalidad.
- Sin cambios de base de datos, credenciales, cámara, API, pagos ni almacenamiento de datos.

INSTALACIÓN
1. Conservar el respaldo anterior: commit 806183ac51f54243bfc6d6fd2b99a519f6712933.
2. Descomprimir el ZIP.
3. Subir únicamente los archivos de actualización a la RAÍZ del repositorio GitHub, reemplazando sus homólogos.
4. Esperar la publicación en GitHub Pages y entrar a Gestark con conexión.
5. Pulsar «Actualizar» en la aplicación. Si el acceso fijo no cambia, cerrar y volver a abrir la PWA.

NOTAS
- El nuevo menú también aparece en Checklist porque esa página ya carga gestark-updates.js. No es necesario modificar su formulario.
- «Gestiones» y «Contingentes» se siguen abriendo desde Inicio; no se elimina ninguna funcionalidad.
- Los movimientos, nóminas y cierres guardados en localStorage se conservan; no se borran ni migran.
- El ZIP no actualiza GitHub automáticamente.
- Pruebas automatizadas en navegador; se recomienda prueba real en iPhone SE, especialmente safe-area, navegación y cámara.
''')
print('PATCH DONE',len(s))
