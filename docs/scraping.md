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

Los parsers operativos cubren JSON-LD, Events Manager, la agenda Schema.org de
Movistar Arena, el catálogo Shopify de Independance Club, la API y taxonomías de
Luz de Gas, la API oficial de The
Events Calendar usada por La Riviera y Jamboree, las tarjetas Elementor de Sala
But, el HTML de Siroco, la agenda de Apolo y el SSR de Nuxt usado por Razzmatazz.
`json-ld-agenda` extrae eventos Schema.org,
incluidos grafos `@graph`, resuelve URLs relativas, conserva el payload y elimina
duplicados por URL canónica. Las webs sin JSON-LD permanecerán inactivas hasta
disponer de un parser y selectores propios; el parser HTML genérico no constituye
por sí solo autorización para activar una fuente.

Estado remoto del 21 de julio de 2026: 268 conciertos publicados, 34 salas y 258
artistas. Veinticinco salas proceden del primer descubrimiento automático con
evidencia fuerte de OpenStreetMap; otras 61 observaciones permanecen como
candidatas. La Riviera aportó 87 conciertos publicados de 88 detectados; el cartel
`Editors + Big Sleep` permanece en revisión por contener varios artistas. Los
candidatos que mezclan promotor, festival o actividad no musical también se
retienen para evitar perfiles falsos. Sala But aportó sus dos próximas fechas y
su parser descarta el histórico ya vencido. Jamboree detectó 192 conciertos:
publicó 121, dejó 55 ambiguos en revisión y rechazó 16 sin artista verificable;
las actividades de discoteca quedan excluidas por categoría.
Movistar Arena detectó 30 conciertos en su listado oficial filtrado: publicó 27
y conservó 3 títulos ambiguos para revisión humana.
Independance Club detectó 11 productos etiquetados como conciertos: publicó 4 y
conservó 7 carteles largos o ambiguos para revisión. Su payload omite los campos
`updated_at` que Shopify modifica durante las lecturas para mantener hashes estables.
Luz de Gas detectó y publicó 15 conciertos futuros. El cruce entre su calendario,
la taxonomía `Concierto` y el recinto `Luz de Gas` excluye fiestas y Sala B.

## Confianza y deduplicación

- `>= 0,95`: autopublicar solo si fecha, sala y artista son coherentes.
- `0,75–0,94`: revisión humana.
- `< 0,75`: retener con motivos visibles.
- Fusión automática: coincidencia única `>= 0,97`; el resto se revisa.
- Una ausencia no cancela; dos ejecuciones consecutivas abren revisión.
- Los eventos pasados se archivan, nunca se borran por el scraper.
- Repetir una ejecución produce los mismos IDs y cero duplicados.

Los factores de puntuación deben ser explicables: identificador externo, URL,
fecha/hora, sala normalizada, localidad, artistas y similitud de título. Nunca se
publica a partir de una puntuación opaca.

## Descubrimiento y ciclo de vida de salas

El workflow `discover-venues.yml` recorre semanalmente 54 ciudades españolas.
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
La primera ejecución real inicializó 351 observaciones; nueve fuentes quedaron
saludables y una agenda vacía quedó degradada con alerta abierta.
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
evidencia de activación. El workflow semanal ejecuta descubrimiento y sondeo; el
watcher diario se ocupa de las fuentes que ya están activas.

La primera captura de las tres fuentes nuevas produjo 51 candidatos: 30 de
Clamores, 18 de Wagon y 3 de Fun House. Cincuenta permanecen en revisión porque
los títulos de algunas tarjetas mezclan artista, género o texto promocional; uno
de Wagon fue rechazado por no contener artista. No se elevó artificialmente la
confianza para publicar datos dudosos.

## Enriquecimiento

MusicBrainz se consulta con caché, User-Agent identificable y máximo una petición
por segundo. Las imágenes provienen solo de Wikimedia Commons con licencia
compatible o press kit con permiso explícito. Se guarda autor, licencia, texto de
atribución, URL y fecha de obtención; si falta, se usa placeholder.
Encontrar un artista en una agenda española no demuestra su nacionalidad: las
altas sin identidad verificada usan `country_code = ZZ` hasta el enriquecimiento.

## Calidad y observabilidad

- Fixture versionado por fuente, sin PII.
- Tests de fechas ambiguas, DST, festivales, múltiples artistas y cancelaciones.
- Métricas: ejecuciones correctas, frescura, precisión muestreada, duplicados,
  candidatos por confianza, revisión pendiente y cambios de estructura.
- Alertar una fuente rota en menos de 24 h; suspender autopublicación de esa fuente.
- Activar una ciudad solo tras 14 días en staging, éxito `>=95 %`, precisión
  muestreada `>=95 %` y duplicados públicos `<2 %`.
