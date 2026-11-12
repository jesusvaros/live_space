# Merch para recoger en el concierto

El merch vive solo en la ficha de cada concierto. Cualquiera lo ve; lo reserva
quien está marcado como que va (`event_attendance` `going` o `attended`) y lo
recoge esa noche en el puesto con un código de seis caracteres. Sin envíos,
nunca. Vende la banda o la sala; cada una elige, por concierto, cómo se paga:

| Forma de pago | Cómo funciona | Requisitos |
| --- | --- | --- |
| **Pago en el puesto** (`at_stand`) | Se reserva gratis en la app y se paga en efectivo o con tarjeta al recoger | Ninguno: funciona hoy, sin funciones desplegadas |
| **Pago en la app** (`in_app`) | Stripe Checkout al reservar; Live Space se queda una comisión | Cuenta de Stripe del vendedor con `charges_enabled` y las funciones `merch-*` desplegadas |

## Recorrido

1. **Vendedor** (artista o sala, en Gestión → Merch):
   - «Añadir producto»: foto, nombre, precio, unidades (vacío = sin límite) y,
     si tiene tallas, chips XS–XXL o tallas propias, cada una con sus unidades;
   - «Vender» en un concierto: una pantalla con el concierto, el punto de
     recogida y la forma de pago (pago en la app solo si Stripe está listo);
   - «Cobros en la app (opcional)»: alta en Stripe Express.
2. **Público**: en la ficha, «Merch del concierto» → elige talla y unidades →
   «Reservar». Sin sesión aparece la hoja de registro; si no está marcado
   «Voy», un paso «Voy al concierto» en línea. Con pago en el puesto va directo
   a su pedido (`/pedidos/:id`: código, QR, instrucciones y «Cancelar
   reserva»); con pago en la app pasa antes por Stripe Checkout.
3. **En el puesto**: «Pedidos y entrega» del concierto → «Entregar» (pagado en
   la app) o «Cobrar y entregar» (reserva: se cobra allí y queda registrada
   como pagada por su importe en `paid_cents`), o escribir el código.

Las reservas cierran tres horas después de la hora de inicio.

## Caducidad de las reservas (pago en el puesto)

Una reserva guarda su stock hasta `expires_at` =
`merch_reservation_expires_at(starts_at, ends_at)`: seis horas después del
inicio, o una hora después del final si es más tarde, nunca más de 24 h. Después,
`merch_release_expired` la pasa a `cancelled` y devuelve las unidades. No hay
cron; se libera:

- de forma perezosa: al abrir la ficha del concierto, «Mis pedidos», «Pedidos y
  entrega» y al crear cualquier reserva o pedido;
- una vez al día en `scrape-weekly.yml` («Release expired merch
  reservations», con la clave de servicio).

Mientras no se haya liberado, el vendedor aún puede entregarla. El comprador la
ve como «Caducado · no se recogió».

## Fotos de producto

La app reduce la foto a 1200 px como máximo y la guarda en WebP (JPEG si el
navegador no sabe escribir WebP), y la sube directamente al bucket público de
Supabase Storage `merch-photos`, en `<subject id del vendedor>/<uuid>.webp`.
Solo pueden escribir en esa carpeta quienes gestionan al vendedor
(`merch_photo_path_ok` → `merch_can_sell`). `merch_items.image_url` guarda la URL
pública. La migración crea el bucket y las políticas; si en producción el rol
de migraciones no pudiera crear políticas en `storage.objects`, la migración
solo avisa (*warning*) y habría que crearlas a mano desde el SQL Editor con el
mismo texto que `20261110050300_merch_photos_bucket.sql`. Sin foto también se
puede guardar el producto.

## Piezas

| Pieza | Dónde |
| --- | --- |
| Tablas, RLS y funciones | `supabase/migrations/20261028070100_merch.sql` |
| Pago en el puesto, caducidad, límites | `20261110050100_merch_reserved_status.sql`, `20261110050200_merch_pay_at_stand.sql` |
| Bucket de fotos | `20261110050300_merch_photos_bucket.sql` |
| Cuenta de cobros (Stripe Express) | `supabase/functions/merch-seller` |
| Crear pedido y sesión de pago | `supabase/functions/merch-checkout` |
| Confirmar, cancelar y devolver | `supabase/functions/merch-stripe-webhook` |
| Reglas en TS (carrito, stock, precio, formulario) | `src/features/merch/merchRules.ts` (+ tests) |
| Cliente | `src/services/merch.service.ts`, `src/features/merch/*`, `src/features/merch/manage/*`, `src/pages/MerchOrder*.tsx`, `src/pages/MerchManage.tsx` |
| Pantallas con datos inventados (solo dev) | `/dev/merch?vista=` `formulario`, `concierto` o `pedido` |
| Vuelta desde Stripe | `/vuelta` en la web pública → `com.livespace.app://merch?pedido=…` |

Reglas que impone la base de datos:

- `merch_reserve` (pago en el puesto, la llama el comprador) y
  `merch_create_order` (pago en la app, solo el servidor) reservan stock con
  bloqueo de fila y fijan precios. Las dos exigen que el comprador vaya al
  concierto y que el puesto use esa forma de pago. Por comprador (serializado
  con un candado): tres pedidos o reservas sin pagar, 10 unidades por pedido y
  10 de cada talla entre pendientes, reservadas y pagadas.
- La reserva no lleva comisión (`fee_cents = 0`): el dinero no pasa por Live
  Space.
- `merch_cancel_reservation`: el comprador cancela su reserva antes de recogerla
  y devuelve el stock.
- Solo venden artistas y salas publicados que estén en el cartel o sean la sala
  del concierto. Los moderadores del perfil no ven pedidos ni entregan.
- Un pedido de pago en la app sin pagar devuelve el stock cuando Stripe expira
  la sesión (30 min) o si no se pudo crear.
- Nadie del cliente escribe pedidos directamente. El comprador ve los suyos;
  quien gestiona al vendedor ve los de su puesto y entrega con `merch_collect`.
- El id de la cuenta de Stripe no se expone: el cliente solo lee
  `charges_enabled`.
- Si la migración aún no está aplicada, la app oculta «Pago en el puesto» y lee
  las columnas antiguas.

Pago: cargo con destino (*destination charge*). Stripe cobra al comprador en la
cuenta de Live Space, transfiere al vendedor y retiene `application_fee_amount`.
Las comisiones de Stripe las paga la plataforma, así que `MERCH_FEE_BPS` tiene
que cubrirlas.

## Puesta en marcha del pago en la app (humano)

El pago en el puesto no necesita nada de esto. Activar pagos en la app requiere a una persona (ver [agentes](./agentes.md)).

1. Cuenta de Stripe de Live Space con **Connect** activado (cuentas Express,
   España).
2. Secrets de las funciones en Supabase:
   - `STRIPE_SECRET_KEY` (empezar con la de prueba, `sk_test_…`);
   - `STRIPE_WEBHOOK_SECRET` y, si los eventos de Connect llegan por otro
     endpoint, `STRIPE_CONNECT_WEBHOOK_SECRET`;
   - `MERCH_FEE_BPS` (opcional, 800 = 8 %);
   - `PUBLIC_SITE_URL` (opcional, por defecto `https://livespace.vercel.app`;
     el mismo valor que la variable del repo, ver
     [Runbooks](./runbooks.md#web-publica-en-vercel)).
3. Webhook en Stripe a
   `https://<proyecto>.supabase.co/functions/v1/merch-stripe-webhook` con
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.expired`, `checkout.session.async_payment_failed`,
   `charge.refunded` y, en eventos de cuentas conectadas, `account.updated`.
4. Desplegar `merch-seller`, `merch-checkout` y `merch-stripe-webhook` (las
   migraciones las aplica CI al fusionar).
5. Publicar la web (`npm run web:prerender`) para que exista `/vuelta`.
6. Revisión legal: condiciones de venta (el vendedor es la banda o la sala; Live
   Space intermedia), devoluciones y privacidad.

## Pendiente

- Devoluciones desde la app (hoy desde el panel de Stripe).
- Avisar al vendedor de cada pedido nuevo.
- Escanear el QR del pedido con la cámara en el puesto.
- Comprimir la foto en el servidor (hoy solo en el cliente) y borrar del bucket
  las fotos que ya no usa ningún producto.
