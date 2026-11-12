# Seguridad y permisos

## Matriz de acceso

| Actor | Lectura | Escritura |
| --- | --- | --- |
| Anónimo | catálogo, eventos y media publicados | ninguna |
| Usuario | lo público y sus datos privados | su perfil, relaciones y contenido |
| Profesional | lo público y entidades asignadas | según rol `owner/admin/editor/moderator` |
| Moderador | colas y evidencia necesarias | decisiones reversibles y auditadas |
| Administrador | administración global justificada | acciones globales auditadas |
| Worker | solo recursos de su tarea | mediante credencial privada mínima |

## Reglas obligatorias

- RLS habilitada en todas las tablas expuestas y política explícita por operación.
- Denegar por defecto: ausencia de política equivale a ausencia de acceso.
- `service_role`, secretos Cloudinary y R2 y contraseñas nunca llegan al bundle ni a
  logs, issues, chat o documentación.
- Firmas de subida con expiración corta, carpeta limitada y parámetros validados.
  Las URLs prefirmadas de R2 caducan en 1 h y firman tamaño (y tipo).
- Webhooks validados criptográficamente, idempotentes y resistentes a repetición.
- Cambios de rol, moderación y fusiones de entidades generan auditoría inmutable.
- Los logs eliminan tokens, email, IP completa y rutas de Storage con UUID.

## Contenido generado por usuarios

Antes de la beta deben existir aceptación de términos, reporte de contenido y
usuario, bloqueo, ocultación provisional, revisión, apelación y SLA interno. El
usuario confirma derechos de subida.

Los momentos se publican al subirlos, sin revisión previa: como alojamiento
actuamos al recibir aviso. Publicar guarda la aceptación de las condiciones
(`profiles.terms_accepted_at`). Cualquiera con cuenta puede reportar un momento
(«Reportar», en `moderation_reports`); con tres personas distintas el trigger
`hide_reported_post` lo pasa a `review` y deja de verse hasta que alguien de
staff lo revise. Una persona solo tiene un reporte abierto por momento. Un recurso de catálogo necesita procedencia,
autor, licencia y atribución; si faltan se usa placeholder.

## Bloquear a otra persona

`user_blocks` (`blocker_id`, `blocked_id`, existe desde la migración inicial) con
la política `blocks_own_all`: cada persona lee, crea y borra solo sus filas. La
app escribe directamente en la tabla (`src/features/blocks/`).

- **Filtro en servidor (el que cuenta):** `posts_read` oculta todo post cuyo autor
  y lector se bloquean en cualquier sentido (`users_block_each_other`). Todas las
  listas de momentos leen `posts` a través de vistas `security_invoker`
  (`v_post_cards`, `v_event_posts_with_setlist`), así que la línea de tiempo del
  concierto, Momentos, los perfiles, salas, artistas y festivales y el detalle de
  un momento ya no los devuelven. `get_moment_licence` también lo comprueba.
- **Filtro en cliente (solo lo ya cargado):** `withoutBlocked` quita al momento lo
  que la pantalla tenía en memoria: `useConcertMoments` (línea de tiempo), `Feed`
  (Momentos) y `PostDetail`/`ProfileDetail` (aviso «Has bloqueado a…»). Tras
  bloquear o desbloquear se invalidan todas las consultas en caché y se borran
  las instantáneas guardadas de artistas, salas y conciertos pasados.
- **Caché en el dispositivo:** lo que es de una cuenta se guarda en IndexedDB con
  su id y se borra al cerrar sesión y al eliminar la cuenta; las listas con
  momentos de otros se guardan por espectador (ver `arquitectura.md`).
- No hay comentarios en la app. Los recuentos agregados (visualizaciones, me
  gusta, cubos de la línea de tiempo) no se filtran.
- UI: «Bloquear a @usuario» en la hoja de opciones del momento (junto a
  «Reportar») y en el perfil de otra persona, con confirmación; sin sesión pide
  entrar. Lista para desbloquear en Ajustes → Privacidad → Usuarios bloqueados.

## Borrar la cuenta

Ajustes → Cuenta → «Eliminar cuenta»: explica qué se borra, pide escribir
`ELIMINAR` y llama a `delete_my_account()` (migración `20261110040100`), que solo
actúa sobre `auth.uid()` y solo la puede ejecutar `authenticated`. Después la app
vuelve a la cartelera y cierra la sesión. Si la función no existe todavía, la app
remite a la petición por email de `/borrar-cuenta`.

La función:

1. Encola en `media_deletion_queue` (solo `service_role`) la clave de cada archivo
   personal de la persona: `storage_key` en R2 o `public_id` en Cloudinary. Los
   carteles que subió como gestora de un artista o sala (`subject_id` no nulo) no
   se encolan: son de la entidad.
2. Anonimiza sus filas de `post_views` (clave aleatoria, sin perfil).
3. Borra sus posts y `media_assets` (son `ON DELETE RESTRICT`), sus membresías y
   reclamaciones, sus datos de notificaciones (`push_devices`,
   `notification_preferences`, `notifications_sent`; migración
   `20261110080200`), los links de conciertos que envió
   (`event_link_suggestions`; migración `20261112000200`; los conciertos
   importados se quedan) y, por último, `auth.users`; el resto cae en cascada desde
   `profiles`/`subjects` (likes, follows en ambos sentidos, guardados, asistencia,
   bloqueos, reportes que envió, etiquetas de sala, ocultos del mapa, reservas) o
   queda a `null` (`created_by`, `reviewed_by`, `merch_orders.buyer_id`).
   `moderation_actions.actor_id` pasa a admitir `null` con `ON DELETE SET NULL`:
   la auditoría se conserva sin la persona.

Artistas, salas y festivales no se borran. El paso «Delete media of deleted
accounts» de `scrape-weekly.yml` (`npm run media:drain-deletions -- --apply`,
`src/scripts/drainMediaDeletions.ts`) borra cada día los objetos de R2 con los
secretos `R2_*` y, si existen `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` y
`CLOUDINARY_API_SECRET` en el repositorio, los de Cloudinary; sin ellos esas filas
esperan. Solo acepta claves `v/<aaaa>/<mm>/<uuid>.<ext>` en R2, reintenta hasta 8
veces y nunca registra a quién pertenecía el archivo.

Prueba local: `supabase/tests/delete_my_account.sql` y
`supabase/tests/event_link_suggestions.sql` contra una base desechable con todas
las migraciones (instrucciones en el propio archivo).

## Backups y datos heredados

Los archivos originales se tratan como datos sensibles: acceso mínimo, copia
verificada por SHA-256 y almacenamiento cifrado. El dump se restaura solo en una
instancia aislada. `auth.*`, sesiones, refresh tokens, contraseñas y MFA nunca se
migran. Los perfiles y objetos antiguos permanecen en cuarentena hasta revisión.

## Pruebas mínimas

- RLS como anónimo, usuario ajeno, propietario, profesional de cada rol,
  moderador, administrador y worker.
- Firma caducada, modificada, reutilizada, MIME falso y exceso de cuota.
- Webhook inválido, duplicado y fuera de orden.
- Intentos de elevar rol, editar otra entidad o consultar cuarentena.
- Escaneo de secretos en cada PR y revisión de dependencias antes de release.
