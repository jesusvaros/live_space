# Concert Scraper del piloto

Scraper modular para conciertos en Espana con flujo `scrape_sources -> scrape_runs -> staging_events -> venue_places / artists / events / event_artists`.

## Arquitectura

El pipeline vive en `src/` y se separa por responsabilidad:

```text
src/
  config/env.ts
  db/supabase.ts
  scraping/
    browser.ts
    fetchSource.ts
    parserRegistry.ts
    parsers/
  normalize/
    normalizeText.ts
    normalizeVenue.ts
    normalizeArtist.ts
    normalizeEvent.ts
    aiExtraction.ts
  dedupe/
    dedupeVenue.ts
    dedupeArtist.ts
    dedupeEvent.ts
  pipeline/
    scrapeSources.ts
    processStaging.ts
    upsertVenues.ts
    upsertArtists.ts
    upsertEvents.ts
    upsertEventArtists.ts
  scripts/
    seedSources.ts
    runWeeklyScrape.ts
    processPendingStaging.ts
```

Principios de diseno aplicados:

- `staging` primero, tablas finales despues.
- reglas deterministas por defecto; IA desactivada en produccion.
- deduplicacion conservadora.
- parsers desacoplados por `parser_key`.
- reintentos seguros con `normalized_payload`, `review_status` y `published_event_id`.
- idempotencia por `unique(source_id, raw_hash)`, identidad externa y matching conservador.

## SQL

El esquema canónico es exclusivamente `supabase/migrations/`. Los SQL historicos de
`sql/` no deben aplicarse.

## Variables de entorno

Requeridas:

```bash
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Opcionales:

```bash
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
SCRAPER_CONCURRENCY=3
SCRAPER_TIMEOUT_MS=30000
ENABLE_AI_NORMALIZATION=false
SCRAPER_CITY_ALLOWLIST=Madrid,Barcelona
LOG_LEVEL=info
SCRAPER_ERROR_SCREENSHOT_DIR=tmp/scraper-errors
```

## Ejecucion local

Compilar el scraper:

```bash
npm run scrape:build
```

Semilla inicial de 18 fuentes de Madrid y Barcelona:

```bash
npm run scrape:seed
```

Scrape completo:

```bash
npm run scrape:weekly
```

Procesar solo pendientes de staging:

```bash
npm run scrape:process
```

## GitHub Actions

El workflow `/.github/workflows/scrape-weekly.yml` soporta:

- ejecucion manual con `workflow_dispatch`
- ejecucion diaria mediante cron

Secretos esperados:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

No se requiere ninguna clave de IA para el piloto.

## Parsers iniciales

- `json-ld-agenda`: prioridad para eventos Schema.org en JSON-LD y grafos `@graph`.
- `movistar-arena-agenda`: listado oficial Schema.org filtrado a conciertos; interpreta fecha y hora desde la URL canónica tras la recarga intermedia del sitio.
- `shopify-concerts`: colección pública de productos etiquetados como conciertos; activa para Independance Club y separada de sus sesiones nocturnas.
- `generic-agenda`: parser tolerante para listados HTML genericos.
- `wordpress-generic`: pensado para webs WordPress y layouts tipo The Events Calendar.
- `single-event-page`: para fuentes que exponen un unico evento o landing de detalle.
- `resident-advisor-like`: para directorios/event cards con patrones cercanos a RA.
- `tribe-events-api`: API REST pública de The Events Calendar; activa para La Riviera y Jamboree, con filtro por categoría cuando procede.
- `elementor-agenda`: tarjetas de agenda Elementor; activa para Sala But y filtra fechas pasadas.

Cada fuente puede afinar selectores via `scrape_sources.metadata`, por ejemplo:

```json
{
  "waitForSelector": ".agenda",
  "listItemSelector": ".event-card",
  "titleSelector": "h2 a",
  "dateSelector": "time",
  "linkSelector": "h2 a",
  "artistSelector": ".lineup li",
  "venueSelector": ".venue-name",
  "citySelector": ".city"
}
```

El catálogo piloto mantiene inactivas las fuentes sin parser validado. Para
activar una nueva fuente, registra la revisión y valida una sonda real del parser.
PostgreSQL rechazará la activación si no
existen `terms_reviewed_at` y `metadata.fixtureVerified = true`.

## Normalizacion y dedupe

Orden efectivo de procesamiento:

1. scrape y guardado bruto en `staging_events`
2. normalizacion heuristica
3. decision por confianza: `>= 0.95` autopublica, `0.75-0.94` queda pendiente y `< 0.75` se retiene como rechazado
4. solo los aprobados pasan por dedupe de sala, artistas y evento
5. insercion idempotente de `event_artists`

Reglas principales:

- `venue_places`: `website_url` -> `normalized_name + city` -> fuzzy alto
- `artists`: `normalized_name + country_code` -> fuzzy alto
- `events`: `source_id + source_external_id` -> `venue_place_id + starts_at + normalized_name` -> fuzzy fuerte mismo dia/sala

## Logging y observabilidad

Los logs salen como JSON estructurado e incluyen contexto operativo:

- `sourceId`
- `sourceUrl`
- `parserKey`
- `scrapeRunId`
- `stagingEventId`
- contadores de insercion/actualizacion

## Decisiones documentadas

- La fecha se interpreta en `Europe/Madrid`.
- Si una fecha tiene dia pero no hora, el parser heuristico usa `20:00` como hora por defecto.
- Si falla una publicacion, `processing_error` conserva el diagnostico y el registro aprobado puede reintentarse.
- `events.source_id` referencia `scrape_sources.id`; `source_external_id` conserva la identidad de origen cuando existe.

## TODOs reales

- Afinar selectores por sala en `scrape_sources.metadata` con datos reales de cada web.
- Anadir tests de fixtures HTML por parser.
- Si aparecen conflictos frecuentes de dedupe, mover el matching difuso a SQL/RPC con trigramas y revision manual.
