# Importar el Wrapped

El fan comparte la tarjeta de «Tus artistas favoritos» de Spotify Wrapped con
Live Space, la app lee los nombres en el propio móvil, los cruza con el
catálogo de artistas y los sigue de un toque. Seguir ya activa los avisos de
conciertos nuevos (`src/features/alerts/concertAlerts.ts`).

## Entradas

| Camino | Plataforma | Destino |
| --- | --- | --- |
| Spotify → Compartir → Live Space | Android | `/wrapped?imagen=<ruta en caché>` |
| Tarjeta «Importa tu Wrapped» en Explorar (pestaña Artistas, sin búsqueda) | todas | `/wrapped` → «Elegir captura del Wrapped» |
| Hoja de compartir en iPhone | iOS | **pendiente**: la misma Share Extension que `importar-clips.md`, añadiendo `public.image` |

`ShareTargetListener` manda a `/wrapped` cualquier imagen compartida, salvo
que el texto compartido traiga un enlace de Instagram, TikTok o YouTube (eso
sigue yendo a `/importar`). Si no hay sesión, la ruta se guarda y se retoma al
entrar, como en la importación de clips.

## Cómo se leen los nombres

OCR en el dispositivo, sin claves ni servicios de pago; la imagen no se sube.

- **Android**: plugin propio `TextScan`
  (`android/app/src/main/java/com/livespace/app/ocr/TextScanPlugin.java`) con
  ML Kit Text Recognition v2 *unbundled*
  (`com.google.android.gms:play-services-mlkit-text-recognition:19.0.1`). El
  modelo vive en Google Play Services: el APK crece unos cientos de KB y el
  manifiesto pide descargarlo al instalar (`com.google.mlkit.vision.DEPENDENCIES = ocr`).
- **Web e iOS (por ahora)**: `tesseract.js@7.0.0`, cargado bajo demanda (un
  chunk de ~16 KB; el worker, el wasm y el modelo inglés, unos MB, llegan de
  jsDelivr solo la primera vez). Si ML Kit falla en Android (modelo aún
  descargándose, móvil sin Play) también se usa este camino.

`src/features/wrapped/parseWrapped.ts` convierte las líneas en candidatos:
clasifica por el encabezado de encima («Top Artists», «Tus artistas
favoritos»… frente a canciones, minutos o género), quita el número de puesto,
descarta texto de la interfaz (Spotify, Wrapped, contadores) y separa dos
columnas leídas como una sola línea («1 Bad Bunny 1 Flowers»). En Android los
bloques se ordenan por columnas antes (`orderBlocks`).

## Cruce con el catálogo

`src/features/wrapped/matchArtists.ts`, sobre `v_subject_artists`:

1. Exacto por `normalized_name` (`normalizeForMatching`, la misma
   normalización con la que el scraper guarda los artistas).
2. Tolerante solo para nombres de 6+ letras: trae los artistas con las mismas
   tres primeras letras y acepta distancia de edición 1 (2 desde 10 letras),
   ignorando espacios, y solo si hay un único ganador. Los nombres cortos
   («Mora») solo casan exactos.

Se muestran los que casan (con interruptor por artista, todos marcados) y, de
los que no, solo los leídos bajo un encabezado de artistas: «Aún no están en
Live Space». «Seguir a todos» hace una sola inserción (`socialService.followMany`,
`upsert` con `ignoreDuplicates`).

## Compartir el resultado

Al terminar, «Compartir en stories» dibuja una imagen 1080×1920 («Sigo a mis 5
del Wrapped») con un QR a la web (`VITE_PUBLIC_SITE_URL` o
`https://livespace.pages.dev`, con `utm_source=wrapped`). En la app se
comparte con `@capacitor/share` (archivo en la caché, ya cubierta por el
`FileProvider`); en la web con Web Share o, si no hay, se descarga.

## Configuración nativa

**Android** (hecho):
- `intent-filter` `ACTION_SEND` con `image/*` en `MainActivity`.
- `meta-data com.google.mlkit.vision.DEPENDENCIES = ocr`.
- Dependencia de ML Kit en `android/app/build.gradle` (versión en
  `variables.gradle`) y `registerPlugin(TextScanPlugin.class)` en `MainActivity`.
- `npx cap sync android` tras instalar `@capacitor/share`.

**iOS** (pendiente):
- Share Extension (ver `importar-clips.md`) con `NSExtensionActivationRule`
  que incluya imágenes (`NSExtensionActivationSupportsImageWithMaxCount = 1`);
  el `ShareViewController` copia la imagen al App Group y la pasa en `files`.
  `isSharedCachePath` en `src/features/wrapped/sharedImage.ts` solo acepta la
  carpeta `cache/shared_files` de Android: habrá que admitir la ruta del App Group.
- OCR nativo opcional: Vision (`VNRecognizeTextRequest`) en un plugin local
  `TextScan` con la misma firma; mientras tanto se usa tesseract.js. Los
  plugins de ML Kit para Capacitor solo publican CocoaPods y el proyecto iOS
  usa SPM.

## Por qué no la API de Spotify

`GET /me/top/artists` daría la lista exacta, pero una app nueva no puede
abrirla al público: desde abril de 2025 el modo de cuota ampliada solo se
concede a empresas con un servicio lanzado y una base de usuarios grande, y
desde 2026 el modo de desarrollo tiene un tope de usuarios de prueba (y cuota
por cuenta, julio de 2026). Para una campaña del Wrapped haría falta la
aprobación antes de diciembre, sin garantía.

## Pendiente

- Seguir a un artista que aún no está en el catálogo cuando llegue (necesita
  una tabla de seguimientos por nombre; no se ha hecho).
- iOS: Share Extension y OCR con Vision.
- Probar en dispositivo con tarjetas reales del Wrapped 2026 y ajustar los
  encabezados de `parseWrapped.ts` si Spotify cambia el texto.
