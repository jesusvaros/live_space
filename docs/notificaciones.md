# Notificaciones

Recibir push en Android (FCM) con `@jesusvaros/app-kit/push` (v0.3.0). El envío
(un job programado de GitHub Actions con la cuenta de servicio de FCM) es el
siguiente paso; los datos ya están preparados para él.

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
interruptores de Ajustes.

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

## Para el envío (pendiente)

Por cada aviso candidato, con la service role:

1. Preferencias: `coalesce` con los valores por defecto; `enabled` y el tipo.
2. Horas de silencio en la `timezone` del dispositivo (rangos que cruzan la
   medianoche: `start > end`; `start = end` = sin silencio).
3. `daily_limit`: `count(*)` en `notifications_sent` de las últimas 24 h.
4. `insert into notifications_sent … on conflict (profile_id, dedupe_key) do nothing returning id`;
   si no devuelve fila, ya se envió.
5. FCM HTTP v1 a cada `push_devices` con `disabled_at is null`:
   `notification { title, body }`, `data { route }`,
   `android.notification.channel_id` = `conciertos` | `momentos` | `merch`.
   Respuesta `UNREGISTERED` / `INVALID_ARGUMENT` → `disabled_at = now()`.

## Probar en el móvil

1. Ajustes → Acerca de → tocar «Versión» 7 veces (o en un build de desarrollo
   ya está) → «Ver token de notificaciones» → «Copiar».
2. Firebase console → Messaging → «New campaign» → Notifications → «Send test
   message» → pegar el token. Para probar el toque, en «Additional options»
   añadir el dato personalizado `route` = `/tabs/events`.
3. Con la app en segundo plano llega al sistema (icono y color de Live Space);
   con la app abierta, como toast.
