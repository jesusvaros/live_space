# Moderación

## Antes de beta

- aceptación de términos antes de subir;
- reporte de contenido y de usuario;
- bloqueo entre usuarios;
- ocultación provisional y reversible;
- cola de revisión y respuesta;
- registro auditable de actor, motivo, alcance y momento.

Hecho: aceptación de condiciones al publicar, reporte de momentos (se ocultan
con tres reportes) y bloqueo entre usuarios (ver
[Seguridad → Bloquear a otra persona](./seguridad.md#bloquear-a-otra-persona)).

## Momentos de un concierto (gestores)

Quien gestiona el artista, la sala o el festival de un concierto ve todos sus
momentos en Gestión → concierto → «Momentos» y puede:

- **Ocultar / mostrar** un momento (`set_event_post_hidden`, tabla
  `event_hidden_posts`). Ocultar es reversible y no toca el archivo: el
  momento desaparece para el público (también del perfil público del fan),
  pero su autor lo sigue viendo, igual que los gestores del concierto y el
  staff. Cada cambio queda en `moderation_actions` (`event_hide`/`event_unhide`).
- **Descargar** solo los momentos con licencia de reutilización activa, con
  el crédito en el nombre del archivo y una línea para pegar al publicar.
- Nunca borrar: borrar contenido ajeno solo lo hace un admin desde la cola.

## Cola de reportes (Admin → Reportes)

Momentos reportados, agrupados y ordenados por número de personas que los
reportan. Solo admins (`moderation_queue`, `moderation_decide`):

- **Mantener**: vuelve a publicarse y los reportes se descartan.
- **Ocultar**: pasa a `archived` (reversible) y los reportes se resuelven.
- **Borrar**: borra el momento y pone sus archivos en `media_deletion_queue`
  (pide confirmación; no se puede deshacer).

Todas las decisiones quedan en `moderation_actions` (`queue_keep`,
`queue_hide`, `queue_delete`).

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
