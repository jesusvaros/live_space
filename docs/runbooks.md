# Runbooks

## Alta de Supabase

**Estado del piloto:** proyecto creado en París sobre Free, migraciones aplicadas,
24/24 tablas públicas con RLS y dos Edge Functions desplegadas (las de R2,
`media-r2-sign` y `media-r2-complete`, aún no). El token temporal
usado para el despliegue se revocó y su archivo temporal se eliminó.

1. Crear `live-space-pilot` en una región europea bajo la cuenta propietaria.
2. Guardar la contraseña en el gestor del propietario; no compartirla en chat.
3. Enlazar Supabase CLI y aplicar migraciones desde cero en un entorno vacío.
4. Activar confirmación de email y configurar localhost, dominio público y deep
   links permitidos.
5. Crear el administrador mediante flujo controlado, no importando `auth.users`.
6. Generar tipos TypeScript y ejecutar tests RLS por rol.
7. Guardar `anon` solo donde corresponda y `service_role` únicamente en secretos
   de funciones/workers.

**Verificación:** reset reproducible, cero tablas públicas sin RLS, pruebas verdes
y ausencia de claves privilegiadas en el bundle.

La contraseña generada durante el alta debe rotarse desde el panel y guardarse en
el gestor del propietario. No se considera cerrada la entrega de credenciales
hasta completar esta acción. Las URLs de redirección pública se añaden cuando el
dominio sea definitivo; no se debe usar un comodín de producción.

## Alta de Cloudinary

**Estado del piloto:** el plan Free solo permitió un entorno, por lo que se
reutilizó y renombró el entorno vacío existente como `Live Space Pilot`. Los tres
presets firmados están creados y el webhook `Upload` apunta a la función remota.

1. Usar un entorno dedicado al piloto y credenciales limitadas.
2. Reservar prefijo `live-space/pilot/` con carpetas `users`, `events`, `artists`,
   `venues`, `recovered` y `quarantine`.
3. Crear presets firmados `live_space_user_media`,
   `live_space_professional_media` y `live_space_catalog_media`.
4. Configurar webhook HTTPS y guardar secreto solo en Supabase.
5. Validar transformaciones 720p/thumbnail, MIME, tamaño, firma e idempotencia.
6. Alertar al 60 % y 70 %; pausar nuevas subidas al 80 % de créditos.

**Verificación:** una firma manipulada o caducada falla; un webhook duplicado no
crea otro activo; ningún preset permite subida anónima sin firma.

Cloudinary solo ofreció los roles `Master Admin` o `Media Library User` para la
clave dedicada. Se usó `Master Admin` porque la firma y administración del piloto
requieren acceso API; esta limitación se revisará si el proveedor incorpora un rol
de servicio más granular. La clave no debe reutilizarse fuera del piloto.

## Alta de Cloudflare R2

**Estado:** código listo y desactivado. Sin estos pasos los vídeos siguen en
Cloudinary. Todo lo que es secreto lo pone una persona (a poner por el humano).

1. Cloudflare → R2 → crear el bucket (p. ej. `live-space-media`) con *location
   hint* Europa Occidental. Si se elige jurisdicción UE, poner además
   `R2_JURISDICTION=eu`.
2. Bucket → Settings → *Custom Domains*: conectar un subdominio propio (p. ej.
   `media.<dominio>`). No usar `r2.dev` en producción (tiene límite de
   peticiones). Añadir una regla de caché «Cache Everything» con TTL largo para
   `/v/*`: las claves no se reutilizan. Añadir también una regla de seguridad
   (WAF → Custom rules) que bloquee `starts_with(http.request.uri.path, "/incoming/")`
   en ese dominio: ahí llegan las subidas antes de verificarse.
3. Bucket → Settings → CORS policy (para web y para subidas desde `File` en la app):

   ```json
   [
     {
       "AllowedOrigins": ["https://<dominio-web>", "http://localhost:5173", "https://localhost", "capacitor://localhost"],
       "AllowedMethods": ["PUT", "GET", "HEAD"],
       "AllowedHeaders": ["content-type"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

4. Bucket → Settings → Object lifecycle rules: abortar subidas multipart
   incompletas tras 1 día y borrar los objetos con prefijo `incoming/` tras 2 días.
5. R2 → Manage API tokens → crear token «Object Read & Write» limitado a ese
   bucket. Copiar Access Key ID y Secret Access Key directamente a Supabase.
6. Secretos de las funciones (Supabase → Edge Functions → Secrets o
   `supabase secrets set`): `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
   `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL`
   (`https://media.<dominio>`, sin barra final) y, si aplica, `R2_JURISDICTION`.
7. Aplicar la migración `20261028020100_media_r2_storage.sql` (añade también la
   función `revive_r2_reservation`, solo para `service_role`) y desplegar
   `media-r2-sign` y `media-r2-complete` (`verify_jwt = true`).
8. Activar: como administrador, `update platform_settings set video_provider =
   'r2' where singleton;` (o el secreto `VIDEO_PROVIDER=r2`). Volver atrás es
   poner `cloudinary`; los vídeos ya subidos a R2 siguen funcionando.

**Verificación:** con un usuario de prueba, subir un clip pequeño (PUT único) y
uno de más de 10 MB (multipart) desde Android, iOS y web; comprobar en R2 la
clave `v/<aaaa>/<mm>/<uuid>.mp4`, que el MP4 empieza a reproducirse antes de
descargarse entero, que no lleva GPS (`exiftool`), y en Supabase el
`media_assets` (`storage_provider = 'r2'`, `pending_review`) y el post. Un PUT con
otro tamaño debe fallar con 403 y una reserva ajena debe dar 404.

## Backup semanal

El workflow `backup-weekly.yml` queda inactivo de facto mientras no existan los
secretos `SUPABASE_DB_URL` y `BACKUP_AGE_RECIPIENT`; nunca almacena la identidad
privada de age en GitHub. Al configurarlo se ejecuta los domingos y conserva solo
el dump cifrado y el manifiesto durante 14 días.

1. Exportar esquema y datos de aplicación, excluyendo secretos y binarios.
2. Cifrar el dump antes de sacarlo del runner.
3. Crear manifiesto SHA-256, conteos y versión de migración.
4. Guardar con retención definida y acceso mínimo.
5. Restaurar mensualmente en un entorno descartable y ejecutar reconciliación.

Un backup no está validado hasta haber demostrado una restauración. Fallo de
export, cifrado, subida o prueba genera alerta y no elimina la última copia buena.

## Keepalive de crons

GitHub desactiva los workflows programados de un repositorio público tras 60 días
sin actividad (ocurrió el 21-sep-2026: el scrape no corrió hasta el 25-oct).
`keepalive.yml` llama a la API `enable` de cada workflow programado los días 1 y
15 de cada mes, sin commits ni acciones de terceros, y falla si alguno no queda
`active`. Al añadir un workflow con `schedule`, incluirlo en `WORKFLOWS`.
Comprobación manual: `gh api repos/jesusvaros/live_space/actions/workflows`.

## Web pública (Cloudflare Pages)

La web pública no contiene la app (ver [Web pública y landings](./landing.md)).
`npm run web:prerender` construye el sitio (`site:build`) y genera en `dist-site/` una página
estática por concierto futuro (`/concierto/<slug>-<uuid>/`), sala publicada
(`/sala/…`) y artista con conciertos (`/artista/…`), más
`/{madrid,barcelona}/conciertos/{,hoy/,esta-semana/}` y `/festival/<slug>/`. Cada página lleva title,
description, canonical, Open Graph y JSON-LD (`MusicEvent`, `MusicVenue`,
`MusicGroup`, `ItemList`). También genera `sitemap.xml`, `robots.txt`,
`_redirects` (301 desde las URL con UUID, 302 de las rutas antiguas de la app a
`/`), `404.html` y `_headers`. Solo usa la clave anon. Las fichas son HTML sin
JavaScript; solo la landing y las de festival cargan el bundle del sitio.
Capacitor sigue usando `dist/` y no cambia.

`publish-web.yml` publica tras cada scrape y a las 23:05 UTC; se salta si faltan
los secretos. Alta, una sola vez:

1. Cloudflare → Workers & Pages → crear el proyecto Pages `livespace` (direct upload).
2. Token API con permiso «Cloudflare Pages: Edit».
3. Secretos del repo `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`
   (`VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` ya existen). Con dominio
   propio, variable `PUBLIC_SITE_URL`.
4. Supabase → Auth → URL Configuration: añadir el dominio.
5. Search Console: dar de alta el dominio y enviar `sitemap.xml`. Fijar el
   dominio definitivo antes, para no perder la indexación.
6. Opcionales: variables del repo `VITE_CONTACT_EMAIL` (botón «Pide tu QR») y,
   cuando la app esté publicada, `VITE_ANDROID_URL` y `VITE_IOS_URL`.

## QR de concierto: abrir la app desde la cámara (paso humano)

El QR de cada concierto apunta a `https://<sitio>/upload?qr=<token>`. Hoy, al
escanearlo con la cámara del móvil se abre la web: `/upload` intenta abrir la app
con `com.livespace.app://upload?…` (en Android, automáticamente con una URL
`intent://`; en iPhone, con el botón «Abrir en Live Space») y, si no está
instalada, muestra «Descarga Live Space» y la lista de espera. La app ya
entiende tanto ese esquema como `https://<sitio>/upload` (`uploadDeepLinkPath`).

Para que el QR abra la app directamente, sin pasar por la web, hay que dar de
alta los enlaces verificados una vez fijado el dominio definitivo:

1. **Android App Links.** Publicar `site-public/.well-known/assetlinks.json` con
   el paquete `com.livespace.app` y el SHA-256 del certificado de firma de
   Play (Play Console → Integridad de la app). Añadir en `AndroidManifest.xml`
   un `intent-filter` con `android:autoVerify="true"`, `scheme="https"`, el
   host del dominio y `pathPrefix="/upload"`. Comprobar con
   `adb shell pm get-app-links com.livespace.app`.
2. **iOS Universal Links.** Publicar
   `site-public/.well-known/apple-app-site-association` (sin extensión, JSON,
   `Content-Type: application/json`, añadir la regla en `_headers`) con
   `applinks.details[].appIDs = ["<TEAMID>.com.livespace.app"]` y
   `components: [{ "/": "/upload*" }]`. En Xcode → Signing & Capabilities →
   Associated Domains: `applinks:<dominio>`. Requiere la cuenta de Apple
   Developer.
3. Probar con un QR impreso en ambos sistemas, con la app instalada y sin ella.

## Acceso: Google, Apple y enlaces de email

La pantalla de acceso (`src/pages/Welcome.tsx`) muestra «Continuar con Apple» y
«Continuar con Google» solo si el proveedor está activado en Supabase (lo lee de
`/auth/v1/settings`). En la app, Supabase devuelve al usuario a
`com.livespace.app://auth/callback`, que Android (`AndroidManifest.xml`) e iOS
(`Info.plist`, `CFBundleURLTypes`) abren en la app; `src/app/AuthDeepLinks.tsx`
guarda la sesión. Lo mismo vale para confirmar el email y cambiar la contraseña.

Alta, una sola vez (son secretos: lo hace una persona):

1. Supabase → Auth → URL Configuration → Redirect URLs: añadir
   `com.livespace.app://auth/callback`.
2. Google Cloud Console → APIs y servicios → Credenciales → ID de cliente OAuth
   de tipo «Aplicación web», con URI de redirección
   `https://<proyecto>.supabase.co/auth/v1/callback`. Copiar ID y secreto en
   Supabase → Auth → Providers → Google y activarlo.
3. Apple Developer → Identifiers: activar «Sign in with Apple» en el App ID
   `com.livespace.app`; crear un Services ID con el dominio de Supabase y la
   misma URL de retorno; crear una clave «Sign in with Apple» (.p8). En Supabase
   → Providers → Apple: Services ID como client ID y el secreto generado con la
   clave. El secreto caduca a los 6 meses: anotar la fecha y renovarlo.
4. App Store exige ofrecer Apple si se ofrece Google: activar los dos a la vez.
5. Probar en el emulador o el móvil: entrar con cada proveedor, cerrar sesión,
   confirmar un alta por email y cambiar una contraseña desde el enlace.

## Fuente de scraping rota

1. Suspender autopublicación de la fuente, no las demás.
2. Conservar captura y error sanitizado; no reintentar agresivamente.
3. Comparar con el fixture y comprobar términos/robots.
4. Actualizar parser y fixture en PR con prueba de regresión.
5. Reprocesar staging, revisar diferencias y reactivar tras dos ejecuciones verdes.

## Incorporar una sala descubierta

1. Ejecutar `npm run scrape:auto-probe`; el sondeo prueba agenda, parser y dos
   lecturas deterministas sin activar la fuente.
2. Revisar la muestra guardada en `metadata.autoProbe`, la agenda pública,
   condiciones aplicables y `robots.txt`.
3. Activar solo las fuentes aprobadas con
   `APPROVED_SOURCE_NAMES="Sala A,Sala B" SOURCE_REVIEW_NOTE="..." npm run
   scrape:approve-probed`.
4. Ejecutar `npm run scrape:weekly` y comprobar conteos por fuente en staging.
5. Mantener en revisión los títulos que mezclen artista, festival, género o texto
   promocional; añadir un parser específico antes de automatizar su publicación.

El comando de aprobación falla antes de mutar datos si una fuente no tiene dos
lecturas coherentes o no está marcada como lista para revisión.

## Incidente de media o cuota

1. Pausar firmas nuevas; la lectura pública sigue disponible si es segura.
2. Registrar hora, alcance, proveedor y porcentaje de cuota.
3. Revocar credencial afectada si hay sospecha de filtración.
4. Verificar Cloudinary contra registros Supabase por `public_id` y checksum, y
   R2 por `storage_key` (objetos en `v/` sin `media_assets` son huérfanos).
5. Recuperar huérfanos o marcar faltantes; nunca borrar automáticamente durante
   investigación.
6. Documentar causa y acción preventiva antes de reanudar.

## Incidente de seguridad o moderación

1. Preservar evidencia mínima y restringir acceso.
2. Ocultar contenido de forma reversible cuando exista riesgo inmediato.
3. Revocar sesiones/secretos afectados y revisar auditoría.
4. Notificar al responsable humano; valorar obligaciones legales y a proveedores.
5. Corregir, probar RLS/permisos y restaurar servicio gradualmente.
6. Publicar postmortem interno sin PII.

## Rollback

El frontend vuelve al artefacto anterior. Las migraciones de datos no se revierten
ciegamente: se aplica una migración compensatoria revisada. Los cambios de RLS se
prueban antes y después. Borrado físico, fusiones y moderación irreversible exigen
aprobación humana y backup verificado.

## Correos de autenticación

Las plantillas con la imagen de Live Space están en `supabase/templates/`
(confirmación, nueva contraseña, enlace mágico, cambio de email e invitación).
En local las carga `supabase/config.toml`. En producción hay que pegarlas a mano
en Dashboard → Authentication → Emails, con estos asuntos:

| Plantilla | Asunto |
| --- | --- |
| Confirm signup → `confirmation.html` | Confirma tu cuenta de Live Space |
| Reset password → `recovery.html` | Tu nueva contraseña de Live Space |
| Magic link → `magic_link.html` | Tu enlace para entrar en Live Space |
| Change email → `email_change.html` | Confirma tu nuevo email en Live Space |
| Invite user → `invite.html` | Te esperan en Live Space |

El servicio de correo que Supabase trae de serie solo envía unos pocos correos
por hora y llega tarde. Antes de abrir el registro al público hay que
configurar un SMTP propio (p. ej. Resend con un dominio verificado) en
Authentication → SMTP Settings; las credenciales las pone una persona.

Si el enlace de confirmación se abre en otro dispositivo, la cuenta queda
confirmada igualmente: la app deja el formulario en «Entrar» con el email
puesto y, al entrar, vuelve a donde estaba la persona (por ejemplo, el concierto
del QR).
