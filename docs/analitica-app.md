# Analítica en la app y la web

Dos cosas distintas:

1. **Eventos de uso de la app** (Android, iOS y la app web): propios, en nuestra Supabase.
2. **Visitas de la web pública** (dist-site en Vercel): Vercel Web Analytics, sin cookies.

Ambas están explicadas en la [Política de privacidad](/legal/privacidad).

## Eventos de uso de la app

Cliente: `@jesusvaros/app-kit/analytics` (el mismo que Lanuki), instanciado en
`src/features/analytics/analytics.ts`.

- La cola y el identificador aleatorio del móvil viven en `localStorage`
  (`live_space.analytics.queue`, `live_space.analytics.device`): como mucho las
  2000 más nuevas.
- Se envían en lotes de 100 a la RPC `public.track_events(p_device uuid, p_events jsonb)`
  8 s después del último evento, al pasar a segundo plano (`pause` de
  `@capacitor/app`, que en la web es la página oculta) y antes de cerrar sesión.
  La cuenta la pone el servidor con el token.
- Si la RPC falla (sin conexión, o la migración aún no está aplicada) los
  eventos se quedan en la cola y salen en el siguiente envío. Nunca se ve un
  error.
- Plataforma `ios` / `android` / `web`; versión `App.getInfo()` en el móvil,
  `__APP_VERSION__` (package.json) en la web; idioma `navigator.language`.
- Sesión nueva tras 30 min en segundo plano.

### Interruptor

Ajustes → Privacidad → **Compartir cómo usas la app**, activado por defecto
(`live_space.analytics_enabled` en el móvil). Apagarlo llama a
`analytics.setEnabled(false)`: borra la cola y deja de registrar y enviar.

### Reglas para las props

Solo valores cerrados, números y tamaños: nada de emails, nombres, coordenadas,
nombres de archivo, URLs, ids de concierto ni texto libre. Los helpers puros de
`src/features/analytics/props.ts` (con tests) hacen el trabajo:
`appScreenName` (ids y slugs fuera de la ruta), `uploadFailureReason` (código del
error, nunca el mensaje), `notificationType`.

### Eventos

| Evento | Props | Dónde |
| --- | --- | --- |
| `app_open` | — | una vez por arranque (`useAppAnalytics`, App.tsx) |
| `screen` | `path` (`/concierto/:id`) | cada cambio de ruta |
| `error` | `message` ≤ 200, `where` | errores no capturados (`captureErrors`) |
| `onboarding_step` | `flow` (`intro` \| `agenda`), `step` | Onboarding, AgendaSetup |
| `onboarding_done` | `flow`, `result` (`skipped`, `signed_up`, `signed_in`, `completed`, `closed`), `step` | Onboarding, AgendaSetup |
| `sign_in_tap` | `provider` (`email` \| `google` \| `apple`) | AuthPanel |
| `sign_in` | `provider`, `mode` (email), `via` (`native` \| `redirect`) | AuthPanel; Google/Apple por página al llegar la sesión (`signInEvents.ts`, AuthContext) |
| `sign_in_failed` | `provider`, `mode` | AuthPanel |
| `sign_in_cancelled` | `provider` | AuthPanel (hoja nativa cancelada) |
| `sign_out` | — | AuthContext.signOut |
| `push_prompt` | `trigger` (`going`, `follow`, `merch`, `settings`), `step` (`explainer` \| `system`) | offer.ts, Ajustes → Notificaciones |
| `push_granted` / `push_denied` | `trigger`, `step` | ídem |
| `notification_tapped` | `type` (`concert_day`…, `moment_nudge`, `concert_alert`), `source` (`push` \| `local`) | PushNotifications, momentNudge, concertAlerts |
| `upload_start` | `kind`, `bytes`, `native` | uploadQueue.enqueue |
| `upload_done` | `kind`, `attempts`, `bytes`, `ms` (de «Publicar» al post), `provider` | uploadQueue |
| `upload_retry` | `kind`, `reason` (código o `manual`), `status`, `attempts`, `provider` | uploadQueue |
| `upload_failed` | `kind`, `reason`, `status`, `attempts`, `permanent`, `bytes`, `provider` | uploadQueue |
| `attendance_mark` | `status` (`going`, `attended`, `none`), `source` (`event`, `suggestion`, `qr`) | EventDetail, attendance.ts |
| `follow` / `unfollow` | `kind` (`artist`, `venue`, `festival`, `profile`, `event`), `count`, `source` | useFollowedSubjects, VenueDetail, FestivalDetail, ProfileDetail, EventDetail (guardar) |
| `suggestion_sent` | `duplicate`, `with_note` | «¿Falta un concierto?» (suggestEventLink.ts) |
| `merch_order_start` | `payment` (`in_app` \| `at_stand`), `lines`, `units` | EventMerchSection |
| `qr_scan` | `source` (`home_button`, `upload_button`, `link`), `valid` | ScanConcertFab, Upload |
| `setlist_proposed` | `status` (`pending` \| `approved`), `songs` | setlistProposals.ts |
| `share_link` | `kind` (`event`, `post`, `wrapped`, `qr_poster`), `method` (`share`, `copy`, `download`) | ShareSheet, Wrapped, EventQr |

La tabla `public.analytics_events`, la RPC, la purga a 13 meses y las funciones
`analytics.*` del panel: [Analíticas](/analiticas).

## Web pública: Vercel Web Analytics

`src/scripts/buildPublicSite.ts` añade a todas las páginas generadas (la
landing y lo que sale de su plantilla —`/upload`, `/vuelta`, festivales—, las
fichas de conciertos, salas, artistas y ciudades, las páginas legales y
`404.html`) el snippet HTML de Vercel (`src/seo/webAnalytics.ts`): sin paquete
npm, sin cookies. Antes de enviar quita la query y el hash de la URL (el token
de subida de un QR, el pedido de `/vuelta`). Los redirect stubs no lo llevan:
redirigen al instante y cuenta la página de destino.

**Paso manual (una vez):** en Vercel, proyecto `livespace` → **Analytics** →
**Enable**. Hasta entonces `/_vercel/insights/script.js` da 404 y no se registra
nada. Hay que volver a desplegar después de activarlo.
