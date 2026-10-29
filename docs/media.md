# Media, licencias y atribución

## Flujo

El cliente pide a Supabase una reserva y firma efímera, sube directamente al
proveedor y el activo nace `pending_review`; el cliente nunca recibe secretos ni
firma sus propios parámetros. Hay dos almacenes detrás de la interfaz
`MediaProvider` (`src/media`):

| Tipo | Almacén | Entrada | Entrega |
| --- | --- | --- | --- |
| Imagen | Cloudinary | 10 MB, formatos permitidos | máximo 2048 px, formato/calidad automática |
| Vídeo (por defecto) | Cloudinary | 75 MB y 45 s | máximo 720p y thumbnail obligatorio |
| Vídeo con R2 activo | Cloudflare R2 | 75 MB y 45 s; en la app ya comprimido (~15 MB) | MP4 tal cual, póster en Cloudinary |

Cada usuario dispone de diez reservas de vídeo mensuales. Se avisa al 60 % y 70 %
de cuota global y se bloquean firmas al 80 %. Las reglas valen para los dos
almacenes porque los dos pasan por `reserve_media_upload`.

## Vídeo barato: compresión en el móvil + R2

El objetivo es que el público suba muchos clips cortos de conciertos casi sin
coste: el móvil comprime, el archivo va a un almacén sin coste de salida (R2) y
se sirve como MP4 normal, sin transcodificar en servidor.

### 1. Compresión en el dispositivo

Plugin local de Capacitor `LiveSpaceMedia` (sin dependencias de terceros):
`android/app/src/main/java/com/livespace/app/media/` (androidx.media3
Transformer) e `ios/App/App/LiveSpaceMediaPlugin.swift` + `VideoCompressor.swift`
(AVAssetReader/AVAssetWriter). El envoltorio TypeScript está en
`src/media/native/`.

- Salida: H.264 + AAC en MP4, dentro de una caja de 1280×720 (720p en vertical u
  horizontal), ~2,5 Mbps de vídeo y 128 kbps de audio, *faststart* (átomo `moov`
  al principio; en Android además se reordena si hiciera falta).
- Más de 45 s: se recorta desde el principio (`trimmed: true`).
- Devuelve ruta, duración, tamaño, ancho/alto, un JPEG de póster y los
  **metadatos de captura** del original: fecha de creación y GPS (QuickTime/MP4)
  si existen. El archivo comprimido no lleva GPS ni otros metadatos.
- Android: el selector de fotos del sistema puede quitar el GPS del original; en
  ese caso `location` llega `null`.
- Web: no hay transcodificación. Se aplican los límites (75 MB, 45 s medidos con
  `<video>`) y el póster se saca con `<canvas>`.

Constantes en `src/media/limits.ts`.

### 2. Almacenamiento en R2

| Paso | Dónde | Qué hace |
| --- | --- | --- |
| `start` | `media-r2-sign` | mismas comprobaciones que Cloudinary (`reserve_media_upload`: sesión, términos, pausa/80 %, evento, 10 vídeos/mes); valida tipo, tamaño y duración declarada; devuelve un PUT prefirmado (≤ 10 MB) o URLs prefirmadas de partes de 8 MB (multipart) para `v/<aaaa>/<mm>/<uuid>.mp4` |
| subida | cliente → R2 | PUT directo a `incoming/<aaaa>/<mm>/<uuid>.mp4`, prefijo que el dominio público no sirve; `Content-Length` (y `Content-Type` en el PUT único) van firmados, así que R2 rechaza otro tamaño |
| `resume` | `media-r2-sign` | URLs nuevas (caducan en 1 h) para seguir tras reiniciar; hasta 24 h desde la reserva |
| póster | Cloudinary | el cliente sube el fotograma como imagen (sin evento) |
| `complete` | `media-r2-complete` | reclama la reserva, completa el multipart, hace `HEAD` y exige tamaño exacto y tipo; copia el objeto a `v/…` y borra el de `incoming/`; crea el `media_assets` `pending_review` con `storage_provider = 'r2'` y consume la reserva, igual que el webhook de Cloudinary; idempotente |
| `abort` | `media-r2-sign` | cancela si `complete` no la ha reclamado, borra el objeto y libera el hueco de cuota |

- **Tope de almacenamiento (fase de pruebas): nunca más de 10 GB en R2**, lo
  gratuito. `start` suma los bytes de todas las subidas completadas a R2 y de las
  que siguen en curso (últimas 48 h) y, si con el nuevo vídeo se pasaría de
  `R2_MAX_STORED_BYTES` (por defecto 9.000.000.000, 1 GB de margen para subidas
  simultáneas), responde 403 «Uploads paused: storage limit reached» **antes de
  reservar**: no gasta cupo y no cae a Cloudinary. La app lo trata como pausa:
  deja el vídeo en cola y lo reintenta más tarde. Para subir el tope hace falta
  cambiar el secreto a propósito.
- Nada se publica sin pasar por `complete`: lo que se suba y no se confirme se
  queda en `incoming/` y lo borra la regla de ciclo de vida.
- Una reserva caducada solo se reactiva (`resume`/`complete`) si la cuota
  mensual y la pausa global lo permiten, con la misma regla que la RPC.
- R2 no analiza el vídeo: la duración es la que midió el cliente (en la app,
  después de recortar). Se rechaza si supera 45,5 s.
- El póster queda como `media_assets` de imagen sin evento y con
  `attribution.role = 'video_thumbnail'`; `thumbnail_url` del vídeo apunta a él.
- `secure_url` = `R2_PUBLIC_BASE_URL/<clave>`; `cloudinary_public_id` guarda el
  uuid de la reserva (la columna es obligatoria y única).

**Selección del almacén.** `VIDEO_PROVIDER` (secreto de las funciones) manda; si
no está, `platform_settings.video_provider` (`cloudinary` por defecto). R2 solo se
usa si existen los cinco secretos. Cuando no toca R2, `start` responde
`{ provider: "cloudinary" }` sin reservar nada y el cliente usa el flujo de
siempre; si la función no está desplegada, también. Volver a `cloudinary` no
rompe los vídeos ya subidos a R2.

**Secretos (a poner por el humano; nunca en el repo):**

| Secreto | Valor |
| --- | --- |
| `R2_ACCOUNT_ID` | ID de la cuenta de Cloudflare |
| `R2_ACCESS_KEY_ID` | clave del token R2 «Object Read & Write» limitado al bucket |
| `R2_SECRET_ACCESS_KEY` | secreto de ese token |
| `R2_BUCKET` | nombre del bucket |
| `R2_PUBLIC_BASE_URL` | `https://` del dominio público del bucket, sin barra final |
| `R2_JURISDICTION` | opcional: `eu` si el bucket se creó con jurisdicción UE |
| `VIDEO_PROVIDER` | opcional: `r2` o `cloudinary`; si falta, manda `platform_settings` |
| `R2_MAX_STORED_BYTES` | opcional: tope de bytes en R2; por defecto 9.000.000.000 (por debajo de los 10 GB gratis) |

Alta paso a paso en [Runbooks → Alta de Cloudflare R2](./runbooks.md#alta-de-cloudflare-r2).

### 3. Cola de subida en segundo plano

`src/media/uploadQueue.ts` guarda los trabajos en IndexedDB (el `File` en web, la
ruta nativa en la app), comprime, sube por partes con reintentos y espera
exponencial, persiste cada parte terminada y retoma tras reiniciar la app, al
volver la red o al volver la app a primer plano. Opción «solo con wifi»
(`@capacitor/network`). Al terminar crea el post, que se publica al momento (trigger
`publish_uploaded_post`), y
borra los temporales. Es «segundo plano» dentro de la app: si el sistema
suspende la app, la subida sigue al volver.

API (la usan `src/pages/Upload.tsx` con `file` y `src/pages/SuggestedUpload.tsx`
con las rutas de `GalleryScan`):

```ts
import { enqueueMomentUploads, isNativeMediaAvailable, pickMomentVideos } from '../media';

// App: vídeos con el selector nativo, para comprimirlos en el móvil.
const videos = isNativeMediaAvailable() ? await pickMomentVideos(10) : [];
// videos[i]: { path, durationSeconds, sizeBytes, capturedAt, location, ... }

await enqueueMomentUploads([
  ...videos.map((video) => ({
    nativePath: video.path,
    eventId,
    setlistItemId,            // opcional → su canción va a posts.song_id
    // songId,                // o directamente el id de la canción
    capturedAt: video.capturedAt,
  })),
  // Fotos (y vídeos en web) desde <input type="file">:
  ...files.map((file) => ({ file, eventId, capturedAt: momentDate })),
]);
// Devuelve los ids de los trabajos al momento; la pantalla puede cerrarse.
```

- Progreso: `useUploadQueue()` → `{ jobs, summary, wifiOnly, setWifiOnly,
  retry, retryAll, remove, clearFinished }`; `summary.state` es `working`,
  `waiting_wifi`, `waiting_network`, `error`, `done` o `idle`.
- `<UploadProgressPill />` (`src/components/UploadProgressPill.tsx`): píldora
  mínima («Subiendo 2 de 5 · 43 %», «Esperando wifi», «Reintentar»), montada
  arriba en el `AppShell`; montarla es lo que retoma las subidas pendientes al
  abrir la app.
- `nativePath` puede ser foto o vídeo (se deduce del archivo o de `kind`); los
  vídeos se comprimen en el móvil. La licencia de reutilización sale de la
  elección recordada (`allowReuse` para fijarla).
- `enqueueMomentUploads` exige sesión; solo se muestran y suben los trabajos del
  usuario con sesión. Con dos pestañas abiertas sube solo una (Web Locks).

### Coste estimado

Precios públicos de R2: almacenamiento 0,015 $/GB-mes, operaciones de clase A
4,50 $/millón, clase B 0,36 $/millón, **salida gratis**; gratis cada mes 10 GB,
1 M de clase A y 10 M de clase B. Un clip de 45 s sale por ~15 MB (~6 MB uno de
20 s); cada subida son 1–6 operaciones de clase A.

| Volumen | Almacenado al cabo de 12 meses | Coste R2 al mes 12 |
| --- | --- | --- |
| 1.000 clips/mes | ~180 GB | ~2,5 $/mes |
| 10.000 clips/mes | ~1,8 TB | ~27 $/mes |

Las reproducciones no cuestan salida; con caché de Cloudflare en el dominio
público casi no generan operaciones. Los pósters (≈50 KB) siguen en Cloudinary y
apenas consumen créditos. Supabase: 2–3 invocaciones de función por vídeo.

### Pendiente

- Android se probó en emulador (compresión de 1080p/60 s a 720p/45 s y 15 MB,
  `moov` delante, sin GPS, vídeo girado, subida por rangos). Falta un móvil real,
  iOS en dispositivo (compila para simulador; no se ha ejecutado) y la subida
  real a R2 con credenciales.
- Subir el límite de 10 vídeos/mes cuando R2 esté activo (hoy es el mismo).

## Catálogo

Las imágenes de artista/sala deben guardar URL original, autor, licencia,
atribución y momento de captura. Wikimedia Commons y press kits con permiso son
válidos; buscadores y redes sociales no son fuentes de licencia. Sin prueba se usa
placeholder. Los ocho objetos heredados permanecen en cuarentena hasta demostrar
propietario, relación y derechos.

Las fotos de las landings (`site-public/landing/`) son CC0 y su origen está en
`src/landing/photos.ts`; ver [Web pública y landings](./landing.md#fotos-y-licencias).

## Subida sin escribir: momentos sugeridos

La mañana después de un concierto guardado o marcado «Voy», una notificación
local a las 11:00 propone «¿Subes lo de anoche?» y abre `/subir/sugerido?event=…`.
El plugin local `GalleryScan` (`src/media/native/gallery.ts`; Java en
`android/app/.../gallery/`, Swift en `ios/App/App/GalleryScanPlugin.swift`) lista
las fotos y vídeos de la ventana del concierto sin subir nada.
`src/features/moments/matchMoments.ts` los asigna al concierto (sala a ≤ 300 m
si hay GPS; si no, hora + conciertos guardados o con asistencia) y a la canción
(tiempos del setlist o reparto uniforme), con una confianza para cada cosa.

El permiso de galería solo se pide en esa pantalla, tras explicar para qué. El
de notificaciones se pide al pulsar «Voy» o Guardar. Al abrir la app, una
comprobación silenciosa cuenta los clips (si ya hay acceso a la galería) y
sustituye el aviso genérico por «Hemos encontrado N vídeos…», o lo cancela si no
hay nada. Si la app no se abre, el aviso genérico programado hace de respaldo.
La confirmación llama a `enqueueMomentUploads` (`src/media/uploadQueue.ts`).

## Clips importados

Los vídeos de Instagram, TikTok y YouTube no se descargan ni se re-alojan: se
guarda el enlace y los metadatos oEmbed y se reproduce el original. Ver
[Importar clips](./importar-clips.md).
