(() => {
  'use strict';
  // Mantener igual a gestark-version.json en cada nueva publicación.
  const VERSION = '2026.11.21.36';
  const MANIFEST = './gestark-version.json';
  const CHECK_INTERVAL = 5 * 60 * 1000;
  let button;
  let previousCheck = 0;
  let activeCheck = null;

  function freshUrl() {
    const url = new URL(location.href);
    url.searchParams.set('actualizar', String(Date.now()));
    return url.href;
  }
  function refreshPage() {
    if (button) {
      button.disabled = true;
      button.querySelector('span:last-child').textContent = 'Cargando';
    }
    location.replace(freshUrl());
  }
  function applyDesignAndNavigation() {
    const file = location.pathname.split('/').pop() || 'index.html';
    document.documentElement.classList.add('gestark-ui');
    document.documentElement.dataset.gestarkPage = file.replace(/\.html$/,'');
    const sheet = document.createElement('link');
    sheet.rel = 'stylesheet';
    sheet.href = './gestark-ui.css?v=' + VERSION;
    document.head.appendChild(sheet);
    const nav = document.querySelector('.bottom-nav');
    if (!nav) return;
    nav.classList.add('gestark-nav-modern');
    const shape = (label,href,icon,isCenter) => {
      const a = document.createElement('a');
      a.href=href;
      a.setAttribute('aria-label',label==='Clientes'?'Abrir Entregas clientes':label==='Gestiones'?'Abrir Gestiones Chicureo':label);
      if(label==='Gestiones'){a.target='_blank';a.rel='noopener noreferrer';}
      const isCurrent = file === (href==='./'?'index.html':href.slice(2));
      if(isCurrent){a.classList.add('is-current');a.setAttribute('aria-current','page')}
      if(isCurrent && isCenter){
        a.addEventListener('click',event=>{
          const tab=document.getElementById('tab-scan');
          if(!tab) return;
          event.preventDefault();tab.click();window.scrollTo({top:0,behavior:'smooth'});
        });
      }
      if(isCenter){
        a.classList.add('gestark-nav-action');
        a.innerHTML='<span class="gestark-nav-action-icon" aria-hidden="true">'+icon+'</span><span class="gestark-nav-action-label">Clientes</span>';
      }else{
        a.innerHTML=icon+'<span>'+label+'</span>';
      }
      return a;
    };
    const icons={
      home:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7v10H3zM9 21v-8h6v8"/></svg>',
      checklist:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M8 11l2 2 4-4M8 17h8"/></svg>',
      scanner:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V5a1 1 0 0 1 1-1h4m6 0h4a1 1 0 0 1 1 1v4M4 15v4a1 1 0 0 0 1 1h4m6 0h4a1 1 0 0 0 1-1v-4M5 12h14M9 9v6m3-6v6m3-6v6"/></svg>',
      transfer:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>',
      gestiones:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/><path d="m14 17 1.5 1.5 3-3"/></svg>'
    };
    // Abrir Gestiones Chicureo directamente, sin pasar por Repositorio.
    const gestionesUrl = 'https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=Wgv9cmqK_0yJ9r3pYffiUD06FKRYXJZIncdeqhvYNd9URTFXTFpDNVZROE80UkZCMk5ZV1dEWkMzNS4u';
    nav.replaceChildren(
      shape('Inicio','./',icons.home,false),
      shape('Checklist','./checklist.html',icons.checklist,false),
      shape('Clientes','./entregas-clientes.html',icons.scanner,true),
      shape('Transferencias','./notas-transferencias.html',icons.transfer,false),
      shape('Gestiones',gestionesUrl,icons.gestiones,false)
    );
  }

  function addButton() {
    const nav = document.querySelector('.bottom-nav');
    button = document.createElement('button');
    button.type = 'button';
    button.id = 'gestark-update';
    button.setAttribute('aria-label','Actualizar Gestark');
    button.title = 'Cargar la versión más reciente de Gestark';
    button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 1-2.4-5.7"/><path d="M20 4v6h-6"/></svg><span>Actualizar</span>';
    button.addEventListener('click',refreshPage);

    const css = document.createElement('style');
    css.textContent = `
      .bottom-nav button.gestark-update-button {
        appearance:none;border:0;background:transparent;color:#6f8181;cursor:pointer;
        flex:1;max-width:170px;min-width:0;display:flex;flex-direction:column;
        align-items:center;gap:4px;padding:6px 0 4px;border-radius:12px;
        font-family:inherit;font-size:10px;font-weight:650;min-height:53px;
        justify-content:center;
      }
      .bottom-nav button.gestark-update-button svg{height:21px;width:21px}
      button.gestark-update-button.has-new-version{background:#e7f7ed;color:#0b7852;font-weight:800}
      button.gestark-update-button:focus-visible{outline:2px solid #2eacc2;outline-offset:2px}
      button.gestark-update-button:disabled{opacity:.75}
      body > button.gestark-update-floating {
        position:fixed;bottom:calc(18px + env(safe-area-inset-bottom));right:16px;
        z-index:60;border:0;border-radius:14px;background:#166d55;color:white;
        padding:12px 18px;box-shadow:0 7px 18px #12372d55;display:flex;
        gap:8px;align-items:center;font-family:inherit;font-weight:700;cursor:pointer;
      }
      body > button.gestark-update-floating svg{height:20px;width:20px}
    `;
    document.head.appendChild(css);
    if (nav) {
      button.classList.add('gestark-update-button');
      nav.appendChild(button);
    } else {
      button.classList.add('gestark-update-floating');
      document.body.appendChild(button);
    }
  }

  function refreshInternalLinks() {
    // Cargar la página nueva siempre que alguien cambie de sección.
    document.addEventListener('click', event => {
      const link = event.target.closest?.('a[href]');
      if (!link || event.defaultPrevented || event.button !== 0 ||
          event.metaKey || event.ctrlKey || event.altKey || event.shiftKey ||
          link.target === '_blank' || link.hasAttribute('download')) return;
      const dest = new URL(link.href, location.href);
      if (dest.origin !== location.origin ||
          !dest.pathname.startsWith(new URL('./',location.href).pathname)) return;
      dest.searchParams.set('actualizar',String(Date.now()));
      link.href = dest.href;
    }, true);
  }

  async function checkNewVersion() {
    if (activeCheck) return activeCheck;
    if (!navigator.onLine) return;
    activeCheck = (async () => {
      try {
        const res = await fetch(MANIFEST + '?t=' + Date.now(), {cache:'no-store'});
        if (!res.ok) return;
        const latest = await res.json();
        if (typeof latest.version !== 'string') return;
        if (latest.version !== VERSION) {
          if (button) {
            button.classList.add('has-new-version');
            button.querySelector('span:last-child').textContent = 'Nueva versión';
            button.title = 'Hay una nueva versión. Pulsa para actualizar.';
          }
          // Sin interrumpir la edición del checklist ni el formulario de administración.
          if (location.pathname.endsWith('/') || location.pathname.endsWith('/index.html')) {
            const key = 'gestark-last-auto-refresh';
            try {
              if (sessionStorage.getItem(key) !== latest.version) {
                sessionStorage.setItem(key, latest.version);
                refreshPage();
              }
            } catch (_) { /* Puede bloquearse el almacenamiento privado. */ }
          }
        }
      } catch (err) {
        // Sin conexión o GitHub Pages todavía publicando: mantener la versión actual.
        console.info('Gestark: no se pudo verificar la actualización.', err);
      } finally {
        previousCheck = Date.now();
        activeCheck = null;
      }
    })();
    return activeCheck;
  }

  function maybeCheck() {
    if (!document.hidden && Date.now() - previousCheck >= CHECK_INTERVAL) checkNewVersion();
  }

  function init() {
    applyDesignAndNavigation();
    addButton();
    refreshInternalLinks();
    checkNewVersion();
    document.addEventListener('visibilitychange',maybeCheck);
    window.addEventListener('pageshow',maybeCheck);
    window.addEventListener('focus',maybeCheck);
    setInterval(maybeCheck,CHECK_INTERVAL);
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
