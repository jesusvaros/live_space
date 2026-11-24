# Plan 3 · Emails y contacto con salas y artistas

## 1. Qué hay conectado hoy

| Pieza | Estado |
|---|---|
| Correos de cuenta (confirmar, contraseña, enlace mágico, cambio de email, invitación) | Plantillas propias en `supabase/templates/*.html`. En producción se pegan a mano en el Dashboard (`docs/runbooks.md`). |
| SMTP de Supabase | El runbook dice que falta poner un SMTP propio (por ejemplo Resend) antes de abrir el registro. **No he podido comprobar en el Dashboard si ya está puesto**: hay que mirarlo en Authentication → SMTP Settings. Si no lo está, se usa el de serie: pocos correos por hora y llegan tarde. |
| Proveedor de correo en el código | Ninguno: ni Resend, ni Postmark, ni SES, ni nodemailer. Ninguna edge function envía correo. |
| Correos de merch | No hay. `merch-checkout` solo pasa `customer_email` a Stripe, así que el único correo que llega es el recibo de Stripe (si está activado en Stripe). El código de recogida solo está en la app y en el aviso del móvil. |
| Dominio | No hay dominio propio. La web es `livespace-dusky.vercel.app`, y desde un `*.vercel.app` no se pueden poner SPF, DKIM ni DMARC. **Sin dominio propio no se puede enviar correo con buena entrega.** `livespace.app` y `getlivespace.com` existen pero no parecen nuestros (sus MX apuntan a otros), y `livespace.es` no responde. |
| Dirección de contacto | `VITE_CONTACT_EMAIL` no está definida en las variables de GitHub. |
| Contactos | La tabla `contact_leads` está creada (solo admins). Los 61 correos de salas y los 225 de artistas siguen pendientes de insertar con el SQL del escritorio. |

## 2. Lo legal, antes que nada

> No es asesoría legal. Antes de escribir a nadie conviene que un abogado de LSSI/RGPD revise el texto y el plan (es una consulta corta).

- **LSSI art. 21:** está prohibido enviar comunicaciones comerciales por email sin consentimiento previo o una relación contractual anterior. **Vale también para empresas** (personas jurídicas), no solo para particulares. Un envío masivo de «compra nuestro plan Pro» a salas y artistas que no nos conocen está prohibido. La AEPD sanciona en la práctica, con multas de miles a decenas de miles de euros, y una sola denuncia basta.
- **Correos de personas concretas** (`victor@`, `hugo@`, `juanjo@`, `carlos@`, los 33 de Gmail): además se aplica el RGPD. Tratamos datos personales y debemos informar de dónde los sacamos y cómo oponerse (art. 14). Base: interés legítimo, documentado.
- **Que la dirección sea pública en su web** no equivale a consentimiento para recibir publicidad.

**Opciones de menos a más riesgo:**

1. **Bajo riesgo:**
   - Que nos encuentren: perfil público de la sala o el artista ya creado, botón «¿Es tu sala? Reclámala», QR para la puerta.
   - Formulario de contacto de su propia web, teléfono, visita en persona o en un concierto.
   - Que nos presente alguien: promotoras, festivales, el propio artista a su sala.
2. **Bajo a medio:**
   - Mensaje directo por Instagram, uno a uno. La LSSI se centra en el email y los SMS, pero también hay que hacerlo con cuidado y sin automatizar.
3. **Medio** (lo que recomiendo usar, con abogado):
   - **Correo uno a uno, escrito a mano o personalizado de verdad.**
   - Va a la dirección *de programación o contacto* de la sala, con un mensaje **informativo, no comercial**: «Tu sala ya tiene perfil en Live Space con N vídeos del público de tus conciertos; puedes reclamarlo gratis y editarlo». Sin precios ni ofertas en el primer contacto.
   - Al pie: quiénes somos, de dónde sacamos el correo y un enlace de «no quiero más mensajes» que marque `do_not_contact`.
   - Un solo correo, sin secuencia de seguimientos automáticos. Si contestan, ya hay relación y se puede hablar de precios.
4. **Alto, no hacerlo:**
   - Envío masivo con plantilla comercial a toda la lista.
   - Comprar listas.
   - Escribir a los Gmail personales y a agencias internacionales (UTA, CAA, GTS…) para vender.

**Recomendación:**
- Hacer la «partida» como **campaña de reclamar perfil**: 20–30 contactos a la semana, uno a uno, empezando por salas españolas de tamaño medio con correo de programación o info.
- Artistas: solo por su management o booking español, o mejor a través de la sala.
- Precios del plan Pro solo cuando respondan o reclamen el perfil.
- Revisión de un abogado antes del primer envío.

## 3. Cómo gestionar los contactos (sobre `contact_leads`)

**Estados.** Hoy hay `found | verified | contacted | do_not_contact`. Propuesta: añadir `replied`, `claimed` y `bounced` y los campos:
- `contacted_at`, `channel` (email|instagram|form|phone|in_person), `last_message_id`;
- `opt_out_token` (aleatorio), `owner` (quién lleva el contacto);
- `priority` (por ciudad, tamaño de sala, vídeos subidos).

**Panel de admin («Contactos»):**
- Lista filtrable por estado, ciudad y prioridad.
- Cada ficha muestra los datos de la sala o el artista: vídeos, conciertos próximos, enlace a su perfil público.

**Borradores personalizados:**
- Por contacto se genera un borrador con datos reales: nombre, número de clips, último concierto y enlace para reclamar.
- Una persona lo **revisa y lo envía** con un botón: nunca en lote, nunca solo.
- Se puede usar Claude para redactarlo, siempre revisado.

**Envío:**
- Edge function `outreach-send`, solo para admins y con un contacto cada vez.
- Límite fijo: como mucho 20 al día y 1 por minuto. No se puede enviar si el estado es `do_not_contact`, `bounced` o ya `contacted`.
- Se guarda el registro del envío.

**Bajas:**
- `/baja?t=<token>` en la web pública marca `do_not_contact` sin pedir login.
- Cabeceras `List-Unsubscribe` y `List-Unsubscribe-Post`.
- Una lista de supresión global por dirección y dominio.

**Respuestas:**
- `Reply-To` a un buzón real (Google Workspace o el que se use) y se marcan a mano como `replied`.
- Más adelante, el webhook de entrada del proveedor puede pasar a `replied` solo.

**Rebotes y quejas:** el webhook del proveedor marca `bounced` y `do_not_contact`.

**Dominio:**
- Comprar el dominio definitivo.
- **Subdominio aparte para contactos**, por ejemplo `hola.<dominio>`, distinto del de transaccionales (`mail.<dominio>`), para que un problema con los contactos no afecte a los correos de cuenta y merch.
- SPF, DKIM y DMARC (empezar con `p=none` e informes, luego `quarantine`).
- **Calentamiento:** 5–10 al día la primera semana, subir poco a poco y vigilar rebotes (<2 %) y quejas (<0,1 %).

## 4. Correos del producto

**Transaccionales** (dominio `mail.`, proveedor con API):

| Flujo | Cuándo | Estado |
|---|---|---|
| Cuenta (confirmar, contraseña, enlace mágico, cambio, invitación) | Supabase Auth con SMTP propio | Plantillas hechas; falta el SMTP |
| Reclamación de perfil recibida / aprobada / rechazada | Al cambiar `entity_claims` | No existe |
| Invitación a gestionar una sala o un artista (equipo) | Al invitar | No existe |
| Merch: reserva con código y punto de recogida; pago confirmado; reserva caducada | Al reservar o pagar, desde el webhook de Stripe | No existe (solo el recibo de Stripe) |
| Merch para vendedores: pedido nuevo, resumen al final de la noche | Al reservar o al cerrar | No existe |
| Entrada guardada | **Mejor no enviarla por email**: es privada y ya hay aviso en el móvil | — |
| Borrado de cuenta confirmado | Al borrar | Revisar |

**Ciclo de vida** (con consentimiento o relación contractual, siempre con baja):
- **Salas y artistas que han reclamado su perfil** (ya son clientes, así que se les puede escribir sobre el servicio):
  - semanal: «X vídeos nuevos de tu concierto del sábado», top de clips, próximos conciertos sin cartel;
  - avisos de merch;
  - del Pro, solo información del servicio que ya usan.
- **Fans:** casilla de novedades *sin marcar* en el registro y luego como mucho un correo semanal de «conciertos de quienes sigues». Lo urgente va como aviso del móvil, no por correo.
- Preferencias por tipo de correo en Ajustes.

**Proveedor:**
- **Resend** es el más sencillo: SMTP para Supabase Auth y API para las funciones.
  - Gratis 3.000 correos al mes (100 al día); Pro unos 20 $ al mes por 50.000.
  - Plantillas en React Email, dentro del mismo repo.
- Alternativas: Postmark (muy buena entrega en transaccionales, unos 15 $ al mes por 10.000) y Amazon SES (el más barato, 0,10 $ por cada 1.000, pero más trabajo).
- Para los contactos con salas y artistas basta con el mismo Resend, en otro subdominio y con el límite de envío del punto 3. Herramientas como Lemlist o Instantly empujan a hacer secuencias automáticas, que es justo lo que hay que evitar.
- **Coste estimado:** 0 € al principio, 20 $ al mes cuando haya volumen, más unos 10–15 € al año de dominio y el buzón (Google Workspace unos 7 € al mes, o reenvío gratis con Cloudflare Email Routing).

## 5. Tareas en orden

| # | Tarea | Esfuerzo | Quién |
|---|---|---|---|
| 1 | Comprar el dominio definitivo y pasarlo a la web (`PUBLIC_SITE_URL`) **antes de imprimir los QR** | S | Usuario |
| 2 | Cuenta de Resend y verificar `mail.` y `hola.` (SPF, DKIM, DMARC `p=none`) | S | Usuario (credenciales) + yo (DNS y guía) |
| 3 | Poner el SMTP de Resend en Supabase Auth y probar los 5 correos de cuenta | S | Usuario pega las credenciales; yo pruebo |
| 4 | Buzón de respuesta y `VITE_CONTACT_EMAIL` | S | Usuario |
| 5 | Texto del primer contacto (reclamar perfil) y aviso del art. 14 → **revisión del abogado** | S | Yo redacto, abogado revisa |
| 6 | Migración de `contact_leads`: estados nuevos, token de baja, canal y fechas, supresión | S | Yo |
| 7 | Página pública `/baja` y cabeceras `List-Unsubscribe` | S | Yo |
| 8 | Edge function `outreach-send` (solo admin, uno a uno, límite fijo, bloqueo por estado) y webhook de rebotes | M | Yo |
| 9 | Panel de admin «Contactos»: lista, ficha con datos y borrador, revisar y enviar | M | Yo |
| 10 | Insertar los 286 contactos (SQL del escritorio), quitar Gmails personales y agencias internacionales, poner prioridades | S | Usuario + yo |
| 11 | Transaccionales de merch (reserva y código, pago, caducada; aviso al vendedor) | M | Yo |
| 12 | Correos de reclamación de perfil (recibida, aprobada, rechazada) e invitación al equipo | S | Yo |
| 13 | Resumen semanal para salas y artistas que han reclamado su perfil | M | Yo |
| 14 | Preferencias de correo en Ajustes y casilla de novedades en el registro | S | Yo |
| 15 | Calentar el dominio y empezar con 5–10 contactos al día, revisando métricas | S | Usuario envía, yo vigilo |

Ir con cuidado con 4 cosas:
- no hay dominio, así que nada funciona bien hasta el paso 1;
- un envío masivo comercial está prohibido por la LSSI;
- los Gmail personales y las agencias grandes se quedan fuera;
- todo envío lo revisa una persona.
