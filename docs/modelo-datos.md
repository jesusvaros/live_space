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
| Festivales | `festivals` (edición con fechas y recinto), `events.festival_id` y `events.room` (escenario) |
| Alta de conciertos | `event_proposals` (concierto propuesto por un artista a una sala) |

`subjects` ofrece una identidad social uniforme para usuario, artista, sala y
festival.
`entity_memberships` separa quién inicia sesión de la entidad que puede gestionar.
Los activos de subida nacen `pending_review`; al crear su post (`source = 'upload'`)
el trigger `publish_uploaded_post` publica el post y el activo a la vez.
Un evento importado conserva fuente e identificador externo para idempotencia.

## Festivales

Un festival es un contenedor de conciertos normales. La edición (`festivals`)
guarda nombre, año, fechas, ciudad y recinto: un `venue_place`, porque todo
evento necesita sala. Cada actuación es un `event` con `festival_id`, su
artista y su hora, y `room` como escenario. Así los momentos por canción, el
setlist, la subida por QR y la detección por hora en la galería funcionan igual
que en una sala.

El festival es un `subject`: se sigue, se reclama (`entity_claims`) y se
gestiona (`entity_memberships`) como un artista o una sala. Lo crea un
administrador. Quien lo gestiona escribe el horario con
`festival_save_performance`, que busca o crea el artista por nombre
normalizado y publica la actuación al momento, y lo corrige con
`festival_cancel_performance`, que cancela sin borrar para no perder los
momentos ya subidos. `can_manage_event` e `is_event_entity_member` reconocen a
los gestores del festival en sus actuaciones. `v_subject_festivals` da la
portada: la imagen propia o, si no hay, la última foto del público con la
reutilización permitida y su crédito.

La migración va en dos pasos. `20261028060100` añade `festival` a los enums y
debe ejecutarse sola. `20261028060200` crea el resto.

## Alta de conciertos

Los conciertos los añade quien los hace, siempre con `create_concert()`, que
crea evento y cartel de una vez y decide en la base de datos si se publica.
Los nombres de artista nuevos se buscan o crean por nombre normalizado sin
`created_by`: escribir un nombre no da su gestión, que solo llega por
`entity_claims`.

- Publica al momento quien puede publicar en la sala
  (`can_publish_at_venue`): un admin, o quien gestiona la sala (owner, admin o
  editor) si la sala está publicada. Una sala recién creada por alguien sigue
  en borrador y sus conciertos van a moderación.
- Quien gestiona un artista propone: el evento queda en `review` y se crea una
  fila en `event_proposals` (`pending`). Si la sala está publicada y tiene
  gestores (`reviewer = 'venue'`) la ven en su panel; si no, va a moderación
  (`reviewer = 'moderation'`, pestaña «Conciertos» del panel de admin). Si una
  sala publicada se reclama mientras espera, la propuesta pasa a la sala.
- Límites por quien propone, serializados con un advisory lock: 10 propuestas
  pendientes, 3 pendientes en la misma sala y 20 nuevas al día. Las colas se
  ordenan por turnos entre proponentes para que nadie entierre al resto.
- La sala (si está publicada) o un admin decide con
  `review_concert_proposal()`: aceptar publica el evento; rechazar lo archiva y
  guarda un motivo opcional (máx. 280) que ve el artista. Ambas dejan auditoría
  en `moderation_actions`.
- Si el evento cambia de estado por otra vía, un trigger cierra la propuesta:
  `accepted`/`rejected` solo si quien lo cambia puede publicar en la sala, es
  staff o es un proceso sin usuario; si no, `withdrawn` (cancelarla el propio
  artista).
- El aviso de duplicado (mismo nombre en la sala ±3 h) solo cuenta conciertos
  publicados o que quien llama ya gestiona, para no revelar los no anunciados.

`events_guard_publish` y `event_artists_guard_accepted` cierran los atajos del
cliente. Desde la app, quien no puede publicar en la sala no inserta un evento
publicado, no lo pasa a `published`, no lo reabre desde `archived` ni lo mueve
de sala. Y en un concierto publicado que llegó como propuesta no cambia nombre,
horas, entradas, cartel ni descripción, ni toca el cartel de artistas: lo que
la sala aceptó solo lo cambia la sala. Los eventos sin propuesta (scraper,
creados por la sala) mantienen las reglas de edición de siempre. Las funciones
`SECURITY DEFINER` (estas, las de festivales) y los workers no pasan por esas
comprobaciones. `events.ticket_url` lleva un CHECK `^https?://` en modo
`NOT VALID`: vale para toda escritura nueva y no revisa las filas antiguas.

Antes de aplicar la migración `20261028080100` la app crea el evento en
`review` como hasta ahora.

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
