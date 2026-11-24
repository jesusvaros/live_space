# 5 · Onboarding y contenido inicial

## 1. Qué hay hoy

| Pieza | Qué hace |
| --- | --- |
| `src/pages/Onboarding.tsx` | 3 diapositivas con una **foto fija** de fondo y dos líneas de texto: «Lo grabaste. Súbelo.», «Cada vídeo, a su canción.», «Revive el concierto desde todo el público.». No se pueden saltar; solo el paso final de crear cuenta tiene «Ahora no». Mide `onboarding_step` / `onboarding_done` (`flow: intro`). |
| `src/pages/Welcome.tsx` | Pantalla de entrar o crear cuenta (email, Google, Apple). Si llega desde `askForAccount`, muestra el motivo («Para seguir a X…») y «Ahora no» vuelve atrás. Una cuenta nueva pasa por `/empezar` (AgendaSetup: ciudad y gustos, `flow: agenda`). |
| Entrada por QR | Se salta el onboarding: va directa al subidor y pide la cuenta solo al publicar (memoria *onboarding-pendiente*). |
| `SectionIntro` | La «i» de cada sección: la primera vez explica la sección paso a paso, después se puede volver a abrir. Hoy solo la usa el merch. |
| Artistas y salas | **No tienen onboarding.** Después de reclamar el perfil (`ClaimProfile`) caen en `/gestion` sin explicación. El generador de QR del concierto ya existe (`/gestion/evento/:id/qr`, `EventQr.tsx`, póster PNG), pero nadie lo enseña. |

Problema: las diapositivas cuentan la app con fotos de stock, sin enseñarla. Nadie ve el mapa, el merch, la entrada ni el QR antes de usarlos.

## 2. Onboarding nuevo

### Principio

Cada diapositiva es **la app de verdad en miniatura**: componentes reales en modo demo, con datos de ejemplo, que se mueven solos y que se pueden tocar. Nada de capturas estáticas. Vídeo solo donde la cámara del móvil no se puede imitar.

### Fans (4 escenas + cuenta)

| # | Escena (componente real en demo) | Animación | «Pruébalo» |
| --- | --- | --- | --- |
| 1 | **Mapa**: `MapMarkers` / pósters sobre un fondo de mapa estático (imagen, sin MapLibre) | Zoom simulado: los pósters crecen como en el zoom 17–19 | Tocar un póster abre su ficha en mini |
| 2 | **Sube y cae en su canción**: tarjeta de clip + setlist del concierto | El clip «vuela» desde abajo y se coloca en la canción 4 (por la hora de grabación) | Arrastrar el clip; se recoloca solo |
| 3 | **Revívelo con todo el público**: escenario con 3–4 clips en bucle de 3 s (vídeo corto mudo, ≤300 KB, `poster` de respaldo) | Cambia de ángulo cada 2 s | Tocar cambia de ángulo |
| 4 | **Tu noche, resuelta**: píldoras flotantes reales del `ConcertDock` (entrada guardada y código del merch) + `MerchItemCard` | Aparece la reserva → código → píldora flotante | Tocar «Reservar» genera un código de ejemplo |
| 5 | Cuenta (como hoy) | — | — |

- **Saltar:** se mantiene lo acordado. Las escenas no tienen «Saltar», pero son 4 y cada una avanza sola a los ~4 s, así que no bloquean a nadie. La cuenta conserva «Ahora no».
- Con QR se sigue saltando todo; tras la primera subida aparece una mini escena: «Esto es lo que más puedes hacer».
- Que las «i» de `SectionIntro` lleven la misma escena demo de su sección (mapa, merch, entrada, momentos) para que se pueda volver a ver.

### Artistas y salas (tras reclamar el perfil)

Recorrido de 5 pasos en `/gestion`, cada uno con su componente en demo y un botón que lleva a hacerlo de verdad:

1. **Tu perfil público**: `ArtistProfile` / `VenueDetail` con sus datos reales, marcando foto, bio y enlaces → «Completar perfil».
2. **El QR del concierto**: `EventQr` con el póster generado; animación de un móvil que lo escanea y cae en el subidor → «Descargar el QR del próximo concierto».
3. **Lo que sube tu público**: vista por canción de un concierto de ejemplo; demo de ocultar o destacar un clip → enlaza con los flujos de gestión de contenido (otro plan).
4. **Tu merch**: `MerchItemForm` → tarjeta → reserva → código en el puesto → «Crear tu tienda».
5. **Estadísticas** (`GestionEstadisticas`): números de ejemplo animados → qué incluye el plan Pro (enlaza con el plan de precios).

Es una lista de tareas con progreso (0/5); si se cierra, vuelve como tarjeta en `/gestion` hasta completarla.

### Cómo se construye

- **Sin librerías nuevas.** No hay framer-motion ni Lottie en `package.json`. Se usan keyframes de Tailwind (ya existen `fade-up`, `tab-in-*`, `like-burst`) y Web Animations API para las secuencias. Lottie sumaría ~60 KB y obligaría a dibujar las animaciones aparte, desfasadas de la UI real.
- **Modo demo:** `src/features/onboarding/demo/` con datos de ejemplo (como los playgrounds `/dev/merch` y `/dev/perfil`) y un `DemoProvider` que corta las llamadas a Supabase. Los componentes ya reciben datos por props en casi todos los casos: hay que aislar lo que lea `useAuth` o servicios.
- **Escenas:** componente `DemoScene` con `steps: {at: ms, action}`, que se pausa al tocar o cuando la escena no se ve (IntersectionObserver).
- **Rendimiento en Android barato:** solo `transform` y `opacity`; las escenas se cargan bajo demanda (`import()`); el vídeo se precarga solo para la escena siguiente; respetar `prefers-reduced-motion` (frames fijos). Objetivo: <150 KB de JS extra y 60 fps en un Android de gama baja. Medir con `perf:routes`.
- **Playground** `/dev/onboarding` para revisar cada escena con capturas de Playwright.

### Medición (el embudo ya existe)

- Reutilizar `onboarding_step` / `onboarding_done` y añadir `flow: intro_v2 | pro`, `onboarding_try` (`scene`, `action`) cuando alguien toca un «Pruébalo», y `time_on_scene`.
- Embudo: escena 1 → cuenta creada → primera subida o primer «Voy» en 7 días. Comparar con el onboarding v1 (A/B 50/50 durante 2 semanas si hay volumen; si no, antes/después).
- Pro: pasos completados de 5, días hasta el primer QR descargado y hasta el primer producto de merch.

## 3. Plan de contenido: empezar a subir

### Qué hace falta para que la app se vea viva

| Contenido | Fuente | Derechos y cómo |
| --- | --- | --- |
| Conciertos y salas | Scraper (`scrape:weekly`, 18+ fuentes oficiales, workflows `scrape-weekly` y `discover-venues`) | Ya en marcha; revisión de condiciones por fuente (`docs/scraping.md`) |
| Pósters | `posters:mirror` (copia en R2), `enrich:images` | Póster promocional de la propia agenda de la sala: uso informativo enlazando a la fuente; se retira si lo piden |
| Fotos de artistas | `enrich:images`, `enrich:links` | Preferir la foto que suba el propio artista al reclamar el perfil |
| Setlists | `setlists:fallback` | Datos factuales; citar la fuente |
| **Clips del público** (lo esencial) | 1) Nosotros mismos: ir a conciertos y grabar. 2) Fans y amigos con QR. 3) Artistas que suben su material. 4) Clips de redes **solo con permiso del autor**: DM → que lo suban ellos con `/importar` | Nunca descargar vídeos de IG/TikTok/YT (`docs/importar-clips.md`). Cada clip tiene un autor con cuenta y consentimiento en las condiciones |
| Momentos destacados | Selección manual entre lo subido | Moderación según `docs/moderacion.md` |

### Herramientas que ya hay

- Scripts `npm run`: `scrape:*`, `venues:*`, `enrich:*`, `posters:mirror`, `setlists:fallback`, `artists:cleanup`, `media:optimize`, `media:drain-deletions`, `suggestions:import`, `notifications:send`.
- Edge Functions: `media-r2-sign` / `media-r2-complete` (subida), `social-oembed`, `cloudinary-*`, `merch-*`.
- Admin: `/admin` (crear artista o sala, permisos, lista de acceso) y gestión de evento con el QR.
- Contactos: `contact_leads` + `scripts/contacts/findVenueEmails.mjs`.

**Falta:**
- Una **subida de administrador en lote**: varios clips propios de un concierto de golpe, con el autor real asignado. Hoy se sube de uno en uno desde el móvil.
- Una **cola «conciertos de esta semana sin contenido»**: decidir a cuáles ir.
- Un **pack para la sala**: el QR impreso + un texto para redes.

### Rutina semanal (piloto Madrid + Barcelona)

| Día | Tarea |
| --- | --- |
| Lunes | Revisar el scraping (`scrape:triage`), pósters y setlists de la semana. Elegir **3–5 conciertos objetivo** (salas pequeñas, foco del producto). |
| Martes | Mandar a esas salas y artistas el QR del concierto y el pack (uno a uno; contactos de `contact_leads`). |
| Jueves a sábado | Ir a 1–2 conciertos: grabar 10–20 clips por concierto y subirlos esa misma noche, para ver el flujo como un fan. |
| Domingo | Ordenar por canción, destacar los mejores, revisar la moderación. Publicar un resumen en redes que lleve a la app. Mirar las métricas (subidas por concierto, fans por QR). |

Objetivo para las primeras 4 semanas: 15 conciertos con ≥10 clips cada uno y 5 salas que pongan el QR por su cuenta.

## 4. Tareas por orden

| # | Tarea | Tamaño |
| --- | --- | --- |
| 1 | Infra demo: `DemoProvider`, datos de ejemplo, `DemoScene`, `/dev/onboarding` | M |
| 2 | Escenas fan 1–4 con componentes reales + «Pruébalo» | L |
| 3 | 3 clips en bucle comprimidos (≤300 KB) para la escena 3, con su póster de respaldo | S |
| 4 | Sustituir el `Onboarding.tsx` actual (sin saltar, avance solo a ~4 s, cuenta con «Ahora no») + eventos `intro_v2` / `onboarding_try` | M |
| 5 | Mini escena tras la primera subida por QR | S |
| 6 | Recorrido Pro de 5 pasos en `/gestion` con progreso y tarjeta persistente | L |
| 7 | Las «i» de `SectionIntro` en mapa, momentos y entrada, reutilizando las escenas | S |
| 8 | Subida de administrador en lote con autor asignado | M |
| 9 | Cola «conciertos de esta semana sin contenido» en `/admin` | S |
| 10 | Pack de sala (QR + texto) descargable desde `EventQr` | S |
| 11 | Panel del embudo v1 vs v2 y métricas Pro | S |
| 12 | Primeras 4 semanas de la rutina de contenido (operación, no código) | — |
