/* Gestark · instalador PWA 2026.11.23.30.
 * El contenedor nativo registra el Service Worker una sola vez.
 * Los módulos abiertos dentro de iframes NO lo registran nuevamente.
 */
(() => {
 'use strict';
 const VERSION='2026.11.25.36';
 const appBase=new URL('./',document.currentScript?.src||location.href);
 // v29: predictor opcional. No altera los formularios ni exige un cliente del Directorio.
 // Cargar solamente en Entregas y Transferencias tras la autorizacion Firebase.
 if(/(?:\/entregas-clientes|\/notas-transferencias)\.html$/.test(location.pathname)){
   const loadAutocomplete=()=>{
     if(window.__gestarkAutocompleteRequested || !window.GestarkAuth?.getUser?.()?.uid)return;
     window.__gestarkAutocompleteRequested=true;
     const script=document.createElement('script');
     script.src='./gestark-client-autocomplete.js?v=2026.11.23.29';
     script.async=true;
     script.onerror=()=>{window.__gestarkAutocompleteRequested=false;console.warn('Gestark: sugerencias no disponibles. El campo manual sigue funcionando.')};
     document.head.append(script);
   };
   document.addEventListener('gestark:ready',loadAutocomplete);
   if(window.GestarkAuth?.getUser?.()?.uid)loadAutocomplete();
 }
 // Activar la sincronización de Entregas clientes después de validar Firebase.
 // Compatible con la pestaña nativa (iframe) y el acceso clásico directo.
 if(location.pathname.endsWith('/entregas-clientes.html')){
   const loadClientsCloud=()=>{
     if(window.__gestarkClientsCloudRequested || !window.GestarkAuth?.getUser?.()?.uid)return;
     window.__gestarkClientsCloudRequested=true;
     const script=document.createElement('script');
     script.src='./gestark-clientes-cloud.js?v=2026.11.23.29';
     script.async=true;
     script.onerror=()=>{
       window.__gestarkClientsCloudRequested=false;
       const notice=document.createElement('p');
       notice.setAttribute('role','alert');
       notice.style.cssText='margin:12px;padding:12px;border-radius:10px;background:#fff2e3;color:#80501b;font:700 12px system-ui';
       notice.textContent='No se pudo cargar la sincronización de Entregas clientes. Los registros se guardan únicamente en este dispositivo. Actualiza e inténtalo otra vez.';
       (document.getElementById('workspace')||document.body).prepend(notice);
     };
     document.head.append(script);
   };
   // Interfaz operativa: sólo se carga al autenticar Clientes. Funciona tanto
   // en el navegador como dentro de la PWA; no interfiere con el escáner.
   const loadClientsUi=()=>{
     if(window.__gestarkClientsUiRequested || !window.GestarkAuth?.getUser?.()?.uid)return;
     window.__gestarkClientsUiRequested=true;
     const script=document.createElement('script');
     script.src='./gestark-clientes-ui.js?v=2026.11.23.30';
     script.async=true;
     script.onerror=()=>{window.__gestarkClientsUiRequested=false;console.warn('Gestark: vista de archivo no disponible; se conserva la nómina anterior.')};
     document.head.append(script);
   };
   // v24: espejo de borradores de escaneo. Se inicializa tras autenticación,
   // y protege también el acceso clásico fuera del contenedor nativo.
   const loadDraftSafety=()=>{
     if(window.__gestarkDraftSafetyRequested || !window.GestarkAuth?.getUser?.()?.uid)return;
     window.__gestarkDraftSafetyRequested=true;
     const script=document.createElement('script');
     script.src='./gestark-retire-draft.js?v=2026.11.23.29';
     script.async=true;
     script.onerror=()=>{
       window.__gestarkDraftSafetyRequested=false;
       const warning=document.createElement('p');
       warning.setAttribute('role','alert');
       warning.style.cssText='padding:11px;background:#fff2e5;color:#834325;border-radius:10px;font:700 12px system-ui;margin:12px';
       warning.textContent='Sin respaldo de borradores en la nube. Conserva la pantalla y revisa la conexión.';
       (document.getElementById('workspace')||document.body).prepend(warning);
     };
     document.head.append(script);
   };
   document.addEventListener('gestark:ready',loadDraftSafety);
   if(window.GestarkAuth?.getUser?.()?.uid)loadDraftSafety();
   document.addEventListener('gestark:ready',loadClientsCloud);
   document.addEventListener('gestark:ready',loadClientsUi);
   if(window.GestarkAuth?.getUser?.()?.uid){loadClientsCloud();loadClientsUi()}

 }
 const embedded=(()=>{try{return window.parent!==window && window.parent.location.origin===location.origin && window.parent.location.pathname.endsWith('/gestark-app.html')}catch(_){return false}})();
 if(embedded)return;
 const isStandalone=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
 const isHome=()=>location.pathname===appBase.pathname||location.pathname===appBase.pathname+'index.html';
 const onIOS=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 let deferredPrompt=null;
 if('serviceWorker' in navigator){
   window.addEventListener('load',()=>{
     // No forzar reg.update() en cada página clásica: el navegador lo comprueba
     // periódicamente y el shell nativo ya comprueba las versiones nuevas.
     navigator.serviceWorker.register(new URL('gestark-sw.js?v='+VERSION,appBase),{scope:appBase.pathname})
       .catch(err=>console.info('Gestark: sin modo offline.',err));
   },{once:true});
 }
 const style=document.createElement('style');
 style.textContent=`
   .gs-install-cta{display:inline-flex;gap:8px;align-items:center;justify-content:center;border:1px solid #d8e7de;padding:10px 14px;border-radius:12px;background:#fff;color:#146247;font:700 13px system-ui,sans-serif;min-height:42px;box-shadow:0 3px 12px #133a2d10;margin:12px 0 0;cursor:pointer}
   .gs-install-cta svg{width:17px;height:17px;stroke:currentColor;stroke-width:2;fill:none}
   .gs-install-dialog{position:fixed;inset:0;background:#102a23b5;z-index:9999;display:flex;align-items:center;justify-content:center;padding:18px}
   .gs-install-panel{width:min(100%,390px);background:#fff;color:#193d31;border-radius:20px;padding:22px;box-shadow:0 18px 60px #102a2350;font:14px/1.5 system-ui,sans-serif}
   .gs-install-panel h2{font-size:20px;line-height:1.2;margin:0 0 8px}
   .gs-install-panel p{color:#486055;margin:0 0 14px}
   .gs-install-panel ol{padding-left:21px;margin:0 0 18px}
   .gs-install-panel li{margin-bottom:7px}
   .gs-install-panel button{font:700 14px system-ui,sans-serif;padding:11px 15px;border-radius:11px;border:0;background:#176c47;color:#fff;width:100%}
 `;
 document.head.appendChild(style);
 window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;showButton()});
 window.addEventListener('appinstalled',()=>document.getElementById('gs-install')?.remove());
 function modal(){
   const cover=document.createElement('div');cover.className='gs-install-dialog';cover.role='dialog';cover.setAttribute('aria-modal','true');
   const panel=document.createElement('div');panel.className='gs-install-panel';
   const title=document.createElement('h2');title.textContent='Instalar Gestark';
   const help=document.createElement('p');help.textContent='Así podrás abrir Gestark desde su ícono, sin la barra del navegador.';
   const steps=document.createElement('ol');
   const instructions=onIOS()?[
     'Abre Gestark desde Safari.',
     'Toca Compartir (el ícono del cuadrado con flecha).',
     'Selecciona «Agregar a pantalla de inicio» y confirma.'
   ]:[
     'Abre Gestark desde Chrome o Edge.',
     'Toca el menú del navegador.',
     'Selecciona «Instalar aplicación» o «Agregar a pantalla de inicio».'
   ];
   for(const item of instructions){const li=document.createElement('li');li.textContent=item;steps.append(li)}
   const close=document.createElement('button');close.type='button';close.textContent='Entendido';close.addEventListener('click',()=>cover.remove());
   panel.append(title,help,steps,close);cover.append(panel);
   cover.addEventListener('click',e=>{if(e.target===cover)cover.remove()});
   document.body.append(cover);close.focus();
 }
 function showButton(){
   if(isStandalone()||!isHome()||document.getElementById('gs-install'))return;
   const host=document.querySelector('main')||document.querySelector('.app')||document.body;
   const btn=document.createElement('button');btn.type='button';btn.id='gs-install';btn.className='gs-install-cta';btn.textContent='▣  Instalar Gestark';
   btn.addEventListener('click',async()=>{
     if(deferredPrompt){
       const prompt=deferredPrompt;deferredPrompt=null;
       try{await prompt.prompt();const choice=await prompt.userChoice;if(choice?.outcome==='accepted')btn.remove()}
       catch(_){modal()}
     }else modal();
   });
   host.append(btn);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',showButton,{once:true});
 else showButton();
})();

// v36: edición de textos de interfaz. Solo frases estáticas conocidas por página.
// No altera formularios, valores, eventos, almacenamiento, permisos ni mensajes al cliente.
(() => {
 'use strict';
 const page=location.pathname.split('/').pop()||'index.html';
 const copies={
  'index.html':{
   'Tu espacio de trabajo':null,
   'Accede al checklist, los enlaces de agencia, gestiones y WhatsApp desde un solo lugar.':null,
   'Mis transferencias':'Transferencias',
   'Anota nombre y monto, copia a Excel o envía la lista por WhatsApp.':'Registro de pagos',
   'Escaneo continuo, nómina general y compartir imagen.':'Escaneo y nómina',
   'Escanea la O.F., valida la recepción y registra una entrega pendiente de regularizar.':'Registro de contingencias',
   'Escanear etiquetas y comprobantes, revisar datos y probar firma.':'Entorno de pruebas',
   'Checklist Chicureo':'Checklist',
   'Actividades, OF, ventas y reporte por WhatsApp.':'Control diario',
   'Repositorio de Links':'Repositorio',
   'Agua, inventario, transferencias y enlaces útiles.':'Enlaces y formularios',
   'Ingresa al formulario de Microsoft Forms para registrar gestiones.':'Registro de casos',
   'Prepara la imagen de recordatorio para compartir por WhatsApp.':'Aviso de cobro',
   'Compartir aviso en un toque':null,
   'Registro de traslados':'Traslados',
   'Marca ida, regreso o ambos trayectos para el control de viajes.':'Control de viajes',
   'Checklist y Repositorio funcionan dentro de Gestark. Gestiones se abre en Microsoft Forms; Cobrar transferencias abre el menú para enviar la imagen por WhatsApp.':null,
   'Si tu navegador no permite compartir la imagen directamente, guárdala y adjúntala desde WhatsApp.':'Si no puedes compartir, guarda la imagen y envíala por WhatsApp.'
  },
  'checklist.html':{
   'Operaciones':null,
   'Registra nuevos clientes solo cuando corresponda.':null,
   'Los clientes registrados siguen guardados. Selecciona «Sí» para verlos.':'Selecciona «Sí» para ver los clientes guardados.',
   'Aún no hay clientes registrados en esta fecha.':'Sin clientes registrados hoy.',
   'Las primeras ocho actividades se marcan automáticamente; las publicaciones de Instagram se completan con los botones + y − al llegar a 3 y 2 historias, respectivamente. El registro de clientes se despliega con «Sí» y se contrae con «No» sin borrar los nombres. En el PNG solo aparece si hay clientes registrados. «Limpiar día» deja la pantalla sin marcas hasta que vuelvas a entrar. Las OF, la venta y los clientes se guardan por fecha: se conservan si actualizas durante el mismo día y comienzan vacíos al cambiar de día.':'Las primeras ocho actividades se marcan automáticamente. Usa + y − para las historias (3 y 2). «No» oculta los clientes sin borrarlos; solo se incluyen en la imagen si hay registros. «Limpiar día» desmarca las actividades hasta volver a entrar. Los datos se guardan por fecha.'
  },
  'entregas-clientes.html':{
   'RETIRO RÁPIDO':null,
   'Escanea las órdenes consecutivamente, sin cerrar la cámara.':'Registro de retiros',
   'Escribe el nombre del cliente y abre la cámara una sola vez.':'Ingresa el cliente para escanear.',
   'Escanea la primera etiqueta. La nómina se actualizará sola.':'Escanea o ingresa una O.F.',
   'Al finalizar, las órdenes quedan registradas en la nómina general. La imagen se prepara para compartir por WhatsApp u otra aplicación.':'Al finalizar, se registra el retiro y se prepara el comprobante.',
   'Las O.F. comienzan pendientes. Marca «Cerrada» después de su cierre en el sistema. «Eliminar» quita solo la O.F. seleccionada, con confirmación.':'Cierra cada O.F. después de registrarla en el sistema. Eliminar quita solo la orden seleccionada.',
   'Nómina guardada en este dispositivo; la conexión entre teléfonos quedará para la base de datos compartida.':null,
   'Si no aparece el menú para compartir, guarda la imagen y envíala desde WhatsApp.':'Si no puedes compartir, guarda la imagen y envíala por WhatsApp.'
  },
  'notas-transferencias.html':{
   'Gestark · Control diario':null,
   'Aún no hay transferencias para mostrar.':'Sin transferencias.',
   'Copia Nombre, Monto y Sí/No. En Excel Online selecciona una celda vacía y toca Pegar. iPhone puede redirigir el enlace de Microsoft a su aplicación.':'Copia los registros y pégalos en una celda vacía de Excel.',
   'Registros guardados en este dispositivo. Verifica los comprobantes de pago.':'Verifica los comprobantes de pago.',
   'Transferencias sincronizadas con Firebase. El efectivo permanece en este dispositivo. Verifica los comprobantes de pago.':'Transferencias compartidas. Efectivo guardado en este dispositivo. Verifica los pagos.'
  },
  'repositorio.html':{
   'AGENCIA CHICUREO':null,
   'Repositorio de Links':'Repositorio',
   'Accesos rápidos, instrucciones y datos de uso frecuente.':'Recursos de trabajo',
   '6 accesos disponibles · Toca «Abrir enlace» para acceder al sistema.':null,
   'Culligan · Pedido de bidones':'Culligan',
   'Microsoft Forms · Registro de inventario':'Microsoft Forms',
   'Planilla compartida · Microsoft Excel':'Planilla compartida',
   'SharePoint · Archivo Excel':'Planilla de gestiones',
   'Microsoft Forms · Solicitud de insumos':'Microsoft Forms',
   'El formulario se abrirá fuera de Gestark cuando el sistema lo permita. Si tu teléfono lo abre dentro, toca «Copiar enlace» y pégalo en Safari o Chrome.':'Si el formulario no abre correctamente, copia el enlace y ábrelo en el navegador.',
   'Pulsa «Copiar» junto a cada dato y pégalo en el campo correspondiente del formulario de Culligan.':'Copia los datos al formulario Culligan.',
   '«Probar app Excel» es opcional: úsalo solo si Excel se abre normalmente al tocar su icono. Si permanece detenido en el logo, cierra Excel, ábrelo desde su icono y comprueba que tu cuenta esté iniciada.':'Si Excel no abre, reinicia la aplicación y comprueba tu sesión.'
  },
  'entregas-contingentes.html':{
   'Registro interno de entregas físicas durante una interrupción del sistema':'Registro de contingencias',
   'Ingreso manual. La lectura automática de datos quedará para la segunda fase.':'Ingresa los datos del receptor.',
   'El correo se utilizará para un futuro envío del documento tributario. Es obligatorio si solicitas factura; por ahora no se envían correos desde Gestark.':'Correo obligatorio para factura. Gestark no envía correos.',
   'Completar solo cuando el cliente necesite factura.':'Solo si solicita factura.',
   'Estos datos se registran para emitir el documento tributario posteriormente. Gestark no emite facturas ni envía correos automáticamente.':'Datos para facturar posteriormente. No se emiten documentos automáticamente.',
   'La imagen se conserva solo en este dispositivo hasta habilitar almacenamiento central protegido. Una fotografía no confirma que el depósito esté abonado.':'Foto guardada en este dispositivo. Verifica que el depósito esté abonado.',
   'Hoja A4 con tres comprobantes por página. Puedes confirmar varias entregas y descargarlas juntas.':'PDF A4 · Tres comprobantes por página.',
   'La cola de impresión se mantiene solo durante esta sesión. Con base central conectada, podrás volver a preparar un comprobante autorizado desde el historial.':'Descarga los comprobantes antes de cerrar la sesión. Si están sincronizados, puedes recuperarlos del historial autorizado.',
   'El listado muestra O.F., fecha, operador, motivo y estado. Con base central configurada, los datos del receptor y la firma quedan protegidos y pueden recuperarse con autorización.':'Consulta las entregas pendientes de regularizar.',
   'Listado interno de O.F. entregadas que aún deben cerrarse en el sistema al finalizar la contingencia.':'O.F. pendientes de cierre.',
   'Origen: este dispositivo. No se incluyen registros de otros teléfonos hasta activar sincronización central.':'Origen: este dispositivo. No incluye otros equipos sin sincronización.',
   'El informe no cambia el estado de las órdenes. Márcalas «Regularizada» solamente después de cerrarlas en el sistema correspondiente.':'El informe no cierra órdenes. Regularízalas después del cierre en el sistema.',
   'La base central requiere configuración y usuarios autorizados. No se envían datos mientras esté desactivada.':'Sincronización solo si está habilitada y autorizada.'
  },
  'calendario.html':{
   'Domingos y feriados nacionales en rojo · Calendario Chile 2026–2027':'Domingos y feriados en rojo.'
  },
  'traslados.html':{
   'Registro de traslados':'Traslados',
   'Marca los viajes realizados en transporte compartido.':'Registro de viajes',
   'Completa el formulario directamente aquí. Si Microsoft Forms impide mostrarlo dentro de Gestark o solicita iniciar sesión, utiliza la opción alternativa.':'Si el formulario no carga, ábrelo en el navegador.'
  },
  'admin.html':{
   'Administración Firebase':'Administración',
   'Cuentas y permisos centralizados':'Usuarios y permisos',
   'Durante esta transición, la creación de cuentas, los restablecimientos y las bajas se hacen desde las consolas oficiales. No se pueden crear usuarios seguros de Authentication directamente desde una página pública de GitHub Pages sin un servicio administrativo protegido.':'Crea, restablece y desactiva cuentas desde las consolas oficiales. La gestión directa requiere un servicio administrativo protegido.',
   'Esta pantalla es transitoria. La futura administración dentro de Gestark necesitará un servicio confiable que compruebe el rol de administrador antes de crear, modificar o desactivar cuentas.':null
  },
  'laboratorio.html':{
   'Lector inteligente de etiquetas y comprobantes de entrega':'Entorno de pruebas',
   'Lectura HD por regiones con diagnóstico y respaldo automático. Una sola O.F. por comprobante.':'Lectura HD · Una O.F. por comprobante.',
   'Fotografía de la etiqueta o del comprobante. OCR opcional, más lento que el escáner.':'Fotografía la etiqueta para leer sus datos (OCR opcional).',
   'Corrige cualquier lectura antes de generar una constancia de prueba.':'Revisa y corrige los datos.',
   'El receptor puede firmar con el dedo. No certifica identidad.':'Firma de prueba. No certifica identidad.',
   'Se genera localmente, con datos revisados y firma opcional.':'Constancia local con firma opcional.'
  },
  'escaner.html':{
   'Escanea, guarda y copia los códigos de tus encomiendas.':'Lectura de códigos',
   'Apunta al código de barras o QR. Se guarda automáticamente al detectarlo.':'Enfoca el código. Se guarda automáticamente.',
   'Útil para etiquetas dañadas o cuando no haya cámara.':null,
   'Cada código se copia en una línea, listo para pegar en Excel o WhatsApp. La lista no se borra automáticamente.':'Copia un código por línea. La lista no se borra automáticamente.'
  }
 };
 const map=copies[page];if(!map)return;
 const norm=s=>s.replace(/\s+/g,' ').trim();
 function apply(el){
   // No sobrescribir controles, contenido editable ni nodos con datos introducidos por el usuario.
   if(el.closest('[contenteditable="true"],textarea,input,select,option')||el.querySelector('input,button,select,textarea,a,form,svg,[contenteditable="true"]'))return;
   if(el.children.length&&[...el.children].some(x=>!['STRONG','B','EM','CODE'].includes(x.tagName)))return;
   const original=norm(el.textContent||'');if(!Object.prototype.hasOwnProperty.call(map,original))return;
   const next=map[original];if(next===null){el.hidden=true;el.style.setProperty('display','none','important');}else if(el.textContent!==next)el.textContent=next;
 }
 function init(){
   document.querySelectorAll('h1,h2,h3,p,small,span,div').forEach(apply);
   // Transferencias actualiza esta nota cuando termina de cargar; observar solo ese nodo.
   if(page==='notas-transferencias.html'){
     const note=document.querySelector('.data-note');if(note){new MutationObserver(()=>apply(note)).observe(note,{childList:true,characterData:true,subtree:true});apply(note);}
   }
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
