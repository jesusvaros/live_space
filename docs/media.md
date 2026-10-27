# Media, licencias y atribución

## Flujo

El cliente pide a Supabase una reserva y firma efímera, sube directamente al
endpoint de Cloudinary y espera el webhook verificado. El activo nace pendiente;
el cliente nunca recibe el API secret ni firma sus propios parámetros.

| Tipo | Entrada | Entrega del piloto |
| --- | --- | --- |
| Imagen | 10 MB, formatos permitidos | máximo 2048 px, formato/calidad automática |
| Vídeo | 75 MB y 45 s | máximo 720p y thumbnail obligatorio |

Cada usuario dispone de diez reservas de vídeo mensuales. Se avisa al 60 % y 70 %
de cuota global y se bloquean firmas al 80 %. La interfaz `MediaProvider` conserva
independencia frente a Cloudinary.

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
