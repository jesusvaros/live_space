# 6 · Modelo de negocio: qué se puede cobrar, a quién y cómo

## Decisión 24-nov (manda sobre lo de abajo)

- **Fans: gratis ahora.** Subir y ver clips, sin muros.
- **Salas y artistas: gratis** (perfil, equipo, conciertos, QR, cancelar/aplazar, clips, estadísticas, descargas). Más adelante, una **cuota mensual fija** cuando ya tengan clips y público. El Pro de 14,99 € se quita de la app.
- **Suscripción de fan «Live Space+» a 2,99 €/mes** (Play Billing vía RevenueCat, sin web): «Concierto completo» de los artistas que lo autoricen. Preparada y apagada (`FAN_PLUS_ENABLED = false`); se enciende hacia **~1.000 usuarios activos**.
- **Autónomo, sin empresa.** No hace falta para nada de esto.
- **SGAE no hace falta para clips gratis**: como Instagram/TikTok, basta retirar a petición (notice-and-takedown). Solo importaría al cobrar por conciertos enteros, y eso irá con autorización del artista.
- **Merch del artista: pago en el puesto, 0 %.** Pago en la app opcional para cualquiera (sin Pro).
- **Entradas por referidos (25-nov).** Cada concierto lleva a la compra: el enlace oficial de venta (`events.ticket_url`, 526 de 1.375 conciertos futuros) o, si no hay, la página del concierto en la web de la sala (`source_url`), que casi siempre tiene su botón de compra. Todos los toques pasan por `src/features/tickets/ticketLink.ts`, que añade el código de referido del vendedor cuando haya programa firmado (`REFERRALS`; programas en [8-referidos-entradas](./8-referidos-entradas.md)), y quedan medidos (`ticket_tap` con el vendedor) para saber qué programa vale la pena antes de firmar. Vendedores con más conciertos hoy: DICE (114), Moving Tickets (46), Onebox (41), entradas.com (40), Entradium (27). Las cuentas de afiliado las da de alta el dueño.
- **Market de entradas entre fans: más adelante.** Reventa solo a precio original y con la entrada ligada a la persona (como la lista de espera de DICE), nunca especulación. Antes de construir nada, el abogado revisa los límites a la reventa en España (pregunta 13).


Fecha: 24 nov 2026. Solo lectura del repo y búsqueda web; sin cambios en código ni BD. Fuentes verificadas hoy en las páginas oficiales (BOE, EUR-Lex, Google Play Policy Center, SGAE, prensa del sector). Todo lo legal es análisis de producto, **no dictamen jurídico**: las preguntas que debe cerrar un abogado están en §6.

## Resumen en diez líneas

1. **Cobrar al fan por ver «el concierto entero» grabado por otros fans: no, tal cual.** Cada clip es una fijación no autorizada de la actuación (art. 106 TRLPI) más una obra musical sin licencia (SGAE). Enseñarlo gratis ya es el mismo ilícito; cobrar no lo crea, pero multiplica la exposición: convierte a la app en «prestador para compartir contenidos» con fin lucrativo (art. 73 RDL 24/2021), sube la indemnización al «beneficio del infractor» (art. 140 TRLPI), activa el uso comercial del nombre e imagen del artista (art. 7.6 LO 1/1982) y exige una licencia SGAE con mínimo de **340,77 €/mes**. Y el mercado lo confirma: ninguna app de vídeos de fans ha sobrevivido cobrando al fan por ver (Switchcam, Vyclone, Lively, Crowdmix, Bandsintown PLUS, Mandolin).
2. **Sí a la variante «con el artista dentro»:** subir y ver clips sueltos gratis para todos; «Concierto completo» de pago **solo** en conciertos cuyo artista ha reclamado el perfil y ha firmado la autorización (arts. 106-108), con reparto 50/50. Es el modelo de nugs.net y Veeps (acuerdo directo con el artista) trasladado a clips de fans. Fase 3, cuando haya conciertos con 30+ clips.
3. **Lo que sí se puede cobrar ya, sin riesgo de derechos:** merch físico (el dinero es del artista; comisión 8 % en la app, 0 % en el puesto, fuera de Play Billing), festivales y promotoras (landing, QR por escenario, informe: factura), y más adelante **Fan Plus** (archivo propio en HD, descarga, Wrapped ampliado) a 2,99 €/mes, que se vende sobre *lo tuyo*, no sobre lo de otros.
4. **El Pro actual a 14,99 €/mes se aparca**, no se borra: la tabla `subject_plans` y `subject_is_pro()` sirven, pero la pantalla «Hazte Pro» con 0 gestores y 5 clips no vende nada y bloquea el pago in-app del merch (trigger `merch_in_app_requires_pro`), que es justo lo que sí da ingresos.
5. Play: todo lo digital comprado en la app pasa por Play Billing (15 % efectivo en el EEE: 10 % + 5 %) o por el **Billing choice program** (enlace web junto a Play Billing, 10 % sin billing fee, vigente desde 30-jun-2026). Lo físico (merch, entradas) va con Stripe sin comisión de Google.

---

## 1. Por tipo de usuario: qué se le puede cobrar y qué no

### 1.1 Fan

| Concepto | ¿Cobrar? | Razón |
| --- | --- | --- |
| Subir fotos y vídeos | **No, nunca** | Es el gancho del producto (decisión previa). Sin clips no hay nada que vender a nadie. |
| Ver clips sueltos de cualquier concierto | **No** | (a) Derechos: ver §2. (b) Play: sería «contenido digital» → Play Billing 15 %. (c) Mercado: nadie ha conseguido cobrar al fan por ver vídeos de otros fans (§2.3). |
| «Concierto completo» (todos los clips por canción) | **Solo si el artista lo ha autorizado y participa** | Única vía que cierra los derechos de intérprete (arts. 106-108 TRLPI, autorización «por escrito»); los de autor necesitan licencia SGAE aparte (§2.1). |
| Fan Plus: descargar sus propios clips en HD, «Mi noche» exportable, archivo ilimitado, Wrapped ampliado, sin anuncios | **Sí** (fase 2) | Se vende sobre lo que el fan grabó, que es suyo (arts. 120-128 TRLPI). Precedente vivo: Gigs, 2,99 $/mes · 19,99 $/año ([TechCrunch, abr-2026](https://techcrunch.com/2026/04/17/gigs-turns-your-concert-history-into-a-personal-live-music-archive/)). Compra in-app vía Play Billing/RevenueCat. |
| Merch del concierto (pago en la app) | **Sí, ya existe** | Bien físico: Play Billing «must not be used» ([Payments policy §3](https://support.google.com/googleplay/android-developer/answer/9858738)). Stripe Connect, el dinero es del artista. |
| Propinas al artista | Posible | Play lo trata como pago P2P si el 100 % va al creador y no desbloquea nada digital ([FAQ Payments](https://support.google.com/googleplay/android-developer/answer/10281818)). Implica KYC del artista (ya hay Stripe Express). No prioritario. |
| Anuncios | Sí, pero tarde | Play prohíbe interstitiales inesperados, antes del splash o no cerrables en 15 s ([Ads policy](https://support.google.com/googleplay/android-developer/answer/9857753)). Y la publicidad sobre clips con música exige la misma licencia SGAE (sus mínimos para «usuarios comerciales» incluyen «incluya publicidad»). No antes de 10.000 MAU. |
| Entradas | **No** | Decisión previa de posicionamiento; además la afiliación de entradas es el negocio de Songkick/Bandsintown/setlist.fm y requiere acuerdos con ticketeras. |

### 1.2 Artista (incluido mánager)

| Concepto | ¿Cobrar? | Razón |
| --- | --- | --- |
| Reclamar perfil, editar, QR y cartel, setlist, ver y descargar clips con licencia del fan, estadísticas básicas, merch pagado en el puesto | **No** | Es el coste de adquisición. Bandsintown for Artists y Songkick Tourbox son gratis ([Bandsintown](https://help.artists.bandsintown.com/en/articles/7039361-does-bandsintown-for-artists-cost-money-to-use)); nadie paga por gestionar su ficha. |
| Merch pagado en la app | **Comisión 8 %** (Live Space paga Stripe) | El merch es del artista (decisión del usuario). Referencias: Bandcamp 10 % físico ([fees](https://get.bandcamp.help/hc/en-us/articles/23020665520663-What-are-Bandcamp-s-fees)), Patreon 10 % ([pricing](https://www.patreon.com/pricing)), Shopify Starter 5 % + 5 $/mes ([Shopify](https://help.shopify.com/en/manual/intro-to-shopify/pricing-plans/plans-features/shopify-starter-plan)). Con Stripe a 1,5 % + 0,25 € por tarjeta UE ([Stripe España](https://stripe.com/es/pricing)) más 2 €/cuenta activa/mes y 0,25 % + 0,10 € por transferencia (Connect Express, España), 5 % no cubre tickets pequeños: camiseta de 25 € → 8 % = 2,00 € − 0,63 € Stripe ≈ 1,37 € netos. |
| «Concierto completo» de pago | **Reparto 50/50 del neto** | El artista aporta la autorización (lo único que legaliza los clips); sin reparto no firma. nugs.net solo tiene en suscripción los shows cuyos derechos ha cerrado uno a uno ([Hypebot](https://www.hypebot.com/nugsnet-getting-fans-to-put-down-their-phones-a-qa-with-founder-brad-serling-interview/)). |
| Destacar un concierto en Inicio y mapa | **Sí**, por concierto | Servicio digital: si se compra en la app → Play Billing; si se factura a mano → sin CTA de pago en la app (§3). Referencia RA Pro: promoción de pago para promotores ([RA Pro](https://pro.ra.co/promoter)). |
| Pro mensual (estadísticas completas, avisos a seguidores, equipo) | **Aparcar** hasta que haya datos que enseñar | Hoy no hay público que medir. Referencias de SaaS para artistas: Laylo Pro 25 $/mes ([Laylo](https://laylo.com/music)), Linktree Pro 15 $/mes. Si vuelve, 9,99 €/mes, no 14,99 €. |
| Clips del público: ocultar del concierto, reportar, retirar | **No, nunca** | Es su derecho (art. 106 TRLPI y DSA art. 16): cobrarle por retirar su propia actuación es indefendible. |

### 1.3 Sala

| Concepto | ¿Cobrar? | Razón |
| --- | --- | --- |
| Perfil, agenda importada, QR fijo de sala y QR por concierto, cartel, ver clips, público básico | **No** | Las salas pequeñas no pagan por «estar»: son el canal de adquisición de artistas y fans. |
| Merch | **No vende la sala** | Decisión del usuario: el merch es del artista. La sala, como mucho, es el punto de recogida. |
| Destacar conciertos / agenda destacada de la sala | **Sí**, por concierto o pack mensual | Igual que artista. |
| Pro sala (público recurrente, procedencia, estilos que llenan, varios gestores, pantalla con los clips de la noche) | **Fase 3**, 29 €/mes o 290 €/año | Es dato de negocio real, pero solo vale cuando hay 50+ fans por concierto en la app. Las salas facturan y querrán factura con IVA: vender en web/factura, no por Play (§3.4). |
| Pagar a la sala por poner el QR | No pagar | Es tentador para arrancar, pero lo que la sala quiere es contenido para sus redes (licencia de los momentos ya lo da). |

### 1.4 Promotora / festival

| Concepto | ¿Cobrar? | Razón |
| --- | --- | --- |
| Landing del festival, QR por escenario, timetable, muro de clips en pantalla, informe post-evento | **Sí: desde 300 €/edición, factura** | Es B2B puro con presupuesto; se contrata fuera de la app (sin CTA de pago en la app, §3). Ya existe `festival` como tipo de sujeto y landings por festival. |
| Autorización de grabación por el público para todos los artistas del cartel | Condición del contrato, no un cobro | El promotor suele tener en sus contratos la cesión de imagen/grabación de los artistas; es la única forma de que «Concierto completo» exista para un cartel entero sin firmar con cada banda (§6). |

---

## 2. La idea del usuario: subir gratis para todos + suscripción para ver conciertos enteros

### 2.1 Derechos: qué hay encima de cada clip

Un clip de 45 s grabado por un fan lleva **tres capas de derechos** y la app solo controla una:

| Capa | Titular | Qué exige | Fuente |
| --- | --- | --- | --- |
| La grabación (imagen y sonido captados) | El fan: autor o titular de «mera fotografía» (art. 128) y productor de la grabación audiovisual (arts. 120-125) | Su licencia a Live Space ya está en Condiciones y en la Licencia de los momentos | [TRLPI, BOE](https://www.boe.es/buscar/act.php?id=BOE-A-1996-8930) |
| La actuación | El artista intérprete (todos los músicos del escenario) | **Art. 106**: «derecho exclusivo de autorizar la fijación de sus actuaciones. Dicha autorización deberá otorgarse por escrito». Art. 107 reproducción; art. 108.1.b puesta a disposición, también por escrito. Art. 108.3: remuneración equitativa irrenunciable por comunicación pública de grabaciones audiovisuales, gestionada por AIE/AISGE. | Ídem |
| La obra musical | Compositores y editoriales (SGAE en la práctica) | Puesta a disposición (art. 20.2.i): licencia SGAE. Libro de Tarifas 2026, cap. 4, Epígrafe 2 «música a la carta sin descarga, usuarios generalistas»: **15 % de todos los ingresos** (suscripciones, pagos, publicidad) con coeficiente por peso del repertorio, **mínimo 340,77 €/mes hasta 100.000 visitas y 545,26 €/mes por encima**, u Opción 2: **0,60 €/suscriptor/mes**. No hay epígrafe «UGC». | [SGAE Libro de Tarifas 2026 (PDF)](https://documentos-sgae.s3.eu-west-1.amazonaws.com/2026+SGAE+Libro+de+Tarifas+V1.pdf) |

Conclusiones:

- **La fijación nace sin permiso.** Ni la licencia del fan ni la de SGAE la sanan: solo el artista puede autorizarla, por escrito. Si la sala «permite móviles», eso tampoco sustituye al artista ni a SGAE.
- **Gratis y de pago son el mismo ilícito; cambia el daño y la calificación.** Con suscripción: indemnización por «beneficio obtenido por el infractor» (art. 140.2.a TRLPI); uso del nombre e imagen del artista «para fines publicitarios, comerciales o de naturaleza análoga» (art. 7.6 [LO 1/1982](https://www.boe.es/buscar/act.php?id=BOE-A-1982-11196)), excluido de la excepción del art. 8.2.a que cubre fotografiar a un artista en un acto público; y el art. 270 del Código Penal exige precisamente ánimo de beneficio económico.
- **Art. 17 Directiva 2019/790 / art. 73 RDL 24/2021.** Un servicio «cuyo fin principal es almacenar y dar al público acceso a obras [...] cargadas por sus usuarios, que el servicio organiza y promociona con fines lucrativos» es «prestador de servicios para compartir contenidos en línea» (art. 66.6 RDL), realiza él mismo el acto de comunicación pública, **pierde el puerto seguro de la LSSI** (art. 73.3) y debe obtener autorización o demostrar «mayores esfuerzos». Ordenar clips por canción y cobrar por el conjunto es exactamente «organizar y promocionar con fin lucrativo». **Régimen atenuado** (art. 17.6 / art. 73.7): menos de 3 años en la UE, facturación < 10 M€ y < 5 M de visitantes únicos/mes → solo «mayores esfuerzos por obtener una autorización» + retirada expeditiva al ser notificado (sin filtrado tipo Content ID). Cobrar no excluye el régimen atenuado, pero un servicio que monetiza música y nunca ha pedido licencia difícilmente cumple la letra (a). Fuentes: [Directiva 2019/790](https://eur-lex.europa.eu/eli/dir/2019/790/oj/spa), [RDL 24/2021](https://www.boe.es/buscar/act.php?id=BOE-A-2021-17910), [Guía de la Comisión COM(2021) 288](https://eur-lex.europa.eu/legal-content/ES/TXT/?uri=CELEX:52021DC0288). Los tres años cuentan desde que el servicio está disponible: **en 2029 caen las obligaciones plenas**.
- **DSA (Reglamento 2022/2065).** Como microempresa la app está exenta de informes de transparencia, reclamaciones internas del art. 20 y resolución extrajudicial (art. 19.1), pero **sí** debe tener punto de contacto (arts. 11-12), condiciones claras sobre moderación (art. 14), **mecanismo de notificación y acción** para titulares de derechos (art. 16) y **declaración de motivos** al retirar (art. 17). [DSA en EUR-Lex](https://eur-lex.europa.eu/eli/reg/2022/2065/oj/spa). El RDL 24/2021 (art. 73.10-11) exige además reclamación con revisión humana en ≤10 días hábiles. La [Ley 13/2022 General de Comunicación Audiovisual](https://www.boe.es/buscar/act.php?id=BOE-A-2022-11311), arts. 86-94, obliga a inscribir el «servicio de intercambio de vídeos a través de plataforma» en el registro de la CNMC.
- **Precedente directo:** TJUE C-682/18 y C-683/18, YouTube/Cyando (2021), sobre **grabaciones de fans de conciertos de Sarah Brightman**: la plataforma no comunica al público salvo que «contribuya, más allá de la mera puesta a disposición», p. ej. si selecciona contenidos o «adopta un modelo económico que incentive a los usuarios a comunicar ilegalmente» ([comunicado CURIA](https://curia.europa.eu/jcms/upload/docs/application/pdf/2021-06/cp210108es.pdf)). Y eso era bajo el régimen antiguo, más benigno que el art. 17.
- **Derecho de imagen del público:** quien sale de fondo es «accesorio» (art. 8.2.c); un primer plano identificable de un asistente no está amparado y, si es menor, protección reforzada. Las Condiciones ya lo piden; falta canal de retirada por imagen/RGPD.

### 2.2 Cómo lo resuelven los comparables

| Plataforma | Qué cobra y a quién | Cómo cierra los derechos | Fuente |
| --- | --- | --- | --- |
| YouTube | Nada al fan; el **titular** monetiza el vídeo del fan vía Content ID (>90 % de reclamaciones se monetizan, no se bloquean) | Licencias con majors, editoriales y SGAE; el uploader no cobra por música ajena | [Content ID](https://support.google.com/youtube/answer/6013276), [informe de transparencia](https://transparencyreport.google.com/youtube-copyright) |
| TikTok / Instagram | Nada al fan; anuncios | Licencias globales (UMG 2024/2026, ICE 2020, SGAE declara licencias con Google, Meta y TikTok). Las **cuentas de empresa no pueden usar la librería general** | [TikTok-UMG](https://newsroom.tiktok.com/universal-music-group-and-tiktok-announce-new-global-licensing-agreement), [SGAE derechos digitales](https://www.sgae.es/noticia/un-638-mas-en-derechos-digitales/) |
| nugs.net | Fan: 14,99 $/mes o 149,99 $/año; PPV aparte | Acuerdo directo con cada artista/sello; solo entran en suscripción los shows con derechos cerrados | [nugs help](https://help.nugs.net/support/solutions/articles/6000276165), [about](https://www.nugs.net/about-us.html) |
| Veeps (Live Nation) | Fan: 10-15 $/stream; All Access 11,99 $/mes | El artista produce y licencia su propio stream | [MBW](https://www.musicbusinessworldwide.com/live-nation-backed-veeps-launches-all-access-video-streaming-subscription-service-for-live-concerts/) |
| setlist.fm / Bandsintown / Songkick | Nada al fan; afiliación de entradas y promoción a promotores | Solo datos, sin audio ni vídeo. API de setlist.fm **gratis solo para uso no comercial** | [api.setlist.fm](https://api.setlist.fm/), [términos](https://www.setlist.fm/help/api-terms) |
| Sportograf / MarathonFoto | Al asistente: pack de todas sus fotos ≈ 35 $; una foto gratis | El fotógrafo es titular único | [Sportograf](https://helpdesk.sportograf.com/en/support/solutions/articles/77000354595) |
| Gigs (2026) | Fan: 2,99 $/mes por archivo propio ilimitado | Archivo privado del propio fan, sin redistribuir | [TechCrunch](https://techcrunch.com/2026/04/17/gigs-turns-your-concert-history-into-a-personal-live-music-archive/) |
| Switchcam, Vyclone, Lively, Crowdmix, CrowdFlik, Mandolin, Bandsintown PLUS, Moment House | Gratis con VC, o de pago al fan | Sin licencias claras o sin demanda. **Todas cerradas o absorbidas** | [Switchcam](https://techcrunch.com/2014/05/16/switchcam-facebook), [Vyclone](https://techcrunch.com/2016/07/07/vyclone-hits-the-deadpool), [Lively](https://www.hypebot.com/lively-runs-out-of-money-suddenly-shuts-down/), [Mandolin](https://www.musicbusinessworldwide.com/less-than-2-years-after-closing-a-12m-funding-round-livestreaming-platform-mandolin-shutters), [Bandsintown PLUS](https://www.billboard.com/pro/bandsintown-plus-subscription-service-livestream-concerts/) |

Lección: **el vídeo de fan en abierto solo es legal en YouTube/TikTok porque pagan licencias globales y el titular monetiza; Live Space no las hereda.** Lo que la gente sí paga es *su* archivo (Gigs) y *el recuerdo del evento al que fue* (Sportograf), y los conciertos oficiales cuando el artista está dentro (nugs, Veeps).

### 2.3 Variantes que funcionan

| Variante | Derechos | Play | Veredicto |
| --- | --- | --- | --- |
| A. Suscripción para ver conciertos enteros de cualquier artista (idea original) | Fijación no autorizada + obra sin licencia; PSCCL con fin lucrativo; art. 7.6 LO 1/1982 | Play Billing 15 % | **No** |
| B. Clips sueltos gratis; **«Concierto completo» solo si el artista ha autorizado por escrito** y cobra el 50 % | Cierra intérpretes (106-108.1); queda SGAE (15 % o 0,60 €/suscriptor, mínimo 340,77 €/mes) y la remuneración AIE del 108.3 | Compra única por concierto (3,99 €) o incluido en Fan Plus | **Sí, fase 3**, cuando existan conciertos con 30+ clips y artistas reclamados |
| C. Fan Plus: HD, descarga, archivo, Wrapped, «Mi noche» (solo lo que subiste tú) | Solo capa del fan | Play Billing / RevenueCat | **Sí, fase 2** |
| D. Aftermovie oficial del concierto (montaje con los clips, licencia de los fans ya lo permite al artista/sala) | El artista/sala ya tiene licencia de reutilización de cada fan; la obra musical en redes la cubren las licencias de Instagram/TikTok | Servicio al artista, no al fan: incluido en Pro o 29 € por aftermovie | **Sí, fase 3**; es un argumento de venta para reclamar el perfil |
| E. Vender a fans la descarga de clips de otros | El autor del clip debería cobrar (su capa) y siguen faltando las otras dos | Play Billing | **No** |
| F. Pagar anuncios sobre el feed | Mismo problema de SGAE que A («incluya publicidad») | Ads policy | No antes de 10.000 MAU y licencia SGAE |

**Recomendación:** no cobrar al fan por ver. Mantener la subida y el visionado gratis como UGC con retirada expeditiva y canal DSA, acogerse al régimen atenuado del art. 73.7 y **documentar los «mayores esfuerzos»** (carta a SGAE pidiendo licencia, contacto con AIE, autorización escrita de cada artista que reclama su perfil). Vender «Concierto completo» solo en conciertos autorizados, repartiendo con el artista, y solo cuando haya suficiente contenido para que el mínimo SGAE (≈ 4.100 €/año) no se coma todo el margen: a 15 % de ingresos, hace falta facturar ≥ 2.272 €/mes en contenido de pago para que el mínimo deje de ser la cifra dominante.

---

## 3. Normas de Google Play que condicionan cada cobro

Verificadas hoy en el Policy Center.

1. **Play Billing obligatorio para lo digital consumido en la app**: «apps requiring or accepting payment for access to in-app features or services, including any app functionality, digital content or goods [...] must use Google Play's billing system», con ejemplos explícitos de «subscription services (music, video, service upgrades)», «app functionality or content (ad-free, new features)» y «cloud software and services (business productivity software)». No hay excepción por ser B2B ni por categoría. [Payments policy](https://support.google.com/googleplay/android-developer/answer/9858738) · [FAQ](https://support.google.com/googleplay/android-developer/answer/10281818).
2. **Excepciones literales (§3)**: bienes físicos («clothing»), servicios físicos («tickets for live events»), pagos P2P, donaciones exentas, juego. **Merch físico → Stripe, sin Google.** Si un SKU mezcla físico y digital, manda lo que pese más y cómo se anuncia. Propinas: P2P si el 100 % va al creador y no desbloquean nada.
3. **Anti-steering (§4)**: la app no puede llevar al usuario a otro método de pago con «webviews, buttons, links, messaging, advertisements, or other calls to action». **Consumption-only** está permitido («a user could log in and access content paid for somewhere else»), e incluso el texto sin enlace «Go to our website to upgrade», pero esa frase solo se admite si **nada** (ni físico) se compra en la app; con merch in-app, el caso mixto no está aclarado en la FAQ. Implicación: el Pro facturado fuera puede *mostrarse* en la app, pero el botón «Hablar con nosotros» con mailto para comprar es zona gris (§6).
4. **Comisiones (EEE, desde 30-jun-2026)**: primer 1 M$ anual **10 % + 5 % billing fee = 15 %**; suscripciones auto-renovables 10 % + 5 %; otras transacciones 20 % + 5 % (nuevas instalaciones) / 25 % + 5 % (existentes); **external web links 20 % o 15 % con programas, sin billing fee**. [Service fees](https://support.google.com/googleplay/android-developer/answer/112622) · [Blog Android Developers, jun-2026](https://android-developers.googleblog.com/2026/06/play-expanded-billing.html).
5. **Billing choice program (EEE/UK, 30-jun-2026)**: se ofrece Play Billing **junto a** un enlace web o facturación alternativa; primer 1 M$: 10 %, sin billing fee en el enlace web. Requiere desarrollador registrado como empresa, reportar transacciones en 24 h y asumir soporte y reembolsos. [Billing choice](https://support.google.com/googleplay/android-developer/answer/17161464) · [External offers](https://support.google.com/googleplay/android-developer/answer/14372887). Con Stripe ya montado, es la vía para que **fans y gestores paguen también con tarjeta** ahorrando 5 puntos, pero solo compensa con volumen (RevenueCat gratis hasta 2.500 $/mes de ingresos trazados, luego 1 %: [RevenueCat pricing](https://www.revenuecat.com/pricing)).
6. **Suscripciones**: el paywall debe mostrar precio, periodicidad, renovación automática, si es obligatoria y cómo cancelar, en idioma y moneda del usuario; prueba gratis con fecha y precio de conversión; enlace al centro de suscripciones para cancelar. [Subscriptions policy](https://support.google.com/googleplay/android-developer/answer/9900533). Sin «insistir» con cierres ocultos ni anuales presentados como mensuales.
7. **UGC**: términos aceptados antes de subir, reportar y bloquear in-app (ya existe), y «safeguards to prevent in-app monetization from encouraging objectionable user behavior». Vender acceso a UGC no está prohibido por Play; el problema es legal, no de tienda. [UGC policy](https://support.google.com/googleplay/android-developer/answer/9876937).
8. **IVA y factura**: con Play Billing Google es *merchant of record* en la UE y liquida el IVA; el comprador descarga una factura de Google con su NIF si lo introdujo antes. No hay compra B2B ni multiusuario en Play; una sala que quiere factura a su nombre se atiende mejor fuera (Stripe + factura propia). [Impuestos Play](https://support.google.com/googleplay/android-developer/answer/138000) · [Family Library no cubre in-app](https://support.google.com/googleplay/answer/7007852).
9. **RevenueCat y «comprador = perfil de artista»**: el App User ID puede ser el gestor; el *entitlement* al perfil se concede en el backend (webhook → `subject_plans`). Compartir una compra entre App User IDs es legacy: el equipo se resuelve en la BD, no en RevenueCat. [User IDs](https://www.revenuecat.com/docs/customers/user-ids) · [Restore behavior](https://www.revenuecat.com/docs/projects/restore-behavior).

| Cobro | Canal | Comisión |
| --- | --- | --- |
| Merch físico | Stripe Connect, cargo con destino | 0 % Google; Live Space 8 % del que paga Stripe |
| Fan Plus | Play Billing (RevenueCat) | 15 % (10 + 5) |
| Concierto completo | Play Billing (consumible) o Billing choice | 15 % / 10 % |
| Destacar concierto | Play Billing si se compra en la app; factura si se vende a mano | 15 % / 0 % |
| Pro artista/sala | Factura fuera de la app (consumption-only) o Play Billing | 0 % / 15 % |
| Festival | Factura | 0 % |

---

## 4. Modelo recomendado

### 4.1 Precios orientativos

| | Precio | Canal | Cuándo |
| --- | --- | --- | --- |
| Fan | 0 € | — | siempre |
| Fan Plus | 2,99 €/mes · 19,99 €/año, 7 días de prueba | Play Billing | fase 2 |
| Concierto completo (solo autorizados) | 3,99 € por concierto; incluido en Fan Plus si el artista acepta el *pool* | Play Billing | fase 3 |
| Reparto al artista | 50 % del neto tras Google y SGAE | Stripe Connect (ya tienen cuenta por el merch) | fase 3 |
| Merch en la app | 8 % (Live Space paga Stripe); 0 % en el puesto | Stripe | **ya** |
| Destacar concierto | 9,99 € / 7 días por concierto | Play Billing (gestor) | fase 2 |
| Pro sala | 29 €/mes · 290 €/año | factura, 30 días de prueba | fase 3 |
| Pro artista | 9,99 €/mes · 99 €/año | Play Billing o factura | fase 3 (solo si hay datos) |
| Festival / promotora | 300-1.500 €/edición según escenarios | factura | desde que haya uno |
| Fundadores (50 primeros, antes del 31-03-2027) | Pro sala/artista gratis hasta 30-06-2027 y −50 % después | `grant_founder_plan` ya existe | fase 1 |

### 4.2 Fases

**Fase 1 — Ahora (0 gestores, 5 clips): no cobrar, dejar listo lo que cobra solo.**
- Activar el pago de merch en la app para cualquier artista verificado (hoy el trigger lo exige Pro). Es el único ingreso sin riesgo de derechos y sin Google.
- Autorización escrita del artista al reclamar el perfil (§5). Sin eso, nada de la fase 3 existe.
- Canal DSA de notificación y retirada, motivación, punto de contacto, carta a SGAE pidiendo licencia (coste 0; es la prueba de «mayores esfuerzos»). Inscripción CNMC (preguntar al abogado si ya toca).
- Festivales: una oferta en PDF y factura; es el único B2B que paga hoy.
- Coste: Supabase Free 0 €, R2 ≈ 0 € (10 GB gratis), RevenueCat 0 €. Fijo real ≈ 0-25 €/mes si se pasa a Supabase Pro por los backups ([Supabase pricing](https://supabase.com/pricing): 25 $/mes con 100 GB de storage y 250 GB de salida; [R2](https://developers.cloudflare.com/r2/pricing/): 0,015 $/GB-mes, salida gratis).

**Fase 2 — Tracción (≥ 50 conciertos con 10+ clips, ≥ 2.000 MAU): cobrar sobre lo propio.**
- Fan Plus (archivo HD, descarga, Mi noche, Wrapped). Destacar concierto para gestores.
- Objetivo: 2 % de conversión a Fan Plus. 2.000 MAU → 40 × 2,99 € × 0,85 ≈ **100 €/mes**; 10.000 MAU → **500 €/mes**. Merch: 30 pedidos/mes × 25 € × 1,37 € netos ≈ **40 €/mes**. Destacar: 10 × 9,99 € × 0,85 ≈ **85 €/mes**.
- Coste: Supabase Pro 23 €, R2 con 10.000 clips comprimidos (~15 MB) ≈ 150 GB ≈ 2 €; con originales ≈ 600 GB ≈ 9 €; Stripe Connect 2 €/vendedor activo/mes. **Fijo ≈ 35-60 €/mes.** Se cubre con 20 Fan Plus.

**Fase 3 — Contenido denso (conciertos con 30+ clips y artistas reclamados): Concierto completo y Pro.**
- Solo con abogado y licencia SGAE firmada. Números: 100 conciertos autorizados/mes × 10 compras × 3,99 € = 3.990 € brutos → −15 % Google (599 €) → −15 % SGAE sobre bruto (599 €) → 2.792 € → 50 % artista → **≈ 1.400 €/mes para Live Space**. Si solo son 20 conciertos × 10 compras (798 €), el mínimo SGAE de 340,77 € se lleva el 43 % y queda ≈ 170 €: **por eso es fase 3 y no antes.**
- Pro sala 29 € × 20 salas = 580 €/mes (factura, sin Google). Pro artista solo si las estadísticas tienen algo que enseñar.

### 4.3 Qué NO hacer

- No cobrar al fan por ver clips de otros fans, ni por «conciertos enteros» de artistas que no han firmado.
- No poner anuncios antes de 10.000 MAU y sin licencia SGAE.
- No cobrar la subida ni limitarla con cuotas de pago.
- No vender el Pro a 14,99 € con 0 gestores: quema la lista de contactos y no hay nada detrás. El precio ancla para artistas locales está en 9,99 €; para salas, en 29 € con factura.
- No bloquear el pago in-app del merch tras el Pro: la comisión ya paga; el candado solo reduce ingresos.
- No usar la API de setlist.fm para nada comercial sin acuerdo ([términos](https://www.setlist.fm/help/api-terms)); los setlists deben venir de gestores y propuestas de fans.
- No publicitar «el concierto de X» con su nombre e imagen como reclamo de pago sin su autorización (art. 7.6 LO 1/1982).
- No mostrar un botón de pago alternativo en la app para lo digital (anti-steering) salvo dentro del Billing choice program.

---

## 5. Qué construir o cambiar en la app (prioridad descendente)

| # | Qué | Por qué | Toca |
| --- | --- | --- | --- |
| 1 | **Quitar el candado Pro del pago in-app del merch**: eliminar triggers `event_merch_in_app_requires_pro` y `merch_orders_in_app_requires_pro`; `MERCH_FEE_BPS` = 800 para todos (500 si algún día hay Pro). Quitar el chip Pro de `MerchStandEditor`. | Es el ingreso que sí funciona y hoy está bloqueado | `supabase/migrations/20261124000200_subject_plans.sql`, `src/features/merch/manage/MerchStandEditor.tsx`, `supabase/functions/_shared/stripe.ts` |
| 2 | **Autorización escrita del artista** en el flujo de reclamar perfil: casilla con texto específico (fijación, reproducción y puesta a disposición de los clips del público de sus conciertos, arts. 106-108; revocable para el futuro; opcional «participar en Concierto completo»). Guardar fecha, versión del texto, IP. El art. 23.3 LSSI equipara el soporte electrónico a la forma escrita ([LSSI](https://www.boe.es/buscar/act.php?id=BOE-A-2002-13758)); confirmar con abogado. | Sin esto no existe la fase 3 y la retirada es el único recurso | `src/pages/ClaimProfile.tsx`, `claims.service.ts`, nueva columna/tabla `subject_authorizations` |
| 3 | **Notificación y acción DSA**: formulario de retirada para titulares (sin cuenta, con motivo, obra, URL), estado de la reclamación, declaración de motivos al autor del clip, revisión humana ≤10 días, punto de contacto en Legal. Hoy solo hay «3 reportes → ocultar». | Arts. 16-17 DSA, art. 73.10-11 RDL 24/2021 | `features/community`, `docs/moderacion.md`, Admin cola de reportes (ya en plan 2) |
| 4 | **Pantalla Pro (`GestionPro.tsx`, `ProPlanView.tsx`)**: convertirla en «Tu cuenta verificada» con todo gratis + «Fundador» si aplica; quitar precio y «Hazte Pro» hasta la fase 3. Mantener `subject_plans`, `subject_is_pro()`, `grant_founder_plan` y `purchases.ts` como infraestructura. Quitar los `ProLockChip` de Estadísticas y de descarga de clips (hoy no hay nada detrás). | Con 0 gestores la pantalla de pago solo resta credibilidad | `src/pages/GestionPro.tsx`, `src/features/pro/*`, `EntityStats.tsx`, `MomentReuseControls.tsx` |
| 5 | **Textos legales**: Condiciones (sección «Lo que publicas»: el fan concede licencia sobre su grabación como productor/autor; aviso de que el artista puede pedir retirada; canal de imagen/RGPD), Licencia de los momentos (ya bien), nueva «Autorización de artistas», y en Condiciones del merch dejar claro que vende el artista. | Base de la fase 3 y de la DSA | `docs/legal/*.md` |
| 6 | **Oferta festivales**: PDF de una página + plantilla de factura; landing por festival ya existe. | Único B2B que paga hoy | `docs/landing.md`, plan 1 |
| 7 | **Fan Plus** (fase 2): RevenueCat + Play Billing vía kit compartido; entitlements `fan_plus`; descarga HD de los propios clips, «Mi noche» exportable, Wrapped ampliado. Paywall conforme a Subscriptions policy. | Primer ingreso de fans sin riesgo de derechos | `src/services/purchases.ts`, kit compartido |
| 8 | **Destacar concierto** (fase 2): consumible Play Billing para gestores, `events.featured_until`; reglas en Inicio/mapa. | Ingreso B2B sencillo y medible | `features/management`, Inicio |
| 9 | **Concierto completo** (fase 3): flag `events.full_concert_enabled` solo si todos los artistas del cartel tienen autorización; consumible por concierto; tabla de reparto y pago al artista con Stripe Connect; contrato de reparto. | Monetización del contenido con el artista dentro | nuevas tablas, `merch-*` como base de pagos |
| 10 | **Billing choice program** (fase 2-3): registrar la empresa, integrar APIs de Play, enlace web a Stripe Checkout junto a Play Billing. | Ahorra 5 puntos y permite tarjeta a gestores con factura | infra |

Qué quitar de lo hecho: el candado Pro del merch (1), el precio y el botón de compra de la pantalla Pro y los candados sin función (4). Nada más.

---

## 6. Preguntas abiertas (usuario o abogado)

**Para el usuario**
1. ¿Reparto del Concierto completo 50/50 del neto, o 70/30 a favor del artista para que firme más gente? nugs/Veeps no publican el suyo.
2. ¿Fan Plus incluye Concierto completo de los artistas que acepten un *pool* (reparto proporcional a visionados), o siempre compra única por concierto? El *pool* es más simple para el fan y más complejo de liquidar.
3. ¿Se registra Live Space como empresa (requisito del Billing choice program y de facturar a salas y festivales)? ¿Autónomo o sociedad? Afecta a IVA, Stripe Connect y a quién es el «titular» de las Condiciones ({{TITULAR}} sigue vacío).
4. ¿Se acepta la pérdida del texto «Hablar con nosotros» en la app para el Pro (anti-steering, §3.3) y se vende solo por web y correo?
5. ¿Festivales como primer cliente de pago aunque el foco sea la escena local? Es el único que paga en fase 1.

**Para el abogado (PI y digital)**
6. ¿La aceptación electrónica en la app (art. 23.3 LSSI) satisface el «por escrito» de los arts. 106-108 TRLPI para la autorización del artista? ¿Debe firmar cada músico de la banda o basta el titular del proyecto con cláusula de garantía?
7. Licencia SGAE: ¿Epígrafe 2 (streaming generalista) o negociación ad hoc para UGC? ¿Puede pedirse ya como «mayor esfuerzo» sin activar pago, o conviene esperar a la fase 3? ¿Y la remuneración irrenunciable de AIE/AISGE (art. 108.3) sobre grabaciones audiovisuales: tarifa y cuándo se devenga?
8. Art. 73.7 RDL 24/2021: ¿Live Space cuenta ya como «prestador para compartir contenidos» con 5 clips («gran número o alto nivel de audiencia»)? ¿Desde qué fecha corren los 3 años (primera disponibilidad del servicio en la UE)?
9. Ley 13/2022: ¿hay que inscribirse ya en el registro de la CNMC como servicio de intercambio de vídeos, o solo al superar un umbral de usuarios?
10. Derecho de imagen: ¿la venta de «Concierto completo» con el nombre del artista como reclamo exige, además de la autorización PI, una cesión expresa de imagen (art. 7.6 LO 1/1982)? Texto único que cubra ambas.
11. Si el artista es autor socio de SGAE, ¿puede autorizar algo de la obra directamente (art. 158: retirada parcial; art. 169: solo usos no comerciales) o toda la obra pasa por SGAE sin excepción?
12. Condiciones del merch: contrato de venta entre fan y artista con Live Space como intermediario (desistimiento, devoluciones, factura), tal y como ya pide `docs/merch.md`.
13. Market de entradas entre fans: ¿qué límites pone la ley española a la reventa (precio máximo, nominatividad, responsabilidad del intermediario) y qué hace falta para que Live Space intermedie el pago?
