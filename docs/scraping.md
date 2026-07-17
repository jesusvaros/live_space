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

## Enriquecimiento

MusicBrainz se consulta con caché, User-Agent identificable y máximo una petición
por segundo. Las imágenes provienen solo de Wikimedia Commons con licencia
compatible o press kit con permiso explícito. Se guarda autor, licencia, texto de
atribución, URL y fecha de obtención; si falta, se usa placeholder.

## Calidad y observabilidad

- Fixture versionado por fuente, sin PII.
- Tests de fechas ambiguas, DST, festivales, múltiples artistas y cancelaciones.
- Métricas: ejecuciones correctas, frescura, precisión muestreada, duplicados,
  candidatos por confianza, revisión pendiente y cambios de estructura.
- Alertar una fuente rota en menos de 24 h; suspender autopublicación de esa fuente.
- Activar una ciudad solo tras 14 días en staging, éxito `>=95 %`, precisión
  muestreada `>=95 %` y duplicados públicos `<2 %`.
