# Plan 4 · Merch y generador de QR de conciertos

Este documento solo planifica: no se ha tocado código. ✅ = ya existe, ⚠️ = existe pero se queda corto, ❌ = falta.

---

## 1. QR del concierto

### Qué hay hoy

| Pieza | Estado | Dónde |
| --- | --- | --- |
| Token privado de subida por concierto | ✅ | `supabase/migrations/20261028000200_event_manager_edits.sql` (`event_upload_tokens`, `resolve_event_upload_token`) |
| URL `/upload?qr=<token>` y su lectura | ✅ | `src/lib/uploadQr.ts` |
| Generador: póster A4 en PNG, versión papel u oscura; botones Imprimir, Descargar y Compartir | ✅ | `src/pages/EventQr.tsx`, `src/lib/qrPoster.ts`, ruta `/gestion/evento/:id/qr` |
| Cómo se llega al generador | ⚠️ | Solo desde Gestión → concierto → «QR» (`src/pages/Management.tsx:326`). No aparece en la ficha del concierto ni se avisa al gestor. |
| Escáner del público («Escanear QR») | ✅ | `src/features/events/ScanConcertFab.tsx`, `src/pages/QrScanner.tsx`, `src/components/QrScanner.tsx` (jsQR) |
| Web al escanear sin la app | ✅ | `src/landing/pages/UploadHandoff.tsx` |
| Rotar el token | ⚠️ | La columna `rotated_at` existe, pero no hay función ni botón para rotarlo |
| Caducidad del token | ❌ | Funciona para siempre mientras el concierto esté publicado |
| Estadísticas de escaneos y subidas por QR | ❌ | Solo hay un evento genérico `qr_scan` en analítica (`source`, `valid`), sin `event_id` ni panel |
| Formato pantalla (16:9 para la pantalla del escenario o el VJ) | ❌ | — |
| Pegatinas o mesa (A6, varios por hoja) | ❌ | — |
| PDF vectorial para imprenta | ❌ | Solo PNG de 1240×1754 (unos 150 dpi en A4) |
| Póster con la foto o el cartel del concierto | ❌ | Solo tipografía |

**Conclusión:** el generador existe, pero está escondido y solo saca un formato. Lo que falta es convertirlo en un «kit del concierto» que el gestor encuentre solo, y medir lo que da.

### Diseño: «Kit QR del concierto»

**Quién lo crea.** Cualquier gestor del artista o de la sala del concierto (`can_manage_event`), igual que hoy. El token se crea solo al publicar el concierto (o la primera vez que se abre el kit), así el QR está listo antes de que nadie lo pida.

**Dónde aparece:**
1. En la ficha del concierto, si eres gestor: botón «QR para el público», junto a Editar y Setlist.
2. En Gestión → Conciertos: un chip en cada concierto, más visible que el texto «QR» actual.
3. Aviso (push y correo) 48 h antes del concierto: «Imprime el QR de esta noche».
4. Plantillas también en la web pública (desde el correo, sin la app), con un enlace firmado.

**Formatos del generador** (una pantalla con selector de formato y de estilo, y vista previa en vivo):

| Formato | Para qué | Salida |
| --- | --- | --- |
| Póster A4 / A3 | Puerta, baños, barra | PDF vectorial (QR en SVG) + PNG a 300 dpi |
| Pantalla 16:9 | Pantalla del escenario o del VJ, entre bandas | PNG de 1920×1080 + modo pantalla completa en la app, con brillo al máximo |
| Mesa A6 | Mesas y barra | PDF con 4 por A4 y marcas de corte |
| Pegatinas | Merch, mesa de mezclas | PDF con 12 por A4 (círculo de 6 cm) |
| Story 9:16 | Instagram de la sala o la banda antes del concierto | PNG de 1080×1920 con el cartel de fondo |

**Estilos:** papel, oscuro y «cartel», que usa la imagen del concierto (`eventCoverSources`) con el QR en una tarjeta blanca. Siempre con formas y tipografía de la marca, sin añadir colores nuevos. Siempre lleva el texto «SUBE LO QUE GRABES ESTA NOCHE» y la URL corta por si la cámara falla.

**Rotar y caducar:**
- RPC `rotate_event_upload_token(event_id)`, solo para gestores: genera un token nuevo y rellena `rotated_at`. Los QR ya impresos dejan de valer y la app avisa de que hay que reimprimir.
- Caducidad automática: el token vale desde la publicación hasta 72 h después de `ends_at` (o de `starts_at` + 6 h). Después, `/upload?qr=` abre la ficha del concierto («Este concierto ya pasó; sube igualmente desde aquí»), que sigue sirviendo y no permite subir con el token.
- «Tokens cortos» opcionales para la pantalla (un código de 6 letras que se puede teclear): `/c/AB12CD`.

**Estadísticas** (pestaña «Público» del concierto, que ya existe en `Management.tsx`):
- Nueva tabla `event_qr_scans` (event_id, at, source: `poster|screen|sticker|story|unknown`, platform, logged_in boolean). Se escribe con un RPC `log_qr_scan(token, source)` llamado desde `UploadHandoff` y desde el escáner de la app, sin datos personales.
- Cada formato lleva `&src=poster|screen|…` en la URL para saber cuál funciona.
- Panel: escaneos, subidas que llegaron por QR (con `uploads.source = 'qr'`; comprobar si la columna existe y, si no, añadirla), cuentas nuevas creadas desde el QR y tasa escaneo → subida. Este es el número que vende el plan Pro a la sala.

---

## 2. Merch

### Recorrido del fan: hoy frente a una tienda buena

| Punto | Hoy | Referencia (Zara, Nike, Bandcamp) | Qué falta |
| --- | --- | --- | --- |
| Tarjeta de producto en cuadrícula | ✅ Estilo Zara, foto 3:4, «− n +» encima de la foto (`MerchItemCard.tsx`) | — | — |
| Página de producto | ❌ Todo pasa en la tarjeta | Zara y Nike: ficha a pantalla completa, galería que se desliza, descripción plegada | Hoja a pantalla completa al tocar la foto: galería, nombre, precio, tallas grandes, descripción (`merch_items.description` ya existe y no se enseña), «Añadir» |
| Varias fotos | ❌ Solo `image_url` (1 foto) | Nike enseña de 4 a 8 fotos y la prenda puesta | Tabla `merch_item_photos` (item_id, url, position) o un array `image_urls`. El formulario acepta hasta 5 |
| Guía de tallas | ❌ | Zara: «¿Cuál es mi talla?» con medidas | Campo opcional por producto (tabla de medidas: ancho y largo por talla) o una guía genérica del vendedor. Enlace «Guía de tallas» bajo los chips |
| Stock y agotado | ✅ «Agotado», tallas agotadas tachadas, «Últimas unidades» (`stockLabel` en `merchRules.ts`) | Nike: «Solo quedan 3» | Basta con mostrar el número exacto cuando quedan ≤ 5. Al agotarse en directo hay que refrescar en tiempo real (Supabase Realtime en `merch_variants`) |
| Avisar cuando vuelva | ❌ | Zara: «Avísame» | «Avísame si vuelve» en la talla agotada (push). Útil para la siguiente fecha de la gira |
| Carrito con varios productos | ✅ Barra fija «Reservar · total · unidades» (`MerchStandView.tsx`) | — | Revisar que el resumen se abra antes de confirmar (hoy va directo) |
| Pagar en la app | ⚠️ Stripe Checkout en el navegador (`supabase/functions/merch-checkout`) | Nike: Apple Pay en un toque, sin salir | Apple Pay y Google Pay ya salen en Checkout si se activan en el panel de Stripe (no hay código). Mejor: Payment Sheet nativo (`@capacitor-community/stripe`) para no saltar al navegador. Requiere `merch-checkout` → PaymentIntent |
| Pagar en el puesto | ✅ Reserva gratis + código | — | — |
| Pedido y código | ✅ `/pedidos/:id` con código, QR e instrucciones; flotante durante el concierto (`ConcertDock.tsx`) | — | Estado en vivo: «Preparando», «Listo en el puesto» y «Recogido», con Realtime en `merch_orders` |
| Cola en el puesto | ❌ | Bandcamp no lo tiene; Nike sí, al recoger en tienda | «Listo para recoger» con un push enviado por el vendedor, para no hacer cola mientras toca la banda |
| Reservar antes del concierto | ⚠️ Solo marcando «Voy» | — | Correcto por la regla de negocio; dejar el paso «Voy» en línea (ya existe) |
| Merch fuera del concierto | ❌ (sin envíos, por decisión) | Bandcamp sí envía | No: se mantiene la decisión. Sí: en el perfil del artista, «Merch en su próxima fecha» |
| Devoluciones | ❌ Se hacen desde el panel de Stripe | — | Pantalla del vendedor para devolver (ya está en «Pendiente» de `docs/merch.md`) |

### Recorrido del vendedor

| Punto | Hoy | Qué falta |
| --- | --- | --- |
| Catálogo (crear producto, tallas, stock, foto) | ✅ `manage/MerchItemForm.tsx`, `MerchItemsList.tsx` | Varias fotos, guía de tallas, duplicar producto, ordenar con arrastre |
| Activar merch en un concierto | ✅ `manage/MerchStandEditor.tsx` | «Repetir en toda la gira»: activar el mismo catálogo en varias fechas a la vez |
| Entregar en el puesto | ⚠️ Lista + «Entregar» / «Cobrar y entregar» + escribir el código a mano (`manage/MerchStandOrders.tsx`). Usa `window.confirm` | **Modo puesto**: pantalla a pantalla completa, botón grande «Escanear» con la cámara (reutilizar `src/components/QrScanner.tsx`), y al escanear una tarjeta con nombre, líneas, total y un botón «Cobrado y entregado». Sin `window.confirm`. Que funcione con varios dispositivos a la vez, con Realtime |
| Stock durante la noche | ❌ Solo cambiando el producto | En el modo puesto, «Vendido en mano»: −1 por talla para ventas sin reserva, para que el stock de la app no mienta |
| Avisos de pedidos | ❌ (está en «Pendiente») | Push y correo al vendedor: «3 reservas nuevas para esta noche» (un resumen, no uno por pedido) |
| Resumen de ventas | ⚠️ Solo `dueAtStand` (lo que falta por cobrar) | Al cerrar la noche: unidades por producto y talla, cobrado en el puesto frente a la app, comisión, no recogidos. Exportar CSV. Histórico por concierto y gira |
| Cobros (Stripe Express) | ✅ `manage/MerchPayouts.tsx`, función `merch-seller` | Mostrar el saldo y la próxima transferencia (Stripe `balance` / `payouts` vía función) y un enlace al panel Express. Requiere que un humano active Connect (ver `docs/merch.md`, «Puesta en marcha») |
| Puesta en marcha | ❌ Stripe Connect sin activar en producción | Tarea humana: cuenta de Stripe, secrets, webhook y despliegue de funciones. Bloquea el pago en la app y la comisión |

---

## 3. Tareas en orden

Esfuerzo: S = menos de medio día · M = 1–2 días · L = 3 días o más.

| # | Tarea | Esfuerzo | Por qué en este orden |
| --- | --- | --- | --- |
| 1 | Hacer visible el QR: botón «QR para el público» en la ficha para gestores y un chip en Gestión | S | El generador ya existe y nadie lo encuentra |
| 2 | Token creado al publicar + caducidad a las 72 h + RPC para rotarlo, con su botón | S | Seguridad y menos fricción |
| 3 | Formatos nuevos: pantalla 16:9 (con modo pantalla completa), story 9:16, A6 y pegatinas en PDF | M | Es lo que pide la sala; el PDF necesita `jspdf` o un SVG→PDF |
| 4 | Estilo «cartel» con la imagen del concierto | S | Hace el póster imprimible sin rediseñar |
| 5 | `event_qr_scans` + `src` por formato + panel en «Público» | M | Las cifras que venden el Pro |
| 6 | Modo puesto del vendedor con escáner de cámara y sin `window.confirm` | M | Es lo que más falla en la noche real |
| 7 | Ficha de producto a pantalla completa (galería + descripción + guía de tallas) | M | Mejora el lado del fan |
| 8 | Varias fotos por producto (migración + formulario) | M | Necesario para la ficha |
| 9 | Stock en vivo (Realtime) + «Vendido en mano» en el modo puesto | M | El stock no miente durante la noche |
| 10 | Avisos al vendedor (resumen de reservas) y al fan («listo para recoger») | M | Depende del plan de correos y avisos |
| 11 | Resumen de ventas de la noche + CSV + histórico | M | Lo que el vendedor enseña a su mánager |
| 12 | «Repetir en la gira» y duplicar producto | S | Ahorra tiempo al vendedor de gira |
| 13 | Activar Stripe Connect en producción (humano) + Apple/Google Pay en el panel | S (humano) | Desbloquea el pago en la app y la comisión |
| 14 | Payment Sheet nativo en vez de Checkout en el navegador | L | Solo después de que el pago en la app tenga uso |
| 15 | Devoluciones desde la app + saldo y transferencias en «Cobros» | M | Después de 13 |
| 16 | «Avísame si vuelve» + merch de la próxima fecha en el perfil del artista | S | Retención |

**Dependencias:**
- La 10 depende del plan de correos y avisos.
- La 13 la tiene que hacer una persona.
- La 5 se apoya en la analítica existente (`src/features/analytics`).
