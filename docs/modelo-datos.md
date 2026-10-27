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

## Reglas de evolución

- Una migración aplicada nunca se edita; se crea una compensatoria.
- UUID, timestamps con zona y `Europe/Madrid` son la base temporal.
- FKs impiden huérfanos; borrado de media es lógico durante siete días.
- Los tipos de cliente se regeneran tras cada cambio y CI detecta diferencias.
- Importaciones heredadas usan tablas temporales y reconciliación de conteos.
