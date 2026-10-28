# Importar clips de Instagram, TikTok y YouTube

La gente ya graba el concierto y lo sube a sus redes. En vez de pedirle que lo
vuelva a subir, Live Space acepta el **enlace**: guarda la URL y los metadatos
oficiales (oEmbed) y reproduce el original con el reproductor de la plataforma.
**Nunca se descarga ni se re-aloja el vídeo**, por las condiciones de uso de las
plataformas y para no gastar cuota de Cloudinary.

## Cómo entra un clip

| Entrada | Plataforma | Dónde |
| --- | --- | --- |
| Hoja de compartir → Live Space | Android | `intent-filter` `ACTION_SEND` `text/plain` en `MainActivity` + `@capgo/capacitor-share-target` → `ShareTargetListener` abre `/importar?url=…` |
| Copiar enlace → «Pegar» | Android, iOS | `/importar` (botón en Subir: «Pegar enlace de Instagram, TikTok o YouTube») |
| Hoja de compartir → Live Space | iOS | **pendiente**: Share Extension (ver abajo) |

Si llega un enlace sin sesión, `/importar` lo guarda en `localStorage` y lo
retoma al iniciar sesión.

## Metadatos (solo oEmbed oficial)

`src/features/socialImport/socialUrl.ts` reconoce el enlace y lo reduce a una URL
canónica por clip (sin `igsh`, `si`, `utm`…), que es la clave de deduplicación.
Después `oembed.ts` pide los metadatos:

1. Edge Function `social-oembed` (requiere sesión). Resuelve los enlaces cortos
   `vm.tiktok.com` (máximo tres redirecciones dentro de tiktok.com) y llama a:
   - YouTube `https://www.youtube.com/oembed` (público);
   - TikTok `https://www.tiktok.com/oembed` (público);
   - Instagram `graph.facebook.com/v21.0/instagram_oembed` con `META_OEMBED_TOKEN`.
     **Sin token devuelve una tarjeta solo-enlace (`degraded: true`)**, nunca un error.
2. Si la función no responde, los endpoints públicos directamente desde el
   dispositivo (en nativo van por CapacitorHttp, sin CORS).
3. Como suelo, una tarjeta solo-enlace con el ID.

La hora de publicación sale del propio ID cuando la plataforma la codifica:
TikTok (los 32 bits altos del ID son segundos Unix) e Instagram (los 41 bits
altos del ID del shortcode son milisegundos desde la época de Instagram).
YouTube no la da por oEmbed: se usa la hora de importación.

El HTML de oEmbed se guarda (`external_embed_html`) pero **no se inyecta nunca**:
`ExternalMomentCard` pinta un `iframe` del reproductor oficial a partir del ID
(`youtube-nocookie.com/embed`, `tiktok.com/player/v1`, `instagram.com/p/…/embed`)
y solo al tocar.

## Etiqueta del concierto y resolución

Cada evento tiene `events.share_tag` único: `LS` + tres letras de la sala (sin
artículos ni «Sala») + día del mes en su zona horaria + desambiguador (B, C, D…,
sin I, O ni S). Ej.: La Riviera el 29 → `#LSRIV29`; el siguiente 29 en La Riviera
→ `#LSRIV29B`. Lo asigna la base de datos (`next_event_share_tag`, trigger al
insertar) y no cambia después: va impreso en el póster QR.

Canción opcional: `#LSRIV29s07` (posición 7 del setlist) o `#cancion7`.

`resolveConcert.ts` decide el concierto en este orden:

1. **Etiqueta** en el texto del post (título/caption de oEmbed o texto compartido).
2. **Hora + nombres**: conciertos que empiezan a ±36 h de la publicación cuyo
   artista, sala o nombre aparece en el texto o el autor («La Riviera»,
   «#lariviera»). Solo decide un ganador claro; un empate pasa al paso 3.
3. **Elegir**: conciertos guardados o asistidos de la persona y los cercanos en
   fecha, un toque; luego la canción del setlist, otro toque. Nunca se escribe.

`match_method` (`tag`, `time_text`, `manual`) queda en el post para moderación.

Para otras pantallas: `getEventTag(event)` y `<EventTagBadge eventId />`
(`src/features/socialImport`). El badge muestra «Etiqueta tus stories con
#LSRIV29» con botón Copiar, o solo la etiqueta con `variant="inline"`.

## Datos y moderación

Migración `20261028040100_social_import.sql` (aditiva):

- `events.share_tag` único, con formato comprobado y backfill determinista
  (por `starts_at, id`, sin tocar `updated_at`).
- `posts.source` (`upload|instagram|tiktok|youtube`), `external_url`,
  `external_id`, `external_embed_html`, `external_author_handle/name/url`,
  `external_thumbnail_url`, `external_published_at`, `match_method`.
  `media_asset_id` pasa a ser opcional: una subida exige asset y una importación
  exige enlace (`posts_source_shape`). El enlace debe ser canónico
  (`posts_external_url_canonical`) y es único (`posts_external_url_key`).
- `allow_reuse` es siempre `false` en una importación (`posts_external_no_reuse`):
  quien importa no es dueño del vídeo y no puede cederlo al artista o la sala.
- RLS: la rama de subida de `posts_create` no cambia; una importación solo puede
  insertarse en `review`. Publicar sigue siendo cosa de moderación.
- `v_event_posts_with_setlist`, `v_post_cards` y `event_moment_buckets*` incluyen
  las importaciones publicadas (como `media_type = 'video'`, `media_url` = enlace).

Las importaciones pasan por la misma cola que las subidas: entran en `review`,
se reportan con `moderation_reports` (`target_type = 'post'`, botón «Reportar» en
la tarjeta) y se deduplican por `external_url`: si el clip ya existe, `/importar`
lo dice en vez de crear otro.

## Configuración

| Secreto | Dónde | Para qué |
| --- | --- | --- |
| `META_OEMBED_TOKEN` | Secrets de la Edge Function | oEmbed de Instagram. Formato `APP_ID\|CLIENT_TOKEN` de una app de Meta con la función «oEmbed Read» aprobada. Opcional |

`supabase functions deploy social-oembed` (con `verify_jwt = true`, ya en
`config.toml`) y `supabase secrets set META_OEMBED_TOKEN=…`.

## Siguiente paso: Share Extension de iOS

Hasta que exista, en iPhone se copia el enlace y se pega en `/importar`. Para
aparecer en la hoja de compartir:

1. Xcode → File → New → Target → Share Extension (`ShareToLiveSpace`), con
   `NSExtensionActivationRule` para `public.url` y `public.plain-text`.
2. App Group compartido (p. ej. `group.com.livespace.app`) en la app y en la
   extensión; `plugins.CapacitorShareTarget.appGroupId` en `capacitor.config.ts`.
3. `ShareViewController` guarda `{ title, texts, files }` en
   `UserDefaults(suiteName:)` con la clave `share-target-data` y abre
   `com.livespace.app://share` (el esquema ya está registrado para auth).
4. El plugin entrega el evento `shareReceived` y `ShareTargetListener` hace el resto.
5. Para el Wrapped, la regla también acepta imágenes (ver [wrapped.md](./wrapped.md)).
