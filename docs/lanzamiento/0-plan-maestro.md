# Plan de lanzamiento Live Space — salas y artistas

> **Superado el 24-nov-2026** en precios: ya no hay Pro de 14,99 € para salas y artistas. Manda [6-modelo-negocio](./6-modelo-negocio.md), sección «Decisión 24-nov».

Resumen de los 5 planes de esta carpeta (1-oferta, 2-gestion, 3-emails, 4-merch-qr, 5-onboarding-contenido).

## Lo que ya hay (y casi nadie ve)
- Generador de QR y cartel A4 por concierto: `/gestion/evento/:id/qr`. Solo lo ven los gestores, y hoy hay 0 gestores.
- /gestion: editar concierto, setlist, estadísticas de público, propuestas de concierto, merch con Stripe Connect (en código).
- Reclamar perfil (verificación manual).

## Bloqueos que solo puedes quitar tú (semana 1)
1. **Dominio propio** (p. ej. livespace.app/.es): sin él no hay email fiable (SPF/DKIM/DMARC) ni landing seria.
2. **Resend + SMTP en Supabase** con ese dominio (subdominio `mail.` para la app, `hola.` para contactos).
3. **Stripe Connect activo en producción** (secrets, webhook, funciones desplegadas): sin eso no hay pago de merch en la app ni comisión.
4. **Abogado**: texto del contacto a salas/artistas (LSSI art. 21 + RGPD art. 14), términos para gestores y licencia de clips (ocultar/descargar).
5. Supabase Pro (backups, sin pausas) antes de meter gestores.

## Decisiones de precio (propuesta)
| | Precio | Cuándo se cobra |
| --- | --- | --- |
| Fan | 0 € | nunca |
| Perfil verificado (artista/sala) | 0 € | nunca. Incluye reclamar, editar, QR, ver clips, merch pagado en el puesto |
| **Pro** | 14,99 €/mes · 149 €/año | por adelantado, en la web (Stripe Billing); la app no puede vender |
| Festival | desde 300 €/edición | factura |
| Merch pagado en la app | 8 % (5 % con Pro) | en cada pago |
| Merch pagado en el puesto | 0 % | — |
| Fundadores (50 primeros antes del 31/03/2027) | Pro gratis hasta 30/06/2027 y luego −50 % de por vida | — |

Costes fijos ≈ 60–75 €/mes → equilibrio con ~5 cuentas Pro.

## Contacto con salas y artistas
No a un envío masivo comercial (LSSI). Sí a una campaña «tu perfil ya está en Live Space, reclámalo gratis»:
- uno a uno, 20–30 a la semana;
- dirección de programación o info (sin Gmail personales ni agencias internacionales);
- sin precios en el primer correo, con baja en un clic y aviso RGPD;
- se lleva en `contact_leads` desde un panel de admin con borrador revisado por una persona.

## Fases
**Fase 1 — Perfiles listos y gestión (2 semanas, sin bloqueos)**
- «Mi perfil» para gestores (foto, bio, enlaces, géneros).
- Cancelar o aplazar un concierto, con aviso a asistentes y liberación de reservas de merch.
- Momentos por concierto: ocultar (reversible) y descargar con licencia; arreglo de descarga desde R2.
- Cola de reportes en Admin.
- Invitar al equipo.
- QR visible en la ficha del concierto para gestores, caducidad y rotación, QR fijo por sala.
- Datos: informe de perfiles listos, bios en borrador revisadas, fotos y aforo de salas.
- Enlace personal para reclamar el perfil.

**Fase 2 — Vender (tras los bloqueos 1–3)**
- Una página con la oferta y la landing `/para-salas-y-artistas` (precios + contacto).
- `subject_plans` y funciones Pro bloqueadas en la app («Hablar con nosotros», nunca un botón de pago).
- Stripe Billing: suscripción, portal y webhook.
- Emails transaccionales: reclamación aprobada, invitación al equipo, merch y fin de prueba.
- Pipeline de contacto: `/baja`, `outreach-send` con límite y panel; calentar el dominio; primeros envíos.

**Fase 3 — Producto que engancha**
- Onboarding fan v2: 4 escenas con componentes reales animados y «Pruébalo».
- Onboarding gestor: recorrido de 5 pasos en /gestion.
- Merch: modo puesto que escanea códigos con la cámara, ficha de producto con galería y tallas, stock en vivo, avisos y resumen de ventas.
- QR: formatos pantalla, story y pegatina, y estadísticas de escaneos (argumento de venta del Pro).
- Resumen semanal por email a gestores.

**Contenido (desde ya, cada semana)**
- Lunes: elegir 3–5 conciertos.
- Martes: mandar el QR a esas salas y artistas.
- Jueves a sábado: grabar y subir.
- Domingo: destacar, moderar y revisar métricas.

Objetivo a 4 semanas: 15 conciertos con 10 clips o más, y 5 salas poniendo el QR solas.
