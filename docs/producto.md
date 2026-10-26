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

## Paridad

Android e iOS comparten todos los recorridos y usan cámara, galería, QR, push,
deep links y segundo plano. Las diferencias de plataforma no eliminan ningún
recorrido social o profesional.

## Estados obligatorios

Cada pantalla de datos debe representar carga, vacío, error recuperable,
sin conexión y permiso insuficiente. Cada acción destructiva confirma alcance y
ofrece recuperación cuando sea posible. El contenido en revisión no se presenta
como publicado.
