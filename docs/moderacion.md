# Moderación

## Antes de beta

- aceptación de términos antes de subir;
- reporte de contenido y de usuario;
- bloqueo entre usuarios;
- ocultación provisional y reversible;
- cola de revisión y respuesta;
- registro auditable de actor, motivo, alcance y momento.

Los reportes no deciden automáticamente una sanción. Reglas deterministas sirven
para priorizar duplicados, volumen, señales técnicas y riesgo; una persona revisa
contexto y derechos. Moderadores de entidad no reciben privilegios globales.

## Estados

`open → reviewing → resolved|dismissed`. El contenido puede pasar por
`review → published|archived`; el rechazo conserva evidencia mínima y restringida.
Bloqueo, retirada temporal y restauración son reversibles. Borrado físico,
expulsión definitiva o comunicación externa requieren aprobación humana.

## Conciertos propuestos

Un concierto que propone un artista en una sala sin gestores entra en `review`
y aparece en la pestaña «Conciertos» del panel de admin, con Aceptar/Rechazar y
motivo opcional. Si la sala tiene gestores, deciden ellos desde su panel. Ver
[Alta de conciertos](./modelo-datos.md#alta-de-conciertos).

## Clips importados

Un clip importado de Instagram, TikTok o YouTube entra en `review` como una
subida, se reporta con el mismo flujo y se deduplica por su enlace canónico. La
cola muestra `match_method` (`tag`, `time_text`, `manual`) para revisar cómo se
asignó el concierto. Ver [Importar clips](./importar-clips.md).
