# Weekly Concert Scraper

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
- IA solo para ambiguedad real.
- deduplicacion conservadora.
- parsers desacoplados por `parser_key`.
- reintentos seguros porque `staging_events.processed = false` deja el item pendiente.
- idempotencia basada en dedupe y matching por origen externo.

## SQL

Ejecuta estos archivos en este orden:

1. `sql/001_scrape_sources.sql`
2. `sql/002_scrape_runs.sql`
3. `sql/003_staging_events.sql`
4. `sql/004_schema_extensions.sql`

`004_schema_extensions.sql` tambien crea:

- columnas de normalizacion en `artists`, `events`, `venue_places`
- `artist_entity_id` en `event_artists` si no existe
- indice unico para `event_artists(event_id, artist_entity_id)`
- cache `ai_extraction_cache`

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
ENABLE_AI_NORMALIZATION=true
LOG_LEVEL=info
SCRAPER_ERROR_SCREENSHOT_DIR=tmp/scraper-errors
```

## Ejecucion local

Compilar el scraper:

```bash
npm run scrape:build
```

Semilla inicial de fuentes:

```bash
npm run scrape:seed
```

Scrape semanal completo:

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
- ejecucion semanal con cron los lunes a las `04:00 UTC`

Secretos esperados:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`

## Parsers iniciales

- `generic-agenda`: parser tolerante para listados HTML genericos.
- `wordpress-generic`: pensado para webs WordPress y layouts tipo The Events Calendar.
- `single-event-page`: para fuentes que exponen un unico evento o landing de detalle.
- `resident-advisor-like`: para directorios/event cards con patrones cercanos a RA.

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

## Normalizacion y dedupe

Orden efectivo de procesamiento:

1. scrape y guardado bruto en `staging_events`
2. normalizacion heuristica
3. IA si no se detectan artistas, el split es ambiguo, la fecha no parsea o el titulo parece lineup/festival
4. dedupe de venue
5. dedupe de artistas
6. dedupe de evento
7. insercion de `event_artists`

Reglas principales:

- `venue_places`: `source_url` -> `website_url` -> `normalized_name + city` -> fuzzy alto
- `artists`: `normalized_name` -> `aliases` -> fuzzy alto
- `events`: `source_url` -> `external_source + external_source_id` -> `venue_place_id + starts_at + normalized_name` -> fuzzy fuerte mismo dia/sala

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
- Si un `staging_event` falla en el paso final, se marca `normalization_status = 'error'` y `processed = false` para permitir reintento.
- `external_source` de `events` se rellena con `scrape_sources.id` para tener una clave estable por fuente.

## TODOs reales

- Afinar selectores por sala en `scrape_sources.metadata` con datos reales de cada web.
- Anadir tests de fixtures HTML por parser.
- Si aparecen conflictos frecuentes de dedupe, mover el matching difuso a SQL/RPC con trigramas y revision manual.
