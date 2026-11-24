# 2 · Perfiles y gestión para artistas y salas

Auditoría del 24-11-2026 (código en main + consultas de solo lectura a producción).

## 1. Qué hay hoy

| Pieza | Estado | Dónde |
|---|---|---|
| Reclamar perfil (artista/sala/festival) | **Funciona, manual**. 3 pasos; verificación por email del dominio o código `LS-xxxx` en Instagram. El admin aprueba a mano en Admin → Solicitudes. No se envía ningún email: «Te escribiremos» depende de nosotros. | `src/pages/ClaimProfile.tsx`, `src/services/claims.service.ts`, `review_entity_claim()` |
| Reclamaciones en producción | **0 solicitudes, 0 miembros** (`entity_claims`, `entity_memberships` vacías) | — |
| Panel `/gestion` | **Funciona**. Selector de perfil, pestañas Próximos/Pasados, por concierto: Editar · Setlist · Público · QR; propuestas de conciertos, setlists propuestos por fans, resumen de público | `src/pages/Management.tsx`, `src/components/pro/*`, `src/features/community` |
| Editar concierto | **Parcial**: nombre, fecha/hora, enlace de entradas, cartel. Lo que edita el gestor queda bloqueado para el scraper (`manager_locked_fields`). Si la sala aceptó el concierto, el artista no puede cambiarlo. | `EventEditForm.tsx`, `eventManagement.service.ts:updateEvent` |
| Cancelar / aplazar | **Falta**. El enum `publish_status` ya tiene `cancelled`, pero no hay botón, ni aviso a quien marcó «Voy», ni gestión de reservas de merch o entradas guardadas | — |
| Crear concierto | **Funciona** (artista propone en una sala; si la sala tiene gestores decide ella, si no el admin) | `CreateEvent.tsx`, `ConcertProposals.tsx` |
| Setlist | **Funciona**: editor + revisión de propuestas de fans | `SetlistEditor.tsx`, `features/setlist/SetlistProposalsReview.tsx` |
| QR del concierto | **Funciona**: cartel PNG claro/oscuro para imprimir o proyectar, con enlace de subida firmado. Está en `/gestion/evento/:id/qr` (botón «QR» de cada concierto). Sin gestor no hay forma de llegar a él. | `src/pages/EventQr.tsx`, `src/lib/qrPoster.ts` |
| Editar perfil público (foto, bio, enlaces, géneros) | **Falta la pantalla**. `artistService.updateArtist` / `venueService.updateVenue` y la RLS `artists_manage` / `venues_manage` existen, pero solo los usa el admin. | `src/services/artist.service.ts`, `venue.service.ts` |
| Equipo y roles | **Parcial**. Roles `owner/admin/editor/moderator` en BD; solo el admin da o quita acceso (Admin → Dar acceso). El gestor no puede invitar a nadie. | `management.service.ts`, `AdminGrants.tsx` |
| Moderación de clips de fans | **Parcial**. El fan borra o oculta lo suyo; cualquiera reporta (3 reportes → se oculta); bloqueo entre usuarios. **No hay cola de reportes en Admin** y **el artista o la sala no puede ocultar ni borrar clips de su concierto**. | `features/community/ReportMomentButton.tsx`, `features/photos/postCollections.ts`, `docs/moderacion.md` |
| Descargar clips | **Parcial**. En el detalle de un momento, el gestor del artista o la sala del concierto puede descargar si el autor dejó la licencia de reutilización activada (por defecto sí), con o sin crédito. Va bien con Cloudinary; con vídeos en R2 cae al enlace directo y depende del CORS de R2. No hay descarga en bloque por concierto. | `features/community/MomentReuseControls.tsx`, `licence.ts`, `get_moment_licence()` |
| Estadísticas | **Funciona** (`/gestion/estadisticas`, tarjeta Público por concierto) | `GestionEstadisticas.tsx` |
| Tienda de merch | **Construida, sin uso**: alta de vendedor (Stripe), productos, pedidos; 0 `merch_sellers` | `MerchManage.tsx`, `merch-seller` function |

### Datos en producción (solo lectura)

| | Total | Con foto | Con bio | Con enlaces | Con géneros | Con conciertos próximos |
|---|---|---|---|---|---|---|
| Artistas | 2.212 | 1.781 (81 %) | **0** | 609 (28 %) | 1.135 (51 %) | 1.353 |
| Salas | 81 | 25 (31 %) | — (no hay columna bio) | web 61 | capacidad 0 | 42 |

Conciertos próximos: 1.390. Momentos subidos: 5.

## 2. Flujos objetivo (móvil, poco texto)

**Artista o mánager**
1. Le llega el enlace personal → «Reclamar» → verificación (email del dominio o código en Instagram) → aprobado (aviso por email y push).
2. **Mi perfil**: foto, bio corta, enlaces, géneros. Vista previa tal cual la ve un fan.
3. **Conciertos**: lista Próximos/Pasados → por concierto: Editar · Cancelar/Aplazar · Setlist · QR · Momentos · Público.
4. **Momentos del concierto**: cuadrícula → por clip: Ocultar del concierto · Descargar (si hay licencia) · Reportar. «Descargar todos» (zip o lista) para pasados.
5. **Merch**: dar de alta la tienda → productos → pedidos del concierto.
6. **Equipo**: invitar por email → rol (editor/moderador).

**Sala**: igual, y además
- Aceptar o rechazar conciertos propuestos por artistas.
- Datos de la sala: foto, aforo, dirección, web.
- QR permanente de la sala, que lleva siempre al concierto de esa noche.

**Cancelar / aplazar**
- Cancelar: `status = cancelled` y aviso push y email a quien marcó «Voy» o guardó el concierto. Las reservas de merch se liberan (y se reembolsan si estaban pagadas). La ficha queda con la etiqueta «Cancelado» y deja de salir en Inicio y el mapa.
- Aplazar: nueva fecha (misma ficha) y aviso con la fecha nueva; las entradas guardadas siguen asociadas.

## 3. «Perfil listo»: checklist y cómo rellenar en masa

Un artista está listo para escribirle cuando tiene:
- [ ] foto propia (no un cartel) con crédito;
- [ ] bio de 1–2 frases (hoy 0 %);
- [ ] 1+ enlace (Spotify/Instagram/web);
- [ ] géneros;
- [ ] próximos conciertos correctos y con cartel;
- [ ] los 5–10 últimos conciertos pasados (para enseñarle «tu historial»);
- [ ] enlace para reclamar el perfil (`/reclamar/artist/:id`).

Una sala, además: foto de la fachada o la sala, aforo, dirección, web y contacto.

Cómo rellenarlo antes de escribir a nadie:
- **Bio**: script que genere un borrador de 1–2 frases desde Wikipedia, MusicBrainz o la web oficial, que quede en `review` y que un humano apruebe por lotes. Nada publicado sin revisar.
- **Enlaces y géneros**: ya hay `src/pipeline/enrichArtistLinks.ts` y `enrichGenres.ts`; lanzarlos sobre los 1.353 artistas con conciertos próximos primero.
- **Fotos de sala**: recurrir a la web de la sala o a Google Places (las 56 sin foto), con crédito.
- **Aforo**: lo damos nosotros (lista manual de 81 salas) o lo pedimos al reclamar.
- **Prioridad de contacto**: artistas y salas con concierto en los próximos 60 días y con correo en `contact_leads`.
- **Informe** `profiles:readiness` (CSV): qué falta en cada perfil, para trabajar por lotes.

## 4. Derechos y permisos (decidir antes de construir)

- **¿Puede un artista borrar el clip de un fan?** Recomendación: **no borrar, solo ocultar** del concierto y de su perfil. El clip sigue en el perfil del fan. Borrar contenido ajeno solo lo hacemos nosotros, por reporte (derechos, privacidad, ofensivo), con registro en `moderation_actions`. Así lo dice ya `docs/moderacion.md`: los moderadores de entidad no tienen privilegios globales.
- **Ocultar vs. borrar**: ocultar es reversible y queda registrado (quién, cuándo, motivo). El fan ve «Oculto por el artista en su concierto» y puede pedir revisión.
- **Descargar originales de otros**: solo con la licencia de reutilización activa (opt-out del fan al subir), con crédito por defecto y uso promocional del artista o la sala; **sin venta ni cesión a terceros**. Los términos están en `/legal/licencia-momentos`. Si el fan desactiva la licencia, deja de poder descargarse, pero lo ya descargado no se recupera; hay que decirlo.
- **Derechos de la música**: los clips llevan audio con obra protegida. Para el uso del propio artista no hay problema; para la sala, en redes, es responsabilidad suya. Conviene una línea en los términos de gestor.
- **Menores o personas reconocibles** en el clip: cualquiera puede reportar «sale una persona que no quiere salir». Se oculta mientras se revisa.
- **Verificación de identidad**: hoy no se envía ningún email de verificación; para escalar hace falta email transaccional (otro plan).
- **Revisión legal recomendada**: a la licencia de momentos y a los términos para gestores.

## 5. Tareas en orden

| # | Tarea | Tamaño |
|---|---|---|
| 1 | Cola de reportes en Admin (ver, ocultar, restaurar, borrar, con registro) | M |
| 2 | Pantalla «Mi perfil» del gestor: foto, bio, enlaces, géneros (artista); foto, aforo, dirección, web (sala). Columna `bio` en venue_places | M |
| 3 | Cancelar / aplazar concierto + avisos a asistentes + liberar merch | M |
| 4 | «Momentos» por concierto en /gestion: ocultar del concierto (tabla `event_hidden_posts` + RLS `can_manage_event`), descargar uno o todos | M |
| 5 | Arreglar la descarga de vídeos en R2 (CORS del bucket o URL firmada con `Content-Disposition`) | S |
| 6 | Invitar al equipo por email (owner/admin invitan; roles editor y moderador) | M |
| 7 | QR permanente de sala («el concierto de esta noche») | S |
| 8 | Informe `profiles:readiness` + lanzar el enriquecimiento de enlaces y géneros en los 1.353 artistas con conciertos próximos | S |
| 9 | Borradores de bio con revisión humana por lotes | M |
| 10 | Fotos y aforo de las 81 salas | S (manual) |
| 11 | Enlace personal de reclamación en cada correo de contacto (`/reclamar/:tipo/:id`) y aviso de aprobación por email | S (depende del email transaccional) |
| 12 | Términos para gestores y revisión de la licencia | S (legal) |
