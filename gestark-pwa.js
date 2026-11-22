/* Gestark · instalador PWA 2026.11.22.14.
 * El contenedor nativo registra el Service Worker una sola vez.
 * Los módulos abiertos dentro de iframes NO lo registran nuevamente.
 */
(() => {
 'use strict';
 const VERSION='2026.11.22.14';
 const appBase=new URL('./',document.currentScript?.src||location.href);
 // Activar la sincronización de Entregas clientes después de validar Firebase.
 // Compatible con la pestaña nativa (iframe) y el acceso clásico directo.
 if(location.pathname.endsWith('/entregas-clientes.html')){
   const loadClientsCloud=()=>{
     if(window.__gestarkClientsCloudRequested || !window.GestarkAuth?.getUser?.()?.uid)return;
     window.__gestarkClientsCloudRequested=true;
     const script=document.createElement('script');
     script.src='./gestark-clientes-cloud.js?v=2026.11.22.14';
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
   document.addEventListener('gestark:ready',loadClientsCloud);
   if(window.GestarkAuth?.getUser?.()?.uid)loadClientsCloud();
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
