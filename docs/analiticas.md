# Analíticas

Analítica propia, sin terceros: todo vive en la base de datos de Supabase, en el
esquema `analytics`, y solo se lee con funciones que devuelven agregados (o filas
seudónimas en `user_journey`). Las usan el panel privado y el servidor MCP del
repositorio `apps-analytics`; ninguna pantalla de la app las llama.

El contrato es común a Live Space, Lanuki y cualquier app futura:

| Parte | Dónde | Qué contiene |
| --- | --- | --- |
| **Núcleo genérico** | `supabase/migrations/20261113000100_analytics_core.sql` (copia idéntica en `docs/analytics-core.sql`, la plantilla para apps nuevas) | esquema `analytics`, rol `analytics_reader`, tabla `analytics.excluded_users`, `analytics.timezone()`, ayudantes internos y las funciones compartidas `daily_kpis`, `cohort_retention`, `event_summary`, `funnel`, `user_journey`, `weekly_report`, `list_metrics` |
| **Parte de Live Space** | `supabase/migrations/20261113000200_analytics_live_space.sql` | tabla `public.analytics_events` y `public.track_events()`, purga, cambio en `delete_my_account()`, las vistas que lee el núcleo y los informes propios |

El núcleo no depende de ninguna tabla de la app: solo de `auth.users` y de estas
vistas de `analytics`, que define cada app (pueden crearse antes o después del
núcleo, que las lee al ejecutarse):

| Vista | Columnas | En Live Space |
| --- | --- | --- |
| `raw_events` | `at, received_at, device_id, user_id, session_id, name, props, app_version, platform, language` | `public.analytics_events` |
| `device_users` | `device_id, user_id, first_seen` | primera cuenta que entró en cada dispositivo |
| `activity` | `user_id, at, source` | eventos ∪ escrituras (ver abajo) |
| `activation` | `user_id, activated_at` | primer momento publicado |
| `funnel_steps` | `ord, step, device_id, reached_at` | `app_open → upload_start → sign_in → upload_done` |
| `app_metrics` | `fn, description` | los seis informes de Live Space |

Opcional: `analytics.app_daily_kpis(p_from, p_to)` añade métricas de la app a
`daily_kpis`. Los informes propios de cada app tienen la forma
`(p_from date, p_to date) → (metric text, dimension text, value numeric)`.

Días en `Europe/Madrid` (`analytics.timezone()`). En todas las funciones, una
fecha `null` vale «hoy» en Madrid y un rango `null` son los últimos 30 días (7 en
`scraping_health`). Las cuentas de `analytics.excluded_users` (equipo, pruebas)
no cuentan en nada, ni sus eventos de antes de iniciar sesión en su dispositivo.
Tampoco cuentan las cuentas anónimas de Supabase.

## Eventos de uso

`public.analytics_events`: una fila por cosa que pasa en la app, con el mismo
formato que `public.events` de Lanuki (ADR-157). Cada dispositivo tiene un id
aleatorio (`device_id`) porque los eventos empiezan antes de tener cuenta (QR,
bienvenida); la cuenta (`user_id`) se pone cuando hay sesión y la saca el
servidor del token, nunca el dispositivo. `name` en `snake_case`
(`^[a-z][a-z0-9_]{0,59}$`), `props` objeto JSON de menos de 2 KB. RLS sin
políticas y sin permisos para `anon`/`authenticated`: la app solo escribe con
`track_events`.

`public.track_events(p_device uuid, p_events jsonb) returns int` — lote de un
dispositivo, con o sin sesión (`anon` y `authenticated`). Cada elemento:
`{name, session, at?, props?, v?, platform?, lang?}`. Máximo 100 por llamada (el
resto se ignora); los que tienen nombre o sesión inválidos se descartan; `at` se
limita a los últimos 30 días y nunca al futuro; `props` que no sea objeto queda
`{}`; `v`, `platform` y `lang` se cortan a 40, 20 y 10 caracteres. Unas `props`
de 2 KB o más hacen fallar el lote entero. Devuelve cuántas filas guardó.

Vocabulario: `app_open`, `screen{path}`, `onboarding_step`, `onboarding_done`,
`sign_in_tap`/`sign_in`/`sign_in_failed`/`sign_in_cancelled {provider}`,
`sign_out`, `push_prompt`/`push_granted`/`push_denied`,
`notification_tapped{type}`, `error{message≤200, where}`, `share_link`; y en
Live Space `upload_start`/`upload_done`/`upload_failed`/`upload_retry {kind,
reason, attempts, permanent, bytes, ms}`, `attendance_mark{status}`, `follow`,
`suggestion_sent`, `merch_order_start`, `qr_scan`, `setlist_proposed`. Qué envía el
cliente, desde dónde y con qué props: [Analítica en la app y la web](/analitica-app).

**Retención:** `public.purge_analytics_events(p_keep interval default '13 months')`
borra los eventos más antiguos (nunca menos de 30 días). La lanza cada domingo el
job `purge-analytics` de `.github/workflows/backup-weekly.yml` con
`SUPABASE_DB_URL`; también se puede ejecutar a mano en el SQL Editor. Ni la app ni
el lector pueden llamarla.

**Borrar la cuenta:** `delete_my_account()` deja los eventos (cuentan como
recuentos) pero quita la cuenta (`user_id = null`; la FK también lo hace). El id
del dispositivo es aleatorio y sin la cuenta no lleva a nadie.

## Definiciones

- **Actividad** (`analytics.activity`, para DAU/WAU/MAU y retención): una persona
  está activa un día si ese día hay un evento de uso con su cuenta **o** cualquier
  escritura suya en la app. Mientras no haya eventos, cuenta solo lo segundo:
  momento creado (`posts.created_at`), reserva de subida
  (`media_upload_reservations.created_at`), «Voy/Fui/Me interesa» (último cambio,
  `event_attendance.updated_at`), seguir (`follows.created_at`), guardar un
  concierto (`event_saves`), me gusta (`post_likes`), ver un momento con sesión
  (`post_views.viewed_at` con perfil), dispositivo de avisos registrado o
  refrescado al abrir la app (`push_devices.last_seen_at`), pedido de merch
  (`merch_orders.created_at`), link o setlist propuestos
  (`event_link_suggestions`, `setlist_proposals`) y etiquetas de sala
  (`venue_feedback`). Lo que se borra después (momentos borrados, dejar de seguir,
  dispositivos quitados) deja de contar, así que los días antiguos pueden bajar un
  poco. Solo leer sin sesión no es actividad de usuario (sí sale en eventos por
  dispositivo).
- **Activación** («aha»): primer momento publicado (`posts.status = 'published'`).
  `activated` cuenta, de las altas de un día, cuántas lo consiguieron en sus
  primeros 7 días; los últimos 7 días aún pueden subir.
- **Embudo**: primera vez que cada dispositivo llegó a cada paso. El login va
  antes de terminar la subida porque se pide al publicar.

## Funciones

Todas en `analytics`, `SECURITY DEFINER`, propietario `postgres`,
`search_path ''`. `analytics.list_metrics()` devuelve esta misma lista con su
descripción.

### Núcleo (idénticas en todas las apps)

**`daily_kpis(p_from date, p_to date) → (day date, metric text, value numeric)`**
— formato largo, una fila por día y métrica, máximo 401 días.

| Métrica | Qué es |
| --- | --- |
| `signups`, `signups_email`, `signups_google`, `signups_apple` | cuentas creadas ese día (por primer método de acceso) |
| `dau`, `wau`, `mau` | personas activas ese día / en los 7 / 30 días que acaban ese día |
| `sessions` | sesiones distintas en los eventos |
| `activated` | altas del día que publicaron su primer momento en 7 días |
| `platform_ios`, `platform_android`, `platform_web` | dispositivos con eventos |
| `errors`, `sessions_with_error` | eventos `error` y sesiones con alguno |
| `push_optin_users` | personas con un dispositivo de avisos activo al acabar el día (los dispositivos ya borrados no cuentan) |
| `revenue_cents` | merch cobrado ese día: `paid_cents` (en el puesto) o `total_cents` (en la app) de pedidos pagados o recogidos |
| `posts`, `uploads` | momentos y reservas de subida creados ese día |
| `premium_active`, `trials_started`, `trials_converted` | siempre 0 (sin premium todavía) |

Las seis últimas filas vienen de `analytics.app_daily_kpis` (Live Space).

**`cohort_retention(p_period text default 'week', p_last int default 8) → (cohort date, users int, d1 numeric, d7 numeric, d30 numeric, recurrent int)`**
— cohortes por fecha de alta (`day`, `week` o `month`; las últimas `p_last`,
máximo 104, incluida la actual). `d1`: fracción (0–1) activa el día siguiente al
alta; `d7`: activa algún día entre el 7 y el 13; `d30`: entre el 30 y el 59. Cada
fracción se calcula sobre quienes ya han llegado a esa ventana (`null` si nadie).
`recurrent`: personas activas en 2 o más días distintos después del día de alta.

**`event_summary(p_from date, p_to date, p_breakdown text default 'name') → (bucket text, events int, devices int, users int)`**
— eventos agrupados por `name`, `platform`, `app_version`, `screen` (`props.path`
de los eventos `screen`) o `error` («`props.where`: `props.message`» de los
eventos `error`); top 500. Otro valor da error.

**`funnel(p_from date, p_to date) → (step text, devices int)`** — dispositivos
distintos por paso de `analytics.funnel_steps` cuyo `reached_at` cae en el rango,
en orden. Cada paso se cuenta por separado.

**`user_journey(p_user uuid, p_from timestamptz, p_to timestamptz, p_limit int default 200) → (at timestamptz, name text, props jsonb)`**
— eventos de una persona (incluidos los de su dispositivo antes de entrar) en
orden cronológico: los últimos `p_limit` (máximo 500). Solo las claves `path,
provider, type, kind, reason, attempts, permanent, bytes, ms, status, where,
step, source, screen` de `props`: nunca el texto de los errores, email o nombre.

**`weekly_report(p_week date default null) → (metric text, this_week numeric, last_week numeric, four_weeks_ago numeric)`**
— cada métrica de `daily_kpis` en los 7 días que acaban en `p_week` (hoy si es
`null`), los 7 anteriores y los 7 que acaban 28 días antes. `dau`: media diaria;
`wau`, `mau`, `push_optin_users`, `premium_active`: valor del último día; el
resto: suma.

**`list_metrics() → (fn text, description text)`** — funciones del núcleo más
`analytics.app_metrics`.

### Live Space

Todas `(p_from date, p_to date) → (metric text, dimension text, value numeric)`.

**`upload_health`** — subidas creadas en el rango: `reservations`,
`reservations_consumed`, `expired_unconsumed` por tipo (`image`/`video`);
`reservations_by_provider`; `reservation_asset_rate` por tipo (fracción de
reservas que acabaron en un archivo); `rejected` por motivo; `assets` por
`tipo:estado`; `assets_by_provider`; `bytes_total` y `bytes_p50` por tipo;
`video_duration_seconds` p50/p90; `posts` por origen; `posts_per_day` por día;
`time_to_publish_seconds` p50/p90 (de la reserva al momento); `client_events`
(eventos `upload_*`) por nombre; `client_upload_failed` por motivo.

**`scraping_health`** — en el rango (por defecto 7 días): `runs` por estado,
`runs_with_published_events`, `run_errors` (10 mensajes más repetidos),
`staging` por `review_status`, `staging_errors` (top 10), `discovery_runs` por
estado. Ahora: `sources_active`, `stale_sources` (activas sin éxito en 48 h),
`stale_source_hours` por fuente, `health_score_avg`/`health_score_min`,
`open_alerts` por `tipo:severidad`, `watch_state` por estado.

**`content_report`** — conciertos publicados que empiezan en el rango:
`concerts`, `concerts_with_moments`, `moments_per_concert` p50/p90/max,
`moments` por origen, `attendance` por estado, `concerts_with_setlist`,
`posters` (`with_image`, `mirrored`, `mirror_coverage` 0–1). Además
`poster_mirrors` por estado (total), `post_views` y `likes` del rango.

**`notifications_report`** — en el rango: `sent` por tipo, `recipients`,
`tapped` por tipo (eventos `notification_tapped`), `push_permission` por evento
(`push_prompt`/`push_granted`/`push_denied`). Ahora: `push_devices_active` por
plataforma, `push_devices_disabled`, `preference_off` por interruptor (`all` = el
general).

**`merch_report`** — pedidos creados en el rango: `orders` por estado y
`orders_by_method` por forma de pago, `buyers`, `sellers`, `concerts`; de los
pagados en el rango: `paid_cents` por forma de pago, `fee_cents`, `units`,
`top_items` (10 más vendidos); `client_events` `merch_order_start`.

**`suggestions_report`** — creado en el rango: `link_suggestions` por estado,
`link_hosts` (top 10), `setlist_proposals` por estado, `setlist_review_hours`
p50, `concert_proposals` por `revisor:estado`, `entity_claims` por estado,
`venue_feedback`, `client_events` (`suggestion_sent`, `setlist_proposed`).

## El rol lector

`analytics_reader` se crea **sin login**. Solo tiene `USAGE` en el esquema
`analytics` y `EXECUTE` en las funciones de arriba: no puede leer ninguna tabla
ni vista (ni de `public`, `auth` o `storage`, ni siquiera de `analytics`), ni
llamar a los ayudantes internos, ni a `track_events` o la purga. Tiene
`statement_timeout` de 30 s. (Como cualquier rol, podría ejecutar las RPC de
`public` abiertas a todo el mundo, las mismas que puede llamar cualquiera con la
clave anónima.)

Para activarlo (lo hace el propietario, nunca se guarda la contraseña en el
repositorio, GitHub, Vercel ni el chat):

1. En Supabase → SQL Editor:

   ```sql
   alter role analytics_reader with login password 'UNA_CONTRASEÑA_LARGA';
   ```

2. Cadena de conexión por el *session pooler* (Supabase → Connect → Session
   pooler; la región sale ahí):

   ```text
   postgresql://analytics_reader.<project_ref>:<contraseña>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require
   ```

   Va como variable de entorno `LIVESPACE_ANALYTICS_DB_URL` en Vercel (panel) y
   en `~/.config/apps-analytics/.env` (MCP).

3. Prueba: `select * from analytics.list_metrics();`

Para desactivarlo: `alter role analytics_reader nologin;` (o cambiar la
contraseña).

Cuentas del equipo fuera de las métricas (SQL Editor):

```sql
insert into analytics.excluded_users (user_id, note) values ('UUID', 'equipo');
```

## Una app nueva

Copiar `docs/analytics-core.sql` tal cual como migración, crear la tabla de
eventos y `track_events` (las secciones 1–2 de la migración de Live Space sirven
de modelo) y definir las seis vistas de la tabla de arriba; opcionalmente
`app_daily_kpis` y los informes propios con la forma común.

## Pruebas

`supabase/tests/analytics.sql` contra una base desechable con todas las
migraciones (instrucciones en el propio archivo): siembra personas, subidas,
eventos y merch; comprueba cada función, la exclusión del equipo, la validación
de `track_events` (nombres, más de 100, `props` grandes, fechas), que `anon`
puede llamar a `track_events`, que `analytics_reader` llama a las funciones pero
no lee `public.profiles`, `auth.users`, `storage.objects` ni
`public.analytics_events`, la purga y el borrado de cuenta.
