# Scraping e ingesta

## Objetivo del piloto

Poblar agenda, salas y artistas de Madrid y Barcelona usando primero fuentes
oficiales de salas y promotores. Cada una de las 18 fuentes iniciales necesita
revisión de condiciones, parser identificado, fixture real y responsable.

## Pipeline

```text
captura cruda + procedencia
→ parser específico
→ staging inmutable
→ normalización determinista
→ resolución de sala y artistas
→ deduplicación
→ puntuación de confianza
→ publicación o revisión
→ seguimiento de cambios y frescura
```

## Contrato de fuente

Cada fuente registra URL canónica, nombre, tipo, ciudad/país, condiciones de uso,
frecuencia, parser, última validación, estado, tasa de éxito y calidad histórica.
Se prefieren API/JSON-LD, después HTML estático y por último navegador. El fetch
respeta robots, términos, rate limit, backoff, timeout y un User-Agent identificable.

Cada candidato conserva fuente, URL del evento, instante de captura, payload
original o hash, parser/versión y campos extraídos. Las fechas se interpretan en
`Europe/Madrid` y se almacenan con zona horaria.

El catálogo piloto contiene 18 fuentes oficiales versionadas (10 de Madrid y 8
de Barcelona). Trece están operativas: Independance Club, Jamboree, La Riviera,
Luz de Gas, Movistar Arena, Sala Apolo, Sala But, Siroco, Sala El Sol y
Razzmatazz, más Fun House, Sala Clamores y Sala Wagon, incorporadas por el
descubridor nacional. Las demás
se crean con `is_active = false` y
`termsReviewStatus = pending`. La activación se hace individualmente cuando la
revisión está registrada y una sonda real del parser devuelve datos coherentes.
Una restricción de PostgreSQL
impide además guardar `is_active = true` si falta `terms_reviewed_at` o
`metadata.fixtureVerified = true`.

Los parsers operativos cubren JSON-LD, Events Manager, las tarjetas HTML y el
Schema.org de respaldo de Movistar Arena, el catálogo Shopify de Independance
Club, la API y taxonomías de Luz de Gas, la API oficial de The
Events Calendar usada por La Riviera y Jamboree, las tarjetas Elementor de Sala
But, el HTML de Siroco, la agenda de Apolo y el SSR de Nuxt usado por Razzmatazz.
`json-ld-agenda` extrae eventos Schema.org,
incluidos grafos `@graph`, resuelve URLs relativas, conserva el payload y elimina
duplicados por URL canónica. Las webs sin JSON-LD permanecerán inactivas hasta
disponer de un parser y selectores propios; el parser HTML genérico no constituye
por sí solo autorización para activar una fuente.

El 27 de octubre de 2026 se añadieron salas pequeñas de la escena local, que es
el foco del producto: Café La Palma, Sala Galileo Galilei y Gruta 77 en Madrid;
Marula Café, Sidecar y Wolf en Barcelona. Todas tienen agenda pública y su
`robots.txt` lo permite. Sala Villanos se descartó porque su `robots.txt` bloquea
cualquier robot que no sea un buscador. Wurlitzer, Costello, Copérnico,
Heliogàbal, Sala Vol, Upload, Meteoro, Honky Tonk, El Intruso y Bóveda necesitan
un parser propio. El Perro de la Parte de Atrás del Coche solo publica en
Instagram. Las nuevas fuentes entran en la base con `npm run scrape:seed`.

Valencia abre con seis salas de la escena local, todas con agenda propia y
`robots.txt` que lo permite: Loco Club (`json-ld-bill-agenda`, JSON-LD que
reparte los carteles "A + B" en artistas), 16 Toneladas (`sixteen-toneladas-agenda`,
datos Next.js por mes con el line-up ordenado), Black Note Club
(`wix-events-warmup`, eventos de Wix con fecha ISO), Sala Repvblicca
(`repvblicca-agenda`, listado JetEngine con scroll infinito), Jimmy Glass
(`jimmy-glass-agenda`, archivo de Events Manager más el cartel de cada evento) y
Radio City (`radio-city-agenda`, solo noches en directo; las sesiones DJ se
descartan). Se quedaron fuera Sala Moon (dominio aparcado), Wah Wah (cerrada),
Matisse (lista estática sin años), Café Mercedes (sin conciertos publicados),
La Fábrica de Hielo (su `robots.txt` bloquea el calendario) y Spook (club de
techno grande). El detector de antibots ya no confunde un widget Turnstile de
un formulario de contacto (`cf-chl-widget-…`) con una página de desafío.

Estado remoto del 26 de octubre de 2026: 292 conciertos publicados, 133 futuros,
34 salas publicadas y 276 artistas publicados. La captura de verificación leyó
493 entradas de 13 fuentes y terminó con cero errores. Los 13 watchers quedaron
saludables. Fun House, Sala But, Sala El Sol y Razzmatazz se repararon tras sus
cambios de estructura; Movistar Arena volvió a 71 conciertos después de adaptar
su nuevo HTML. Su listado mezcla algunos partidos aunque esté filtrado por
`Conciertos`, por lo que el parser los descarta explícitamente.

## Entradas, precio y hora de fin

`src/normalize/extractOffer.ts` saca del `payload` del parser el enlace de venta
(`website` de tribe-events, `ticketUrl` de Elementor, la página del producto en
Shopify), los precios (`cost_details`, variantes de Shopify, importes en euros
del texto de la tarjeta), `is_free` y `ends_at` (solo duraciones de 30 min a
12 h). `upsertEvent` los guarda en `ticket_url`, `price_tiers`, `is_free` y
`ends_at`; una captura vacía nunca borra un dato anterior. Para eventos ya
publicados: `npm run events:backfill-offers` (simulación; `-- --apply` escribe).
A 26-oct, 154 de 196 eventos recientes tienen enlace de venta; ninguna fuente
activa publica precio salvo Clamores en texto y Shopify en variantes.

## Confianza y deduplicación

- `>= 0,95`: autopublicar solo si fecha, sala y artista son coherentes.
- `0,90–0,94` de fuente con `structuredDataVerified`, `source_event_id`, año
  explícito o fecha estructurada y tipo `concert`: autopublicar
  (`trusted-source-rule`).
- `0,75–0,94`: revisión humana.
- Fecha pasada o título no musical (`liga endesa`, `jornada N`, `cineclub`…):
  rechazar.
- `< 0,75`: retener con motivos visibles.
- Fusión automática: coincidencia única `>= 0,97`; el resto se revisa.
- Una ausencia no cancela; dos ejecuciones consecutivas abren revisión.
- Los eventos pasados se archivan, nunca se borran por el scraper.
- Repetir una ejecución produce los mismos IDs y cero duplicados.

El `raw_hash` de staging cubre solo los campos extraídos, no el `payload` del
parser, para que contadores volátiles no creen una fila por evento y día. Las
fechas sin año se resuelven contra `created_at` de la fila. El procesado pide a
la base solo las filas pendientes sin normalizar o aprobadas, paginando de 1.000
en 1.000.

`npm run scrape:triage` limpia la cola con las reglas R1–R6 (simulación por
defecto; `-- --apply` escribe, `-- --with-r6` incluye R6 y `-- --list` imprime
lo aprobado y lo que queda en revisión): R1 clave ya publicada y R2 copia
antigua de una clave pendiente → `merged`; R3 pasada y R4 no musical →
`rejected`; R5 regla de fuente fiable y R6 sesión o festival de un solo artista
(nunca la serie propia de la sala) → `approved`. Las filas que quedan en revisión
reciben la normalización anclada a su captura.

Los factores de puntuación deben ser explicables: identificador externo, URL,
fecha/hora, sala normalizada, localidad, artistas y similitud de título. Nunca se
publica a partir de una puntuación opaca.

## Descubrimiento y ciclo de vida de salas

Los datos verificados a mano viven en `src/venues/curation.ts` y se aplican con
`npm run venues:curate` (simulación por defecto, `-- --apply` escribe):
dirección, código postal y coordenadas de las salas con scraper, y la lista de
dominios antiguos secuestrados (BarCo, Sala Lemon, El Junco, Taboó, Café
Populart, Wah Wah Club). Esas salas pierden `website_url`, pasan a `review` y su
fuente queda inactiva con `metadata.hijackedDomain`. El descubrimiento de OSM y
los scrapers solo rellenan campos vacíos y nunca guardan un dominio secuestrado.

El workflow `discover-venues.yml` recorre semanalmente 54 ciudades españolas,
repartidas en cinco shards independientes para permanecer dentro del límite de
ejecución.
Obtiene la caja geográfica de cada ciudad, consulta instancias públicas de
Overpass con fallback y conserva el identificador y las etiquetas originales de
OpenStreetMap. La etiqueta `amenity=music_venue`, con nombre y ubicación, tiene
confianza 0,97 y puede crear una sala publicada. `live_music=yes` y los auditorios
se conservan como candidatos hasta cruzarlos con programación oficial.

Si una sala confirmada dispone de web oficial se crea también una fuente inactiva
en la cola de implementación. Nunca se activa solo por descubrimiento: primero se
debe reconocer el motor, localizar la agenda, revisar condiciones y verificar un
fixture. Redes sociales no se convierten en fuentes de scraping.

Cada captura completa pone `consecutive_misses` a cero. Una candidata ausente
durante tres descubrimientos pasa a `inactive_review` y abre una alerta; no se
borra ni se archiva automáticamente. Una respuesta válida sin resultados cuenta
como snapshot; un timeout, error HTTP o respuesta inválida no incrementa ausencias.
Los fallos aislados quedan registrados y se reintentan en la siguiente ejecución;
el job nacional falla si más del 25 % de las ciudades no puede consultarse.

El watcher diario registra una identidad estable por concierto y distingue un
cambio real de una agenda vacía o una caída de conteo superior al 70 %. Dos
ausencias consecutivas en capturas fiables abren revisión. Dos fallos de fuente
consecutivos marcan la fuente como rota. Ninguno cancela eventos automáticamente.
La tarea `scrape:maintenance`, ejecutada incluso cuando una captura falla, cierra
runs de descubrimiento que lleven más de dos horas atascados. También resuelve
alertas cuando la fecha ya pasó o, si la fuente no daba fecha estructurada, tras
30 días de ausencia continuada. Las observaciones pasan a `ended`; no se borran.
La recuperación del 26 de octubre cerró tres runs atascados y 444 alertas
históricas antes de dejar las 13 fuentes activas saludables.
La primera pasada nacional completó 54/54 ciudades en 4 minutos y 9 segundos,
registró 86 observaciones y dejó 19 webs oficiales en cola de parser. Un sondeo
automático posterior localiza enlaces de agenda, prueba motores conocidos y hace
dos lecturas para verificar que el resultado sea reproducible. El primer lote
clasificó 3 fuentes como listas, 15 como necesitadas de parser específico y 1
como no compatible. Después de revisar sus agendas públicas y `robots.txt`, se
activaron Fun House, Sala Clamores y Sala Wagon con el parser reutilizable
`linked-event-cards`.

El comando `npm run scrape:auto-probe` actualiza la clasificación técnica de las
fuentes descubiertas que siguen inactivas. No las activa por sí solo. Tras revisar
una fuente, `APPROVED_SOURCE_NAMES=... SOURCE_REVIEW_NOTE=... npm run
scrape:approve-probed` valida que el sondeo sea reproducible y conserva la
evidencia de activación. El workflow semanal ejecuta el descubrimiento en
paralelo y después el sondeo en un job separado; un error de una web queda
registrado sin abortar las restantes. El watcher diario se ocupa de las fuentes
que ya están activas.

La primera captura de las tres fuentes nuevas produjo 51 candidatos: 30 de
Clamores, 18 de Wagon y 3 de Fun House. Cincuenta permanecen en revisión porque
los títulos de algunas tarjetas mezclan artista, género o texto promocional; uno
de Wagon fue rechazado por no contener artista. No se elevó artificialmente la
confianza para publicar datos dudosos.

## Enriquecimiento

MusicBrainz se consulta con caché, User-Agent identificable y máximo una petición
por segundo.

`npm run enrich:images` (paso diario del workflow) solo rellena imágenes vacías y
nunca pisa una elegida a mano (`image_source = 'manual'`):

- Conciertos: el cartel que publica la propia página del concierto (JSON-LD u
  `og:image`).
- Artistas: foto de Deezer y, si no hay, el cartel de una noche que encabezan o
  tocan solos (`image_source = 'poster'`, que Deezer mejora si aparece después).
  Nunca el de una noche en la que son teloneros.
- Salas: la imagen de compartir de su web oficial, descartando logos, PNG/SVG y
  enlaces de CDN de redes sociales, que caducan.

Por encima de todo eso, las vistas `v_subject_artists` y `v_subject_venues`
ponen como portada la última foto del público con la reutilización permitida
(`posts.allow_reuse`, autor con perfil público) y exponen el crédito en
`avatar_credit` / `cover_credit`; la app lo imprime como «Foto @usuario». Orden:
foto subida al perfil, imagen manual, foto del público, imagen de catálogo o
fuente. Si no hay ninguna, la app dibuja el cartel generado.
Encontrar un artista en una agenda española no demuestra su nacionalidad: las
altas sin identidad verificada usan `country_code = ZZ` hasta el enriquecimiento.

## Setlists de setlist.fm

`npm run setlists:fallback` (paso del workflow diario, `continue-on-error`) busca
en setlist.fm, por artista principal, fecha y ciudad, los conciertos publicados
que acabaron en los últimos tres días y no tienen setlist. Inserta `songs` y
`event_setlist_items` con `source = 'setlistfm'` y `source_url`; nunca actualiza
ni borra, así que un setlist escrito por un gestor (`manual`) no se toca. Respeta
el límite de 2 peticiones/s y la página del evento enlaza «Setlist: setlist.fm»
como exigen sus condiciones. La clave va en el secreto `SETLISTFM_API_KEY`; sin
ella el paso registra una línea y termina. `-- --dry-run` solo registra.

## Calidad y observabilidad

- Fixture versionado por fuente, sin PII.
- Tests de fechas ambiguas, DST, festivales, múltiples artistas y cancelaciones.
- Métricas: ejecuciones correctas, frescura, precisión muestreada, duplicados,
  candidatos por confianza, revisión pendiente y cambios de estructura.
- Alertar una fuente rota en menos de 24 h; suspender autopublicación de esa fuente.
- Activar una ciudad solo tras 14 días en staging, éxito `>=95 %`, precisión
  muestreada `>=95 %` y duplicados públicos `<2 %`.
