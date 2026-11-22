# Auditoría técnica de Gestark

**Fecha:** 22 de noviembre de 2026  
**Repositorio:** https://github.com/nachorpn/checklist-chicureo  
**Base inspeccionada:** versión publicada `2026.11.22.12` del contenedor nativo y autenticación Firebase  
**Parche propuesto:** `2026.11.22.13` — *no instalado en GitHub automáticamente*

## 1. Alcance y comprobaciones

Se examinó el listado raíz de 90 elementos del repositorio, incluyendo 16 archivos JavaScript, 16 páginas HTML, 1 hoja CSS, 1 manifest PWA, 1 JSON de versiones y 3 scripts Python históricos. Se revisaron las referencias entre páginas, la autenticación, los módulos de Transferencias, el contenedor nativo, el Service Worker, la sincronización Firestore y los cambios de sesión.

**Sintaxis:** los 16 archivos JavaScript y 23 bloques de script inline incluidos en las 16 páginas HTML inspeccionadas pasaron una comprobación de sintaxis en un intérprete JavaScript; en los archivos tipo módulo, las declaraciones `import` se aislaron para evaluar el resto de la sintaxis. Ambos JSON se interpretan correctamente. Para el parche, `node --check` validó los cuatro archivos JS, el bloque JS de `gestark-app.html` y un analizador CSS comprobó su hoja interna. No se encontraron referencias rotas en los enlaces locales estáticos revisados.

**Pruebas funcionales aisladas:** 9/9 para el contenedor nativo con páginas y usuarios simulados, incluidas navegación, barra única y fallos de cierre de sesión; 6/6 para el actualizador clásico, incluidos cinco enlaces, botón de actualización y ausencia de URLs forzadas. Estas pruebas NO utilizaron datos reales ni reglas de Firestore.

**No verificado de forma concluyente:** autenticación real en iPhone/Safari instalado, rendimiento efectivo en iOS, reglas publicadas de Firestore, políticas de Cloud Storage, recuperación offline de usuarios, caducidad real de tokens y sincronización durante suspensión del dispositivo. Las imágenes se verificaron por referencia de archivo en el repositorio, no mediante inspección de sus bytes. Los tres scripts Python v28 históricos se revisaron por propósito y compatibilidad; no se ejecutaron ni se sometieron a `py_compile` en este entorno.

## 2. Hallazgos

| Prioridad | Componente | Hallazgo | Estado |
|---|---|---|---|
| Alta | `gestark-app.html` + `gestark-auth.js` | El cierre de sesión del contenedor ignoraba fallos y podía redirigir aunque Firebase no confirmara el cierre. | **Corregido en parche**: ahora se comunica el error; no se simula una salida exitosa. |
| Alta | `notas-transferencias.js` | Existe una opción para eliminar en lote TODAS las transferencias de `gestark_transfers_v1`; la función del cliente no comprueba expresamente el rol administrador. | **Pendiente**: auditar las reglas reales de Firestore y la política deseada para roles antes de modificar permisos. La interfaz sí solicita confirmación. |
| Alta | Repositorio histórico | Los verificadores de contraseñas locales pudieron quedar registrados en commits anteriores, aunque `usuarios.js` actual esté vacío. | **Pendiente**: renovar las contraseñas anteriores y estudiar la limpieza del historial tras hacer respaldo. |
| Media | `gestark-updates.js` | Modificaba todos los enlaces internos añadiendo `?actualizar=` con fecha/hora; evita parte de la reutilización de caché y puede ralentizar la navegación. | **Corregido**: la navegación ya no fuerza URLs nuevas; el botón Actualizar sí lo hace. |
| Media | `gestark-updates.js` + `gestark-version.json` | La versión de comprobación estaba detenida en `2026.11.21.43`, mientras el contenedor/SW habían avanzado a `2026.11.22.12`. Mensajes de versiones desactualizados. | **Corregido**: actualización coordinada a `2026.11.22.13`; no hay recarga automática de Inicio que interrumpa la edición. |
| Media | `gestark-pwa.js` | Cada página/iframe registraba y solicitaba comprobar el mismo Service Worker repetidamente. | **Corregido**: los iframes del contenedor no ejecutan el instalador ni registran el trabajador; el contenedor gestiona su registro. |
| Media | `gestark-auth.js` | La página principal no mantenía un observador de sesión después de autenticar. Podía conservar la interfaz visible después de cerrar la sesión desde otra pestaña. | **Mitigado**: observador de sesión y evento `gestark:sessionlost`, sin conferir autorización mediante datos locales. |
| Media | `gestark-app.html` | Páginas independientes embebidas: cada una inicializa Firebase, consulta `authorized_users/{uid}` y abre sus propios listeners; coste de memoria y esperas en Safari iOS. | **Limitación arquitectónica**: las correcciones reducen trabajo redundante, pero la eliminación completa de esos costes requiere refactorizar módulos a SPA con estado centralizado. |
| Media | Checklist y otros módulos | Hay información en `localStorage` y algunos registros son exclusivos del dispositivo. | **No se alteró**: no borrar almacenamiento, no desinstalar PWA antes de revisar y respaldar. |
| Baja | `gestark-auth-firebase-piloto.js` y páginas piloto | Rutas antiguas conservan lógica de acceso local por compatibilidad; ya no forman parte de la autenticación operativa principal. | **Pendiente**: retirar o archivar pilotos luego de revisar sus dependencias y accesos. |
| Baja | `gestark-firebase-config.js`, Python v28 | Comentarios y herramientas de empaquetado aún describen etapas de laboratorio/v28 anteriores a la migración. | **Documentado**. No se reescribieron automáticamente las herramientas antiguas. |

### Nota importante de seguridad

**Las comprobaciones `role === 'admin'` de JavaScript no sustituyen las reglas de Firestore.** Hay que revisar que las reglas de `authorized_users`, `gestark_transfers_v1` y los demás recursos autoricen correctamente lecturas, escrituras y borrado masivo. Si hoy cualquier usuario autorizado puede borrar todas las transferencias, sería recomendable restringir esa operación o crear un backend de operación privilegiada con auditoría. No fue posible confirmar las reglas reales a partir de los archivos del repositorio.

La `apiKey` web de Firebase es un identificador público de la aplicación, no una clave del SDK de administración; no es por sí misma una filtración de credenciales. No se detectaron claves privadas de servicio ni contraseñas embebidas en los archivos principales examinados. No se ha realizado una búsqueda exhaustiva de secretos en todos los commits históricos.

## 3. Qué modifica el parche

**Solo estos seis archivos**:

- `gestark-app.html`: versión coordinada, cierre de sesión comprobado y bloqueo de sesión del contenedor cuando la página Inicio informa una pérdida de identidad; eliminación de logs innecesarios.
- `gestark-auth.js`: observa la sesión Firebase en páginas principales, propaga la pérdida de sesión en iframes, elimina duplicación de elementos de usuario y reporta errores de salida.
- `gestark-updates.js`: reemplaza el gestor de actualizaciones clásico y quita la modificación sistemática de enlaces y la recarga automática.
- `gestark-pwa.js`: evita registros y estilos de instalación repetidos desde iframes.
- `gestark-sw.js`: cambia la clave de caché a la versión coordinada, conservando solo caché de recursos estáticos del propio dominio.
- `gestark-version.json`: actualiza la versión y la descripción que el sistema consulta.

**No se modifican** Firestore, reglas de seguridad, colección de transferencias, contraseñas, `usuarios.js`, `notas-transferencias.js`, Checklist, escáner, datos de clientes ni almacenamiento local.

## 4. Instalación controlada

1. Antes de publicar, guarda una copia del repositorio o crea un punto de retorno en GitHub (commit anterior identificable).
2. Descarga este paquete y sube únicamente los seis archivos anteriores a la raíz del repositorio, reemplazando sus versiones anteriores. Revisa que GitHub muestre exactamente seis cambios de código y configuración.
3. Espera a que GitHub Pages publique y abre `https://nachorpn.github.io/checklist-chicureo/gestark-app.html?actualizar=2026112213` en Safari. **No borres la app instalada ni su almacenamiento.**
4. Prueba Inicio → Transferencias → Checklist → Inicio, lectura Firebase, alta/edición/borrado de un registro ficticio, y cerrar sesión. Verifica que el registro aparezca en Mac y iPhone, sin compartir datos reales de clientes en las pruebas.
5. Si falla, vuelve al commit anterior en GitHub. No borres Firestore ni los datos locales para revertir este parche.

**Rollback:** restaurar los seis archivos a sus versiones anteriores (v12 para `gestark-app`, `gestark-auth`, `gestark-sw`; versiones anteriores del actualizador, instalador y JSON), publicar y usar el botón Actualizar. El proceso no toca bases de datos.

## 5. Tareas que faltan antes de declararlo estable

- Validar Firestore Rules en la consola real, especialmente operaciones de eliminación en masa y separación de roles. Es una revisión independiente de la sintaxis.
- Revisar datos locales y hacer respaldo de Checklist/Entregas antes de cualquier desinstalación o migración.
- Probar en iPhone instalado con cambio de usuario, fondo/primer plano, desconexión, cierre de sesión en otro dispositivo, eliminación en vivo y recuperación de red.
- Crear pruebas de integración con Firebase Emulator Suite y métricas de tiempos reales en Safari.
- A medio plazo, sustituir la arquitectura de múltiples iframes por módulos de una SPA con autenticación centralizada. Es la ruta más fiable hacia transiciones consistentemente rápidas.

**Conclusión:** se corrigieron fallos verificables de navegación y manejo de sesión y se pasó un conjunto de pruebas de sintaxis y simulación. **No equivale a una certificación de seguridad ni a una prueba funcional de producción completa.**
