# Backend de Live Space

Esta carpeta es la fuente de verdad del backend nuevo. Los SQL históricos de la raíz sirven únicamente como referencia y **no deben aplicarse** al proyecto remoto.

## Contenido

- `migrations/20260717000100_initial_schema.sql`: esquema canónico de identidad, catálogo, agenda, social, media, profesionales, ingesta y moderación.
- `migrations/20260717000200_security_and_uploads.sql`: RLS, permisos y reserva atómica de subidas.
- `functions/cloudinary-sign-upload`: autentica al usuario, aplica cuotas y firma una subida de Cloudinary por diez minutos.
- `functions/cloudinary-webhook`: verifica la firma SHA-256 del webhook, valida los límites y registra el activo de forma idempotente.
- `config.toml`: configuración local, confirmación de correo y deep link nativo.

## Desarrollo local

Requisitos: Supabase CLI y un runtime Docker compatible.

```bash
supabase start
supabase db reset
supabase db lint --local --fail-on error
cp supabase/functions/.env.example supabase/functions/.env.local
supabase functions serve --env-file supabase/functions/.env.local
```

La configuración local exige confirmar el correo. Inbucket muestra los mensajes en `http://localhost:54324`.

Para probar `cloudinary-sign-upload`, el usuario debe haber aceptado términos (`profiles.terms_accepted_at`) y la petición debe incluir su JWT. La función devuelve los parámetros firmados, los límites y la caducidad; el cliente sube el archivo directamente a Cloudinary.

## Despliegue de Supabase

1. Crear `live-space-pilot` en una región europea desde la cuenta propietaria.
2. Vincular la copia local y revisar el diff antes de enviar migraciones:

   ```bash
   supabase link --project-ref PROJECT_REF
   supabase db push --dry-run
   supabase db push
   ```

3. Configurar secretos sin pegarlos en código, documentación o chat:

   ```bash
   supabase secrets set --env-file supabase/functions/.env.production
   supabase functions deploy cloudinary-sign-upload
   supabase functions deploy cloudinary-webhook --no-verify-jwt
   ```

4. Configurar en Auth las URLs reales de web y los deep links. Crear el primer usuario normalmente y elevarlo a `admin` desde SQL Editor, nunca desde el cliente:

   ```sql
   update public.profiles set app_role = 'admin' where id = 'UUID_DEL_ADMIN';
   ```

`service_role` solo se usa en Edge Functions y workers privados. La aplicación utiliza la clave anónima y RLS.

## Configuración de Cloudinary

Crear tres upload presets **signed** (nunca unsigned):

| Preset | Uso | Restricciones mínimas |
| --- | --- | --- |
| `live_space_user_media` | Fans | imagen ≤10 MB; vídeo ≤75 MB; formatos de imagen/vídeo permitidos explícitamente |
| `live_space_professional_media` | Artistas y salas administrados | mismas restricciones; subida firmada |
| `live_space_catalog_media` | Catálogo con licencia | mismas restricciones; subida firmada |

En los presets:

- Limitar imágenes a 2048 px por lado y generar entrega automática de calidad/formato.
- Limitar la variante pública de vídeo a 720p y generar thumbnail.
- Mantener deshabilitada cualquier subida unsigned.
- No incluir secretos en presets, frontend o variables `VITE_*`.

Registrar un webhook de notificaciones hacia:

```text
https://PROJECT_REF.supabase.co/functions/v1/cloudinary-webhook
```

Cloudinary debe enviar `x-cld-signature` y `x-cld-timestamp`. La función rechaza firmas de más de cinco minutos, `public_id` alterado, tipo incorrecto, imágenes de más de 10 MB y vídeos de más de 75 MB o 45 segundos. Los activos válidos nacen como `pending_review`.

Las carpetas se asignan en el servidor:

```text
live-space/pilot/users/{user_id}
live-space/pilot/users/{user_id}/events/{event_id}
live-space/pilot/artists/{artist_id}
live-space/pilot/venues/{venue_id}
```

Los ficheros recuperados deben cargarse mediante un proceso administrativo separado en `live-space/pilot/recovered`; si no se demuestra propietario, relación y licencia, se quedan en `live-space/pilot/quarantine` y no generan un `media_asset` público.

## Límites y operación

- Diez reservas de vídeo válidas por usuario y mes. La reserva usa un bloqueo transaccional para impedir carreras.
- Vídeo: 75 MB y 45 segundos. Imagen: 10 MB. Entrega pública: máximo 720p.
- `platform_settings.cloudinary_usage_percent >= 80` o `media_uploads_paused = true` detiene nuevas firmas.
- El uso debe actualizarlo un worker privado; se envían avisos operativos al 60 % y 70 % fuera de esta migración.
- El borrado desde el cliente es lógico (`status = 'deleted'`, `deleted_at`); un worker posterior purga Cloudinary tras siete días.
- Los jobs de scraping acceden con `service_role`. Moderadores pueden revisar staging, pero el público no puede leer datos crudos.

## Modelo de permisos

- Anónimo: lectura de perfiles no privados y contenido publicado.
- Usuario: su perfil, relaciones sociales, reportes y contenido propio.
- Profesional: membresía `owner`, `admin` o `editor` para editar artista/sala, agenda y media; `moderator` solo modera la entidad.
- Moderador global: cola de reportes e ingesta.
- Administrador: gestión global mediante acciones auditadas.
- Worker: `service_role`, que no se distribuye al cliente.

Toda modificación futura del backend debe ser una migración nueva. No se reescriben migraciones ya aplicadas y no se hacen cambios manuales remotos sin capturar el SQL equivalente.
