# 8 · Referidos de entradas

Qué ticketeras pagan por las ventas que les manda Live Space. Búsqueda web del 25-nov-2026, sin darse de alta en nada. Los números entre paréntesis son conciertos futuros del catálogo que enlazan a cada una.

El botón «Entradas» de cada concierto pasa por `src/features/tickets/ticketLink.ts`. Cuando haya un programa firmado, se añade su entrada en `REFERRALS`: `params` si basta un parámetro en la URL, o `wrap` si la red exige su redirección (Awin e Impact la exigen). Los toques se miden con `ticket_tap` (vendedor, sin URL).

| Vendedor | Programa | Comisión | Cookie | Enlace | Alta |
| --- | --- | --- | --- | --- | --- |
| DICE (114) | No hay programa público; «Partners» es para salas y promotores | — | — | — | Acuerdo directo con su equipo |
| Moving Tickets (46) | No encontrado | — | — | — | — |
| Onebox (41) | Sin afiliados; canales B2B que abre cada promotor por evento | Sin publicar | — | — | Acuerdo con cada promotor |
| **entradas.com (40)** | **Awin, programa 24761** | **2 % sin IVA** (no fútbol de liga ni Kings League) | 30 días | Redirección Awin (`cread.php?awinmid=24761&awinaffid=<ID>&ued=<url>`) | [Awin](https://ui.awin.com/merchant-profile/24761) |
| Entradium, Enterticket, Notikumi, Mutick, Ticketandroll | No encontrado | — | — | — | — |
| **Fever (10)** | **Impact**; admite apps expresamente | Sin publicar para España (terceros: 6–10 %) | Sin confirmar (1 o 30 días) | Redirección Impact (`?u=<url>`) | [Fever affiliate](https://business.feverup.com/en/partner-programs/affiliate-program/) |
| Ticketmaster ES | Impact (global) | Sin publicar | — | Redirección Impact | [Ticketmaster](https://developer.ticketmaster.com/partners/distribution-partners/affiliate-sign-up); hay fuentes que lo dan por inactivo en España |
| Eventbrite | Sin programa por venta de entradas | — | — | — | — |

Awin valida la venta cuando ya se ha celebrado el concierto, paga a 60 días, con un mínimo de 20 €; el alta pide un depósito de 1 € que se devuelve.

## Orden recomendado

1. **entradas.com en Awin.** Único con condiciones públicas. Comisión baja y cobro tarde. Preguntar al manager si acepta enlaces desde una app (sus condiciones dicen que las redes sociales pasen por la web del afiliado).
2. **Fever en Impact.** Acepta apps; pocos conciertos hoy.
3. **DICE, acuerdo directo.** Es la que más conciertos trae y no tiene programa: proponer referidos o API a su equipo de partners. Decisión comercial del dueño.

Moving Tickets, Onebox y las pequeñas solo darían algo con acuerdos con cada sala o promotor.

## Qué hace el dueño

- Alta de editor en Awin ([publisher-signup](https://ui.awin.com/publisher-signup)) como autónomo (NIF, IBAN, depósito de 1 €), con la web y la ficha de Play como canales; pedir el programa 24761.
- Cuenta de partner en Impact desde «Apply now» de Fever; opcionalmente, el programa de Ticketmaster.
- Con el ID de afiliado de cada red, se rellena `REFERRALS`.

Sin verificar: si Awin e Impact aceptan a un autónomo sin sociedad y qué tráfico mínimo piden.
