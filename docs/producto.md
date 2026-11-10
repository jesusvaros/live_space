# Producto y catálogo de pantallas

## Recorridos principales

La app (Android e iOS) tiene Inicio, Explorar, Crear, Momentos y Perfil. No hay
versión web de la app: la web pública solo capta instalaciones
([Web pública y landings](./landing.md)). La ruta nunca decide si una capacidad es «profesional»; lo decide RLS y
la membresía activa.

| Área | Pantallas existentes | Objetivo de reconstrucción |
| --- | --- | --- |
| Acceso | bienvenida, login, alta, recuperación | confirmación de email, estados y errores accesibles |
| Descubrir | agenda, secciones, búsqueda, mapa | lista/mapa sincronizados, filtros compartibles |
| Catálogo | evento, artista, sala | procedencia, lineup, entradas, setlist y media |
| Momentos | feed, detalle, subida, QR | fotos/vídeos pendientes, progreso y reanudación |
| Perfil | propio, público, selector de workspace | privacidad, follows, guardados, asistencia |
| Profesional | crear evento, administrar artista/sala | edición completa en móvil y escritorio |
| Confianza | reportes, bloqueos y administración | cola, evidencia mínima, acciones auditadas |

## Ajustes

El engranaje de Perfil abre `/ajustes`: grupos de filas con icono, título, valor
actual y flecha, y cada fila abre `/ajustes/<sección>` con su barra de volver
(una sección desconocida vuelve a la lista; el botón atrás de Android va de la
sección a la lista y de la lista al perfil). Código en `src/features/settings/`.

| Grupo | Secciones |
| --- | --- |
| 1 | **Perfil** (nombre, usuario, ciudad, bio, enlaces y, en cuentas de sala, los datos de la sala); **Gestión** (actuar como tú o como un artista/sala que gestionas y panel de gestión; solo si gestionas alguno) |
| 2 | **Privacidad**: reutilización por defecto de los momentos, Usuarios bloqueados, Ocultos del mapa y estado del permiso de ubicación |
| 3 | **Cuenta**: email, método de acceso, cerrar sesión y Eliminar cuenta |
| 4 | **Legal** (privacidad, condiciones, licencia, borrar cuenta: `/legal/<doc>`, en la app y sin sesión) y **Acerca de** (versión) |

No hay sección de notificaciones: solo hay avisos locales que se activan al
seguir o guardar y se gestionan en los ajustes del sistema.

## Paridad

Android e iOS comparten todos los recorridos y usan cámara, galería, QR, push,
deep links y segundo plano. Las diferencias de plataforma no eliminan ningún
recorrido social o profesional.

## Estados obligatorios

Cada pantalla de datos debe representar carga, vacío, error recuperable,
sin conexión y permiso insuficiente. Cada acción destructiva confirma alcance y
ofrece recuperación cuando sea posible. El contenido en revisión no se presenta
como publicado.
