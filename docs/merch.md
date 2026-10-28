# Merch para recoger en el concierto

El público reserva y paga el merch de un concierto en la app y lo recoge esa
noche en el puesto con un código de seis caracteres. Cobra la banda o la sala;
Live Space se queda una comisión.

## Recorrido

1. **Vendedor** (artista o sala, en Gestión → Merch):
   - configura los cobros con Stripe (solo propietario o administrador del perfil);
   - crea productos con tallas y unidades (vacío = sin límite);
   - activa «Vender» en cada concierto y escribe el punto de recogida.
2. **Público**: en la ficha del concierto, «Merch del concierto» → elige tallas →
   «Reservar y pagar». Paga en Stripe Checkout y vuelve a la app al pedido
   (`/pedidos/:id`) con el código y un QR.
3. **En el puesto**: el vendedor abre «Pedidos y entrega» del concierto y pulsa
   «Entregar» en el pedido o escribe el código.

Las reservas cierran tres horas después de la hora de inicio. Sin envíos a casa
y sin consumiciones de barra.

## Piezas

| Pieza | Dónde |
| --- | --- |
| Tablas, RLS y funciones | `supabase/migrations/20261028070100_merch.sql` |
| Cuenta de cobros (Stripe Express) | `supabase/functions/merch-seller` |
| Crear pedido y sesión de pago | `supabase/functions/merch-checkout` |
| Confirmar, cancelar y devolver | `supabase/functions/merch-stripe-webhook` |
| Cliente | `src/services/merch.service.ts`, `src/features/merch/EventMerchSection.tsx`, `src/pages/MerchOrder*.tsx`, `src/pages/MerchManage.tsx` |
| Vuelta desde Stripe | `/vuelta` en la web pública → `com.livespace.app://merch?pedido=…` |

Reglas que impone la base de datos:

- `merch_create_order` reserva stock con bloqueo de fila y fija precios y
  comisión. Por comprador (serializado con un candado): tres pedidos sin pagar,
  10 unidades por pedido y 10 de cada talla entre pedidos pendientes y pagados.
  Solo la llama el servidor.
- Solo venden artistas y salas publicados que estén en el cartel o sean la sala
  del concierto. Los moderadores del perfil no ven pedidos ni entregan.
- Un pedido sin pagar devuelve el stock cuando Stripe expira la sesión (30 min)
  o si no se pudo crear.
- Nadie del cliente escribe pedidos. El comprador ve los suyos; quien gestiona
  al vendedor ve los de su puesto y entrega con `merch_collect`.
- El id de la cuenta de Stripe no se expone: el cliente solo lee
  `charges_enabled`.

Pago: cargo con destino (*destination charge*). Stripe cobra al comprador en la
cuenta de Live Space, transfiere al vendedor y retiene `application_fee_amount`.
Las comisiones de Stripe las paga la plataforma, así que `MERCH_FEE_BPS` tiene
que cubrirlas.

## Puesta en marcha (humano)

Activar pagos requiere a una persona (ver [agentes](./agentes.md)).

1. Cuenta de Stripe de Live Space con **Connect** activado (cuentas Express,
   España).
2. Secrets de las funciones en Supabase:
   - `STRIPE_SECRET_KEY` (empezar con la de prueba, `sk_test_…`);
   - `STRIPE_WEBHOOK_SECRET` y, si los eventos de Connect llegan por otro
     endpoint, `STRIPE_CONNECT_WEBHOOK_SECRET`;
   - `MERCH_FEE_BPS` (opcional, 800 = 8 %);
   - `PUBLIC_SITE_URL` (opcional, por defecto `https://livespace.pages.dev`).
3. Webhook en Stripe a
   `https://<proyecto>.supabase.co/functions/v1/merch-stripe-webhook` con
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.expired`, `checkout.session.async_payment_failed`,
   `charge.refunded` y, en eventos de cuentas conectadas, `account.updated`.
4. Aplicar la migración y desplegar `merch-seller`, `merch-checkout` y
   `merch-stripe-webhook`.
5. Publicar la web (`npm run web:prerender`) para que exista `/vuelta`.
6. Revisión legal: condiciones de venta (el vendedor es la banda o la sala; Live
   Space intermedia), devoluciones y privacidad.

## Pendiente

- Devoluciones desde la app (hoy desde el panel de Stripe).
- Avisar al vendedor de cada pedido nuevo.
- Escanear el QR del pedido con la cámara en el puesto.
