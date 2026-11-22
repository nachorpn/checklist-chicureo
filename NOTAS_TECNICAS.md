# Gestark · Corrección de sincronización Clientes 2026.11.22.15

## Origen probable

La versión anterior interceptaba globalmente `Storage.prototype.setItem` para
observar modificaciones hechas por `entregas-clientes.js`. Esa técnica no es un
contrato de la API Storage y depende del comportamiento del navegador. En
particular, su fallback de comprobación periódica podía demorarse cuando el
navegador suspendía el documento.

La aplicación mostraba «Firebase sincronizado» con una lectura remota aunque no
hubiera confirmado la escritura de un nuevo retiro. Esto no prueba que
Firestore haya aceptado las escrituras.

## Cambios

- Detector de operaciones de la interfaz en `document.click` para Finalizar,
  estado de O.F. y confirmación de eliminación, tras los handlers originales.
- Detección tras eventos `focus`, `pageshow`, `visibilitychange` y `storage`.
- Comprobación periódica de respaldo cada 1200 ms mientras el documento esté visible.
- Revisión local justo antes de materializar un snapshot del servidor; evita
  sobreescribir retiros locales recientes todavía no detectados.
- Contador visible de retiros y O.F. que devuelve el snapshot del servidor.
- No se cierra a la fuerza el observador de Firebase con `pagehide`.
- Se conserva la cola persistente de cambios y la lógica de borrados lógicos.

## Alcance y limitaciones

Las reglas `gestark_client_deliveries_v1` publicadas anteriormente siguen siendo
necesarias y no cambian. No se han consultado los datos reales privados de
Firestore ni se ha ejecutado un navegador iOS real. Si la nueva versión muestra
un rechazo `permission-denied`, hay que examinar el registro y las reglas;
ninguna corrección de UI puede evitar un rechazo del servidor.

## Verificaciones

- `node --check` de los tres JS modificados y del script inline de `gestark-app.html`.
- JSON `gestark-version.json` válido.
- Doce pruebas Node de la cola local, migración, cambios de estado, eliminación,
  prevención de resurrección de registros, idempotencia, materialización de
  snapshots y evento Finalizar.
- No se cambió `entregas-clientes.js`, el lector de códigos ni Transferencias.
