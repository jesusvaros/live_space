# Modelo de datos

Las migraciones de `supabase/migrations/` son la fuente de verdad. Los SQL de la
raíz son históricos y no se aplican al piloto.

| Dominio | Entidades principales |
| --- | --- |
| Identidad | `profiles`, `subjects`, `user_blocks` |
| Profesional | `entity_memberships` con roles por subject |
| Catálogo | `artists`, `venue_places`, identificadores y enlaces externos |
| Agenda | `events`, `event_artists`, precios y fuente original |
| Setlist | `songs`, `event_setlist_items` |
| Media/social | reservas, activos, posts, likes, follows, guardados, asistencia |
| Ingesta | fuentes, ejecuciones, staging, confianza y fusiones |
| Confianza | reportes, acciones de moderación y configuración global |
| Comunidad | `venue_feedback` (etiquetas de sala), `posts.allow_reuse` (licencia del momento) |

| Reclamaciones | `entity_claims` (solicitud de gestionar un artista o sala) |
| Subida por QR | `event_upload_tokens` (token privado del QR de cada concierto) |

`subjects` ofrece una identidad social uniforme para usuario, artista y sala.
`entity_memberships` separa quién inicia sesión de la entidad que puede gestionar.
Los activos Cloudinary existen antes que el post y pasan por `pending_review`.
Un evento importado conserva fuente e identificador externo para idempotencia.

## Datos de comunidad

- **Intención agregada** (`get_entity_audience_stats`, `get_event_intent_stats`):
  guardados, «voy», «fui», tendencia diaria y ciudades de seguidores solo para
  miembros del artista o la sala. Nunca devuelven personas y cualquier grupo de
  menos de 10 vuelve como `null` (la app muestra «<10»).
- **Licencia de momentos**: `posts.allow_reuse` (por defecto `true`) permite al
  artista y la sala del evento descargar el momento citando al autor
  (`get_moment_licence`, `set_moment_allow_reuse`). Texto en
  [Licencia de los momentos](./legal/licencia-momentos.md), pendiente de revisión legal.
- **Etiquetas de sala** (`venue_feedback`): una fila por persona y evento, solo
  con asistencia `attended`; público solo como recuento por etiqueta con 5 votos
  o más (`get_venue_feedback_summary`). Los reportes usan `moderation_reports`
  con `target_type = 'venue'` y `reason = 'venue_feedback'`.

Un artista o sala creados por el scraper no se dan de alta: se reclaman. La
solicitud (`entity_claims`, `pending → approved/rejected`) la aprueba una persona
administradora con `review_entity_claim()`, que crea la membresía con rol `admin`
y deja auditoría en `moderation_actions`.

Lo que un miembro edita a mano en un evento (nombre, horas, entradas, cartel,
descripción) queda en `events.manager_locked_fields`; un trigger impide que los
workers lo sobrescriban y `upsertEvents` tampoco lo intenta. `normalized_name`
no se toca al renombrar para que el scraper siga reconociendo el evento.

El QR de cada concierto enlaza a `/upload?qr=<token>`; el token vive en
`event_upload_tokens` (solo lo leen quienes gestionan el evento) y se resuelve
con `resolve_event_upload_token()`. Nunca va en el enlace público del evento.

## Reglas de evolución

- Una migración aplicada nunca se edita; se crea una compensatoria.
- UUID, timestamps con zona y `Europe/Madrid` son la base temporal.
- FKs impiden huérfanos; borrado de media es lógico durante siete días.
- Los tipos de cliente se regeneran tras cada cambio y CI detecta diferencias.
- Importaciones heredadas usan tablas temporales y reconciliación de conteos.
