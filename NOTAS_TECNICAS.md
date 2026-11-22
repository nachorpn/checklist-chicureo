# Gestark — Nómina operativa y archivo por fecha (v2026.11.22.16)

## Diseño funcional

- **Por cerrar** reúne solo O.F. con estado pendiente; prioridad por fecha de retiro más antigua y número de orden prominente.
- **Archivo por fecha** reúne únicamente O.F. confirmadas como cerradas, agrupadas por fecha de cierre en `America/Santiago`.
- Acciones **Confirmar cerrada**, **Reabrir** y **Eliminar O.F.** exigen confirmación explícita. Archivar nunca borra una O.F. de Firestore.
- Búsqueda de número o cliente; filtro de fechas en ambas vistas; paginación de 60 órdenes para evitar listas enormes.
- Cierres históricos sin fecha de cierre se agrupan por **fecha de retiro**, con advertencia explícita de que la fecha del cierre no fue registrada.

## Integración y compatibilidad

El módulo `gestark-clientes-ui.js` se inyecta desde `gestark-pwa.js` después de una autenticación Firebase válida y se superpone únicamente a la vista de historial de `entregas-clientes.html`. No elimina ni cambia `entregas-clientes.js`, la gestión de cámara, el lector de códigos ni el diálogo de compartir imagen. La vista antigua permanece en el DOM, oculta, para no romper sus eventos y estados.

Los datos siguen en `gestark_client_deliveries_v1`. El mapa `closures` conserva la entrada booleana habitual `closures[of]`. Se añade el campo de metadatos dentro del mismo mapa: `closures['closedAt_' + of] = epochMilliseconds` para cierres nuevos. Este formato es compatible con las reglas Firestore compartidas, que exigen únicamente `closures is map` y permiten modificaciones de `closures` mediante `update`.

`gestark-clientes-cloud.js` replica la fecha de cierre a `localStorage` clave `gestark:clients:closure-dates:v1` para la vista, y la incorpora a la cola de operaciones antes de enviarla a Firebase. Al reabrir o eliminar una O.F. se borra el metadato asociado. Cierres anteriores (booleanos sin fecha) preservan el estado, sin inventar su fecha.

La confirmación de cierre es administrativa; **no sustituye la verificación física o documental de Starken**. El momento del cierre se registra con `Date.now()` del dispositivo, no con timestamp de servidor. Las diferencias de reloj entre dispositivos pueden afectar la fecha mostrada.

## Pruebas y límites

- `node --check` de `gestark-clientes-cloud.js`, `gestark-clientes-ui.js`, `gestark-pwa.js`, `gestark-sw.js` y del script inline de `gestark-app.html`.
- `gestark-version.json` decodificado como JSON válido.
- 12 pruebas heredadas de colas, importación idempotente, detección de nuevos registros, borrado lógico y Firebase simulado.
- 13 pruebas adicionales de conservación de fechas, cierre y reapertura, confirmación de doble paso, eliminación por O.F., archivo local y compatibilidad con cierres históricos.
- **No se probaron dispositivos iOS reales ni las reglas desplegadas en producción**. Se recomienda respaldar los registros antes de publicar y verificar una O.F. de prueba Mac ↔ iPhone.
