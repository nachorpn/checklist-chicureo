/* Gestark · navegación clásica y actualizaciones, v2026.11.22.13.
 * No modifica las URLs internas ni fuerza recargas automáticas.
 * En el contenedor nativo, la barra y las actualizaciones son responsabilidad del contenedor.
 */
(() => {
  'use strict';
  const VERSION = '2026.11.22.13';
  const MANIFEST = './gestark-version.json';
  const CHECK_INTERVAL = 5 * 60 * 1000;
  const embedded = (() => {
    try { return window.parent !== window &&
      window.parent.location.origin === location.origin &&
      window.parent.location.pathname.endsWith('/gestark-app.html'); }
    catch (_) { return false; }
  })();
  let updateButton = null;
  let previousCheck = 0;
  let checking = null;

  function applyStylesheet() {
    document.documentElement.classList.add('gestark-ui');
    document.documentElement.dataset.gestarkPage =
      (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '');
    if (document.getElementById('gestark-design-sheet')) return;
    const sheet = document.createElement('link');
    sheet.id = 'gestark-design-sheet';
    sheet.rel = 'stylesheet';
    sheet.href = './gestark-ui.css?v=' + VERSION;
    document.head.appendChild(sheet);
  }

  function refreshPage() {
    const url = new URL(location.href);
    url.searchParams.set('actualizar', String(Date.now()));
    if (updateButton) {
      updateButton.disabled = true;
      const label = updateButton.querySelector('span:last-child');
      if (label) label.textContent = 'Cargando';
    }
    location.replace(url.href);
  }

  const icon = {
    home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7v10H3zM9 21v-8h6v8"/></svg>',
    checklist: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M8 11l2 2 4-4M8 17h8"/></svg>',
    scanner: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V5a1 1 0 0 1 1-1h4m6 0h4a1 1 0 0 1 1 1v4M4 15v4a1 1 0 0 0 1 1h4m6 0h4a1 1 0 0 1 1-1v-4M5 12h14M9 9v6m3-6v6m3-6v6"/></svg>',
    transfer: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>',
    gestiones: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/><path d="m14 17 1.5 1.5 3-3"/></svg>'
  };
  const gestionesUrl = 'https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=Wgv9cmqK_0yJ9r3pYffiUD06FKRYXJZIncdeqhvYNd9URTFXTFpDNVZROE80UkZCMk5ZV1dEWkMzNS4u';

  function applyClassicNavigation() {
    const nav = document.querySelector('.bottom-nav');
    if (!nav) return;
    nav.classList.add('gestark-nav-modern');
    const current = location.pathname.split('/').pop() || 'index.html';
    const create = (label, href, graphic, center = false) => {
      const a = document.createElement('a');
      a.href = href;
      a.setAttribute('aria-label', label === 'Clientes' ? 'Abrir Entregas clientes' : label);
      if (label === 'Gestiones') { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      const page = href === './' ? 'index.html' : href.slice(2);
      if (current === page) {
        a.classList.add('is-current');
        a.setAttribute('aria-current', 'page');
      }
      if (center) {
        a.classList.add('gestark-nav-action');
        a.innerHTML = '<span class="gestark-nav-action-icon" aria-hidden="true">' + graphic +
          '</span><span class="gestark-nav-action-label">Clientes</span>';
        if (current === page) a.addEventListener('click', event => {
          const tab = document.getElementById('tab-scan');
          if (!tab) return;
          event.preventDefault();
          tab.click();
          window.scrollTo({top: 0, behavior: 'smooth'});
        });
      } else {
        a.innerHTML = graphic + '<span>' + label + '</span>';
      }
      return a;
    };
    nav.replaceChildren(
      create('Inicio', './', icon.home),
      create('Checklist', './checklist.html', icon.checklist),
      create('Clientes', './entregas-clientes.html', icon.scanner, true),
      create('Transferencias', './notas-transferencias.html', icon.transfer),
      create('Gestiones', gestionesUrl, icon.gestiones)
    );
  }

  function addUpdateButton() {
    updateButton = document.createElement('button');
    updateButton.type = 'button';
    updateButton.id = 'gestark-update';
    updateButton.setAttribute('aria-label', 'Actualizar Gestark');
    updateButton.title = 'Comprobar y cargar una versión reciente';
    updateButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 1-2.4-5.7"/><path d="M20 4v6h-6"/></svg><span>Actualizar</span>';
    updateButton.addEventListener('click', refreshPage);
    const css = document.createElement('style');
    css.textContent = `
      .bottom-nav button.gestark-update-button{appearance:none;border:0;background:transparent;color:#6f8181;cursor:pointer;flex:1;max-width:170px;min-width:0;display:flex;flex-direction:column;align-items:center;gap:4px;padding:6px 0 4px;border-radius:12px;font-family:inherit;font-size:10px;font-weight:650;min-height:53px;justify-content:center}
      .bottom-nav button.gestark-update-button svg{height:21px;width:21px}
      button.gestark-update-button.has-new-version{background:#e7f7ed;color:#0b7852;font-weight:800}
      button.gestark-update-button:focus-visible{outline:2px solid #2eacc2;outline-offset:2px}
      button.gestark-update-button:disabled{opacity:.75}
      body>button.gestark-update-floating{position:fixed;bottom:calc(18px + env(safe-area-inset-bottom));right:16px;z-index:60;border:0;border-radius:14px;background:#166d55;color:white;padding:12px 18px;box-shadow:0 7px 18px #12372d55;display:flex;gap:8px;align-items:center;font-family:inherit;font-weight:700;cursor:pointer}
      body>button.gestark-update-floating svg{height:20px;width:20px}
    `;
    document.head.appendChild(css);
    const nav = document.querySelector('.bottom-nav');
    if (nav) { updateButton.classList.add('gestark-update-button'); nav.appendChild(updateButton); }
    else { updateButton.classList.add('gestark-update-floating'); document.body.appendChild(updateButton); }
  }

  async function checkNewVersion() {
    if (checking || !navigator.onLine) return checking;
    checking = (async () => {
      try {
        const response = await fetch(MANIFEST + '?t=' + Date.now(), {cache:'no-store'});
        if (!response.ok) return;
        const latest = await response.json();
        if (typeof latest.version !== 'string') return;
        if (latest.version !== VERSION && updateButton) {
          updateButton.classList.add('has-new-version');
          const label = updateButton.querySelector('span:last-child');
          if (label) label.textContent = 'Nueva versión';
          updateButton.title = 'Hay una actualización disponible. Pulsa para obtenerla.';
        }
        // No recargar automáticamente: podría perderse un formulario sin guardar.
      } catch (_) {
        // Sin internet, mantener la aplicación abierta y sus datos locales.
      } finally { previousCheck = Date.now(); checking = null; }
    })();
    return checking;
  }
  function maybeCheck() {
    if (!document.hidden && Date.now() - previousCheck >= CHECK_INTERVAL) void checkNewVersion();
  }
  function init() {
    applyStylesheet();
    if (embedded) return; // Los iframes no agregan otra navegación ni un temporizador.
    applyClassicNavigation();
    addUpdateButton();
    void checkNewVersion();
    document.addEventListener('visibilitychange', maybeCheck);
    window.addEventListener('pageshow', maybeCheck);
    window.addEventListener('focus', maybeCheck);
    setInterval(maybeCheck, CHECK_INTERVAL);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once: true});
  else init();
})();
