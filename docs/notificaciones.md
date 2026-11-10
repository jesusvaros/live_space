# Notificaciones

Recibir push en Android (FCM) con `@jesusvaros/app-kit/push` (v0.3.0) y
enviarlos cada hora desde GitHub Actions con la cuenta de servicio de FCM
(`src/scripts/sendNotifications.ts`, ver [Envío](#envío)).

## Cuándo se pide el permiso

Nunca al abrir la app. Solo justo después de algo que un aviso hace útil
(`src/features/notifications/offer.ts`):

| Acción | Disparador | Hoja |
| --- | --- | --- |
| «Voy» o guardar un concierto | `going` | «¿Te avisamos el día del concierto?» |
| Seguir artista, sala o festival | `follow` | «¿Te avisamos cuando anuncien conciertos?» |
| Reservar merch | `merch` | «¿Te avisamos para recoger tu pedido?» |

- Permiso ya concedido → se registra el token sin enseñar nada.
- Sin decidir → primero nuestra hoja («Sí, avísame» / «Ahora no»); solo «Sí»
  abre el diálogo del sistema (en Android 13+, `POST_NOTIFICATIONS`).
- «Ahora no» → no se vuelve a ofrecer en 14 días (`live_space.push.declined_at`).
- Denegado, interruptor general apagado, web o una hoja ya abierta → nada.
- Desde Ajustes → Notificaciones se puede pedir directamente («Permitir
  notificaciones») o, si está denegado, abrir los ajustes del sistema (plugin
  local `AppSettings`, Android).

El mismo permiso cubre las notificaciones locales (nuevos conciertos de lo que
sigues, «¿Subes lo de anoche?»), que ya no lo piden por su cuenta y respetan los
interruptores de Ajustes. En un dispositivo con token guardado las envía el
servidor y la app deja de programarlas (ver
[Push del servidor y avisos locales](#push-del-servidor-y-avisos-locales)).

## Token

`src/features/notifications/pushDevice.ts`:

- Al entrar (o abrir la app con sesión) con permiso → `register()` →
  `register_push_device(p_token, p_platform, p_app_version, p_locale, p_timezone)`.
- FCM renueva el token → se guarda el nuevo y se borra el anterior.
- Al cerrar sesión, antes de `signOut` → `unregister_push_device(p_token)`.
- iOS: no pide token (sin APNs todavía). Sí pide el permiso, para las locales.

Toque en una notificación → `data.route` si empieza por `/event/`,
`/concierto/`, `/tabs/`, `/pedidos/`, `/sala/` o `/artista/`; si no, nada. Con la
app abierta el sistema no enseña nada (`presentationOptions: []`) y la app pone
un toast.

## Datos (migración `20261110080100_push_notifications.sql`)

- `push_devices`: `profile_id`, `platform`, `token` (único), `app_version`,
  `locale`, `timezone`, `created_at`, `last_seen_at`, `disabled_at`. La persona
  lee y borra sus filas; escribe con las RPC. Máximo 10 por persona.
- `notification_preferences`: `enabled`, `concert_day`, `upload_reminder`,
  `merch_pickup`, `new_moments`, `followed_new_concert`, `quiet_start` /
  `quiet_end` (hora local, 23:00–09:00), `daily_limit` (3). Sin fila = valores
  por defecto.
- `notifications_sent`: `profile_id`, `type`, `dedupe_key` (único por persona),
  `sent_at`, `payload`. Solo `service_role`.

Todo cae en cascada desde `profiles`; `delete_my_account()` además lo borra
explícitamente (`20261110080200_delete_my_account_push.sql`).

## Envío

`src/scripts/sendNotifications.ts` (módulos puros en `src/notifications/`),
lanzado por `.github/workflows/send-notifications.yml` a las :07 de cada hora
con `--apply`. Sin Edge Functions ni dependencias nuevas: el token OAuth sale
de un JWT RS256 firmado con `node:crypto` (`fcm.ts`).

### Avisos

Todas las horas se leen en la zona horaria del dispositivo visto más
recientemente (`push_devices.timezone`, si no `Europe/Madrid`). Un concierto
pertenece a la noche en que empieza, restando 6 h (uno a las 00:30 es de la
noche anterior).

| Tipo | Cuándo | Ventana local | Título · cuerpo | Abre | Canal |
| --- | --- | --- | --- | --- | --- |
| `merch_pickup` | Día del concierto con un pedido `reserved`/`paid` sin recoger | 12:00–22:00, hasta que acaba | «Recoge tu pedido en el puesto: código K7Q2» · «Hoy, en Morat · La Riviera.» (punto de recogida si lo hay) | `/pedidos/<id>` | `merch` |
| `concert_day` | Día de un concierto con «Voy» (`going`) | 12:00–18:00, antes de empezar | «Hoy: Morat en La Riviera a las 21:30» · «Que lo disfrutes. Si grabas algo, luego lo subes en un momento.» | `/event/<id>` | `conciertos` |
| `upload_reminder` | Mañana siguiente a un concierto `going`/`attended` sin nada subido (ni post ni media suya) | 10:00–14:00 | «¿Grabaste algo de Morat? Súbelo» · «Tus fotos y vídeos de anoche en La Riviera, en un par de toques.» | `/tabs/upload?event=<id>` | `momentos` |
| `followed_new_concert` | Un artista, sala o festival que sigues anuncia concierto | 10:00–21:00 | Uno: «Morat anuncia concierto en Madrid el sábado 12 de diciembre» · «En La Riviera. Toca para verlo.» Varios: «3 conciertos nuevos de lo que sigues» · «Morat, Rels B.» | `/event/<id>` o `/tabs/events` | `conciertos` |

`new_moments` queda para un paso posterior (por eventos, no programado).

Conciertos nuevos de lo que sigues: publicados y futuros, anunciados
(`coalesce(published_at, created_at)`) en las últimas 48 h **y** después del
follow **y** después del primer dispositivo activo de la persona (instalar la
app o seguir a alguien nunca inunda el móvil), que no tenga ya con «Voy» y que
no se le haya anunciado (los `event_ids` de sus `followed_new_concert` de los
últimos 14 días). Salas y festivales cuentan siempre; los de un artista solo en
sus ciudades: `profiles.primary_city` o, si no hay, las 3 ciudades donde más
conciertos ha marcado; sin ninguna, en cualquier sitio.

### Reglas por persona (`policy.ts`)

En orden: sin dispositivo activo → nada · interruptor general · interruptor del
tipo · `dedupe_key` ya en `notifications_sent` · fuera de la ventana del tipo ·
horas de silencio (`quiet_start`–`quiet_end`, rangos que cruzan la medianoche;
iguales = sin silencio) · el concierto ya empezó/acabó · `daily_limit` (envíos
de las últimas 24 h, sin contar los fallidos) · **uno por persona y pasada**: si
tocan dos (merch y concierto el mismo día), el segundo sale en la hora
siguiente. Prioridad: `merch_pickup` > `concert_day` > `upload_reminder` >
`followed_new_concert`. Sin fila de preferencias = valores por defecto.

Claves: `concert_day:<event>`, `upload_reminder:<event>`,
`merch_pickup:<order>`, `followed_new_concert:<event>` o
`followed_new_concert:batch:<hash de los ids>`.

### Envío y fallos

1. `insert into notifications_sent … on conflict (profile_id, dedupe_key) do nothing returning id`
   **antes** de enviar (payload con `status: 'pending'`); sin fila → otra pasada
   ya lo tiene.
2. FCM HTTP v1 a cada token activo (4 a la vez): `notification`, `data.route`
   (+ `data.type`), `android.priority` (`HIGH` para merch y día del concierto),
   `android.ttl`, `android.notification.channel_id`, `icon: ic_stat_live_space`,
   `tag` = la clave (un reintento sustituye, no apila).
3. Por token: `UNREGISTERED`/404, `SENDER_ID_MISMATCH` o `INVALID_ARGUMENT`
   sobre el token → `push_devices.disabled_at = now()` (registrarlo otra vez lo
   reactiva). 429/5xx/red → hasta 3 reintentos con backoff (respeta
   `Retry-After`). 401 → renueva el token OAuth una vez. Otro `INVALID_ARGUMENT`
   (fallo nuestro en el mensaje) no toca el dispositivo.
4. La fila:
   - algún dispositivo lo recibió → `status: 'sent'`;
   - nada entregado pero algún fallo transitorio → **se borra**, y la pasada de
     la hora siguiente lo reintenta mientras siga dentro de la ventana;
   - todos fallaron de forma definitiva → se queda con `status: 'failed'` (no se
     reintenta nunca y no cuenta para `daily_limit`).

### Push del servidor y avisos locales

Regla única, por dispositivo: **si este dispositivo tiene su token guardado en
`push_devices`, el servidor manda «¿Subes lo de anoche?» y «Nuevo concierto de…»
y la app deja de programar sus equivalentes locales**
(`src/shared/notifications/serverPush.ts`; la marca se pone al guardar el token
y se quita al fallar o al cerrar sesión). Sin token (iOS hasta tener APNs, la
web, un registro fallido) siguen las locales. Así nada llega dos veces al mismo
móvil, el servidor sabe si ya subiste algo desde cualquier dispositivo y las
preferencias y el `daily_limit` se aplican en un solo sitio. Se pierde en
Android el recuento de la galería («Hemos encontrado 14 vídeos…»), que solo
puede hacer el móvil; el aviso del servidor abre la subida del concierto.
`concert_day` y `merch_pickup` no tienen equivalente local.

### Ejecutar

```sh
npm run notifications:send                         # dry run: por tipo, recuento + 5 ejemplos
npm run notifications:send -- --only=concert_day   # un tipo
npm run notifications:send -- --profile=<uuid>     # una persona
npm run notifications:send -- --apply --limit=50   # enviar (FIREBASE_SERVICE_ACCOUNT)
```

El dry run solo lee. Los ejemplos llevan el perfil recortado (`abcd…`).

### Probarlo en tu cuenta

GitHub → Actions → «Send push notifications» → «Run workflow»:

- `profile`: tu uuid de perfil (Supabase → `profiles`).
- `only`: el tipo que quieras o `all`.
- `dry_run`: déjalo marcado para ver qué saldría; desmárcalo para enviarlo.

Solo sale si hay algo que toque de verdad (p. ej. marca «Voy» en un concierto
de hoy y lánzalo entre las 12:00 y las 18:00 para `concert_day`). Cada aviso se
envía una vez por clave: para repetirlo, borra su fila de `notifications_sent`.

## Probar en el móvil

1. Ajustes → Acerca de → tocar «Versión» 7 veces (o en un build de desarrollo
   ya está) → «Ver token de notificaciones» → «Copiar».
2. Firebase console → Messaging → «New campaign» → Notifications → «Send test
   message» → pegar el token. Para probar el toque, en «Additional options»
   añadir el dato personalizado `route` = `/tabs/events`.
3. Con la app en segundo plano llega al sistema (icono y color de Live Space);
   con la app abierta, como toast.
