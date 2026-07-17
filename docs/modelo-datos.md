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

`subjects` ofrece una identidad social uniforme para usuario, artista y sala.
`entity_memberships` separa quién inicia sesión de la entidad que puede gestionar.
Los activos Cloudinary existen antes que el post y pasan por `pending_review`.
Un evento importado conserva fuente e identificador externo para idempotencia.

## Reglas de evolución

- Una migración aplicada nunca se edita; se crea una compensatoria.
- UUID, timestamps con zona y `Europe/Madrid` son la base temporal.
- FKs impiden huérfanos; borrado de media es lógico durante siete días.
- Los tipos de cliente se regeneran tras cada cambio y CI detecta diferencias.
- Importaciones heredadas usan tablas temporales y reconciliación de conteos.
