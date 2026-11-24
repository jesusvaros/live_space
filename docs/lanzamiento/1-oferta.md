# 1 · Oferta, precios y cobro

> **Superado el 24-nov-2026** en precios: ya no hay Pro de 14,99 € para salas y artistas. Manda [6-modelo-negocio](./6-modelo-negocio.md), sección «Decisión 24-nov».

Fecha: 24 nov 2026. Plan, sin cambios en el repo. ✅ existe hoy · 🟡 a medias · ❌ falta.

## 1. Inventario: qué ofrecemos hoy

### Fans (gratis)
| Función | Estado | Dónde |
| --- | --- | --- |
| Agenda por ciudad, Inicio con secciones, mapa con carteles | ✅ | `pages/Events.tsx`, `pages/Map.tsx` |
| Explorar artistas y salas, seguir, avisos locales | ✅ | `features/discover`, `features/alerts` |
| «Voy» / guardar / historial de conciertos (perfil pasaporte) | ✅ | `pages/Profile.tsx` |
| Subir fotos y vídeos colocados por canción (setlist), QR del concierto | ✅ | `pages/Upload.tsx`, `QrScanner.tsx` |
| Momentos, likes, guardar fotos, reportar, bloquear | ✅ | `features/moments`, `community` |
| Reservar merch y recogerla en el concierto (código flotante) | ✅ | `features/merch`, `live/ConcertDock` |
| Guardar tu entrada en privado | ✅ | `features/tickets` |
| Wrapped del año | ✅ | `pages/Wrapped.tsx` |
| Premium de fan | ❌ | no existe |

### Artistas y salas (gestores)
| Función | Estado | Dónde |
| --- | --- | --- |
| Reclamar perfil (verificación manual) | ✅ | `pages/ClaimProfile.tsx` |
| Editar ficha (bio, enlaces, foto) | ✅ | ajustes → Perfil |
| Crear y editar conciertos («el scraper no lo pisa») | ✅ | `pages/Management.tsx`, `CreateEvent` |
| Setlist y revisión de setlists propuestos por fans | ✅ | `SetlistEditor`, `SetlistProposalsReview` |
| **Generador de QR + cartel PNG** para el concierto | ✅ | `/gestion/evento/:id/qr` (`EventQr.tsx`, `lib/qrPoster`) |
| Estadísticas: guardados, «voy», fueron, seguidores por ciudad, tendencia | ✅ | `/gestion/estadisticas` |
| Público por concierto | ✅ básico | pestaña «Público» en Gestión |
| Tienda de merch: productos, tallas, pago en puesto o en app (Stripe Connect) | ✅ | `/gestion/merch`, funciones `merch-*` |
| Cancelar / aplazar concierto | ❌ | `events.status` existe pero no hay flujo |
| Gestionar clips del público (ocultar, descargar original, destacar) | ❌ | solo reporte de fans y admin |
| Avisar a seguidores (push/email) desde el panel | ❌ | |
| Varios gestores por perfil / invitar equipo | 🟡 | membresías en BD, sin UI de invitar |
| Plan Pro, facturación, límites | ❌ | no hay tablas ni Stripe Billing |
| Emails transaccionales (bienvenida, verificación, pedidos, avisos) | ❌ | solo el correo de Auth de serie (runbooks: falta SMTP propio, p. ej. Resend) |

### Web pública (landing)
✅ Landing de fans (`src/landing/pages/Landing.tsx`), landings de festival, fichas estáticas, sección «Salas y festivales: Pide tu QR» (botón de contacto). ❌ Página de precios / «Para artistas y salas».

## 2. Qué gana cada uno (copy de venta)

**Fan** — gratis, siempre.
- Toda la agenda de tu ciudad, en un mapa.
- Lo que grabaste, en su canción. Y lo que grabaron los demás.
- Tu merch reservada y tu entrada, a un toque en la puerta.

**Artista**
- Cada concierto tuyo, contado por tu público: clips por canción, listos para tus redes.
- Sabes quién va, de qué ciudad son y cuánta gente repite.
- Vende merch sin colas: reservan antes, recogen en el puesto.

**Sala**
- Un QR en la puerta y tu noche queda grabada desde 200 móviles.
- Tu agenda siempre al día (la importamos nosotros) y tus conciertos destacados.
- Datos de tu público: quién vuelve, de dónde viene, qué estilos llenan.

## 3. Precios y cuándo se cobra

### Planes
| Plan | Precio | Qué incluye | Cuándo se cobra |
| --- | --- | --- | --- |
| Fan | 0 € | todo lo de fans | nunca |
| Fan Premium (más adelante) | 2,99 €/mes · 19,99 €/año | sin anuncios, guardar en alta calidad, Wrapped ampliado | compra in‑app (Play Billing / StoreKit vía RevenueCat); **no** antes de tener anuncios o valor extra; nunca bloquear la subida |
| Perfil verificado (artista/sala) | 0 € | reclamar, editar ficha y conciertos, setlist, **QR y cartel**, ver clips, resumen de estadísticas, merch con **pago en el puesto** | nunca |
| **Pro** (artista o sala) | **14,99 €/mes** o **149 €/año** (2 meses gratis) | estadísticas completas y por concierto, **descargar clips originales** con licencia, **destacar** conciertos en Inicio/mapa, **avisar a seguidores**, cartel QR con su marca, varios gestores, comisión de merch rebajada | por adelantado al empezar cada periodo (Stripe Billing), tras la prueba |
| Festival / grupo de salas | desde 300 € por edición o a medida | landing de festival, QR por escenario, timetable, informe post‑evento | factura manual al cerrar el acuerdo |

### Comisión de merch
- **Pago en el puesto: 0 %.** El dinero no pasa por nosotros.
- **Pago en la app: 8 %** sin Pro, **5 %** con Pro. El código ya usa `MERCH_FEE_BPS` = 800 por defecto (`supabase/functions/_shared/stripe.ts`); en mi propuesta anterior dije 5 % para todos, pero **5 % plano no cubre bien Stripe en tickets pequeños** (Stripe paga la plataforma: ~1,5 % + 0,25 € por tarjeta UE, más Connect Express ~2 €/cuenta activa/mes y 0,25 % + 0,10 € por transferencia). Ejemplo camiseta 25 €: 8 % = 2,00 € − ~0,63 € Stripe = **1,37 € netos**; a 5 % quedarían 0,62 €.
- Se cobra **en el momento del pago** (cargo con destino: Stripe retiene `application_fee_amount`); el vendedor recibe el resto en su cuenta en 2–7 días.

### Oferta de lanzamiento (para la partida a salas y artistas)
- **Socios fundadores: los primeros 50 perfiles** (salas + artistas) que se den de alta antes del **31 mar 2027**: **Pro gratis hasta el 30 jun 2027** y después **50 % de por vida** (7,49 €/mes).
- Resto: **30 días de Pro gratis, sin tarjeta**; al acabar, vuelve a gratis si no paga (nunca se borra nada).
- Recordatorio 7 días y 1 día antes de que acabe la prueba (email + aviso en el panel).

### Costes de hosting vs ingresos (estimado, precios de lista)
| Coste | Hoy | Al lanzar |
| --- | --- | --- |
| Supabase | Free | **Pro 25 $/mes** (~23 €) — necesario para backups y sin pausas |
| Cloudflare R2 (vídeos) | 0,015 $/GB‑mes, salida gratis | 10.000 clips × ~60 MB (original + copia ligera) ≈ 600 GB ≈ **9 €/mes** |
| Web (Vercel) | Hobby | **Pro 20 $/mes** (~18 €) si es uso comercial |
| Email (Resend) | — | gratis hasta 3.000/mes; **20 $/mes** hasta 50.000 |
| Apple Developer | — | 99 $/año ≈ 8 €/mes |
| Google Play | pagado (25 $ una vez) | 0 |
| Stripe | 0 fijo | % por transacción (arriba) |
| **Total fijo** | | **≈ 60–75 €/mes** |

**Punto de equilibrio: 5 cuentas Pro** (o 3 Pro + ~40 camisetas pagadas en la app al mes). Con 50 fundadores gratis hasta junio, el coste lo cubre el bolsillo ~7 meses (≈ 500 €).

### Reglas de tiendas (importante)
- Pro es un servicio B2B: **se contrata y se paga en la web** (Stripe Checkout + portal de cliente). En la app iOS/Android se muestran las funciones Pro y su estado, pero **sin botón de compra ni enlace de pago** (Apple 3.1.1/3.1.3 y Play Payments policy). El CTA en la app es «Te escribimos» / «Hablar con nosotros» (email), que encaja con la venta 1 a 1.
- Fan Premium, si llega, tiene que ir por compra in‑app (15 % de comisión de tienda con el programa de pequeñas empresas).

### Cobro: qué hay y qué falta
- ✅ Stripe Connect Express para vendedores de merch (`merch-seller`, `merch-checkout`, `merch-stripe-webhook`).
- ❌ Stripe Billing: productos/precios Pro (mensual, anual, fundador con cupón 50 %), Checkout de suscripción, portal de cliente, webhook `customer.subscription.*`.
- ❌ Tabla `subject_plans` (subject_id, plan, status, trial_ends_at, current_period_end, stripe_customer_id, founder) + función `subject_is_pro(subject_id)` para RLS y UI.
- ❌ Página web `/pro` (precios + alta + pago) que exija sesión del gestor (magic link) para enlazar con su perfil.

## 4. Dónde se vende

### En la app (solo gestores, nunca a fans)
1. **Panel de gestión, arriba**: tarjeta de plan. Gratis → «Pro: descarga los clips de tu público y avisa a tus seguidores. **Te lo activamos**» (botón «Hablar con nosotros»). Fundador → «Socio fundador · Pro gratis hasta el 30 jun».
2. **Estadísticas**: el resumen libre; los bloques Pro (por concierto, repetidores, estilos) se ven difuminados con un candado y «Pro».
3. **Clip del público** (gestor): «Descargar original» con candado Pro.
4. **Crear/editar concierto**: interruptor «Destacar en Inicio» con candado Pro.
5. **Merch → pago en la app**: «Comisión 8 % · 5 % con Pro».
6. **Tras el primer éxito** (primer QR escaneado, primeros 10 clips): hoja «Tu público ya ha subido 10 clips. Con Pro, descárgalos en original».
Reglas: poco texto, una línea + botón; formas/iconos, sin colores nuevos; nunca más de un aviso por sesión.

### En la landing
- Nueva página **`/para-salas-y-artistas/`** (enlazada desde la sección actual «Pide tu QR» y el pie):
  1. Portada: «Tu concierto, grabado por tu público.» + botón «Quiero mi QR».
  2. Tres bloques con foto: QR y cartel · Clips por canción · Merch sin colas.
  3. Precios: Gratis / Pro 14,99 € / Festivales «Hablemos». Debajo: «Socios fundadores: Pro gratis hasta junio».
  4. FAQ corta (¿tengo que pagar para el QR? No. ¿Los clips son míos? Licencia de los fans en `/licencia-momentos/`).
  5. Formulario de contacto → `contact_leads` (o email) con origen `landing-pro`.
- La landing de fans no cambia (regla de `docs/landing.md`: genérica, poco texto).

## 5. Tareas en orden

| # | Tarea | Esfuerzo |
| --- | --- | --- |
| 1 | Cerrar números con el usuario: Pro 14,99/149, comisión 8 %/5 %, fundadores 50 hasta 31 mar | S |
| 2 | Documento de oferta (1 página PDF/Doc) para la partida de correos, con la tabla de planes | S |
| 3 | SMTP propio (Resend + dominio) — lo configura una persona; es requisito para emails de prueba/fundador | S (humano) |
| 4 | Migración `subject_plans` + `subject_is_pro()`; fundadores marcados a mano por admin | M |
| 5 | Página web `/para-salas-y-artistas/` con precios y formulario | M |
| 6 | Tarjeta de plan en Panel de gestión + candados Pro (estadísticas, descargar original, destacar) | M |
| 7 | Funciones Pro que faltan: descargar clip original, destacar concierto, avisar a seguidores | L |
| 8 | Stripe Billing: Checkout de suscripción en la web, portal, webhook → `subject_plans` | M |
| 9 | Emails de ciclo: bienvenida gestor, fin de prueba (‑7/‑1 días), recibo, fallo de pago | M |
| 10 | Bajar `MERCH_FEE_BPS` a 500 cuando `subject_is_pro` (en `merch_create_order`) | S |
| 11 | Fan Premium con RevenueCat (vía kit compartido) — después, sin muro en la subida | L |

Fuera de este plan (otros agentes): flujos de gestor para cancelar conciertos y gestionar clips, onboarding con animaciones, mejoras de la tienda de merch, emails como canal de contacto.
