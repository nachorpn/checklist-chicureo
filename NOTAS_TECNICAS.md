# Entregas clientes — integración Firestore v2026.11.22.14

## Modelo
- Colección: `gestark_client_deliveries_v1`.
- Un documento por retiro, con el ID de nómina generado localmente.
- Campos: `id`, `client`, `at` (epoch ms), `user`, `operator`, `orders` (`[{of,at}]`), `closures` (mapa `OF:bool`), `deleted`, `schemaVersion`, `createdBy`, `createdAt`, `updatedBy`, `updatedAt`.
- La misma clave (`id`) se usa en todos los dispositivos, por lo que reimportar un registro no crea duplicados.
- Al eliminar la última O.F., el documento queda con `deleted:true` y `orders:[]`; no se borra físicamente.

## Sincronización
- El código del escáner (`entregas-clientes.js`) se mantiene intacto.
- El nuevo módulo observa exclusivamente las dos claves de almacenamiento que ya usa el sistema (`rosters` y `system-closure`) y envía sus cambios en una cola persistente.
- `onSnapshot` mantiene los historiales sincronizados, con fusión visual de operaciones todavía pendientes; al recibir datos actualizados los refleja en las claves locales para la interfaz original.
- Los borradores aún no finalizados no se comparten. Los registros antiguos se importan de forma idempotente. Si el dispositivo no puede guardar la cola por falta de espacio, no se sobrescribe su copia histórica con el snapshot remoto.
- **Nota técnica**: la adaptación usa observación de `Storage.prototype.setItem` y una alternativa por sondeo si no puede interceptar el método. En una evolución posterior conviene sustituirla por eventos de dominio (`retireCreated`, `ofClosed`, `ofRemoved`) emitidos directamente por el módulo de clientes.

## Seguridad y límites
- Comprueba Firebase Authentication y el perfil remoto autorizado antes de leer o escribir la nueva colección.
- Las reglas propuestas restringen el acceso a usuarios activos y prohíben las eliminaciones físicas por el cliente.
- Todos los miembros activos pueden visualizar y operar sobre las mismas nóminas; **si se requieren permisos por agencia o rol, hay que modificar las reglas antes del lanzamiento**.
- Una baja permanente con eliminación de datos requeriría operación administrativa con backend confiable.
- `onSnapshot` consulta la colección completa: si crece a miles de documentos, hay que implementar consultas por fecha/paginación y archivado.
- Las pruebas del paquete son de lógica con Firebase simulado. No se probó el entorno real Firebase ni las reglas desplegadas.
